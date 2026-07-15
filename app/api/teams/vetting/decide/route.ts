// app/api/teams/vetting/decide/route.ts
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import {
  approveFamilyApplication,
  blockFamilyApplicationCompletely,
  provisionFamilyApplicationForProOnly,
} from "@/lib/family-approval";
import { ensureHommieOverlayFromApplication } from "@/lib/hommie-bridge";
import { logAuditAction } from "@/lib/audit";
import { sendEmail } from "@/lib/resend";
import { hasAdminPermission, resolveAdminAccessContext } from "@/lib/admin-auth";

type ApplicationType = "family" | "friend";
type VettingAction = "approved" | "rejected" | "approve_marketplace" | "not_listed_allow_pro" | "block_completely";

class VettingDecisionError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "VettingDecisionError";
    this.code = code;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : null))
    .filter((item): item is string => Boolean(item));
}

function generateTemporaryPassword(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join("");
}

function normalizeVettingAction(action: unknown): VettingAction {
  if (action === "approve_marketplace" || action === "not_listed_allow_pro" || action === "block_completely") {
    return action;
  }
  return action === "approved" ? "approved" : "rejected";
}

function generateProfileCode(prefix: "GUIDE"): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

async function sendEmailSafely(input: { to: string; subject: string; html: string }, label: string) {
  try {
    const result = await sendEmail(input);
    if (!result?.success) {
      console.error(`[VettingDecision] ${label} email failed:`, result);
    }
    return result;
  } catch (error) {
    console.error(`[VettingDecision] ${label} email crashed:`, error);
    return { success: false };
  }
}

async function findExistingPublicUserByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).limit(5);
  if (error) throw error;
  const rows = ((data as Record<string, unknown>[] | null) ?? []).filter(Boolean);
  if (rows.length > 1) {
    console.warn("[VettingDecision] duplicate public users for email", {
      email,
      rowCount: rows.length,
      userIds: rows
        .map((row) => (typeof row.id === "string" ? row.id : null))
        .filter((value): value is string => Boolean(value)),
    });
  }
  return rows[0] ?? null;
}

function sanitizeDecisionError(error: unknown): { message: string; status: number } {
  const rawMessage =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Decision failed";
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  if (/json object requested/i.test(rawMessage) || /multiple \(or no\) rows returned/i.test(rawMessage)) {
    return {
      message: "Approval failed because application data was not uniquely found. Please refresh and retry.",
      status: 409,
    };
  }

  if (code === "application_not_found") {
    return { message: "Application data missing, please refresh or inspect onboarding record.", status: 404 };
  }

  if (code === "application_not_pending") {
    return { message: "This application is no longer pending review.", status: 400 };
  }

  if (code === "application_data_missing") {
    return { message: "Application data missing, please refresh or inspect onboarding record.", status: 409 };
  }

  return { message: rawMessage, status: 500 };
}

async function findExistingAuthUserIdByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensurePublicUser(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("users").upsert(payload as never);
  if (error) throw error;
}

async function ensureHommieProfile(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  application: Record<string, unknown>,
  userId: string,
  password: string | null
): Promise<{ profileId: string | null; profileCode: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("hommie_profiles_v2")
    .select("id,partner_code")
    .or([`user_id.eq.${userId}`, application.email ? `email.eq.${String(application.email)}` : null].filter(Boolean).join(","))
    .maybeSingle();

  if (existingError) throw existingError;

  const profileCode =
    existing && typeof existing.partner_code === "string" ? existing.partner_code : generateProfileCode("GUIDE");

  const payload = {
    user_id: userId,
    legacy_city_guide_id:
      typeof application.legacy_city_guide_id === "string" ? application.legacy_city_guide_id : null,
    display_name: String(application.full_name ?? "Famlo hommie"),
    email: String(application.email ?? ""),
    phone: typeof application.phone === "string" ? application.phone : null,
    city: typeof application.city === "string" ? application.city : null,
    state: typeof application.state === "string" ? application.state : null,
    locality: typeof application.locality === "string" ? application.locality : null,
    bio: typeof application.bio === "string" ? application.bio : null,
    partner_code: profileCode,
    partner_password: password,
    is_online: false,
    is_available: true,
    is_verified: true,
    languages: Array.isArray(application.languages) ? application.languages : [],
    service_tags: Array.isArray(application.interests) ? application.interests : [],
    status: "published",
    updated_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  };

  if (existing && typeof existing.id === "string") {
    const { error } = await supabase.from("hommie_profiles_v2").update(payload as never).eq("id", existing.id);
    if (error) throw error;
    return { profileId: existing.id, profileCode };
  }

  const { data, error } = await supabase
    .from("hommie_profiles_v2")
    .insert(payload as never)
    .select("id,partner_code")
    .single();

  if (error) throw error;

  return {
    profileId: typeof data.id === "string" ? data.id : null,
    profileCode: typeof data.partner_code === "string" ? data.partner_code : null
  };
}

export async function POST(request: Request) {
  try {
    if (!(await hasAdminPermission("ops"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const access = await resolveAdminAccessContext();

    const { applicationId, applicationType, action, reason, actorId, actorRole } = await request.json();
    const decisionAction = normalizeVettingAction(action);
    const isMarketplaceApproval = decisionAction === "approved" || decisionAction === "approve_marketplace";
    const isProOnlyApproval = decisionAction === "not_listed_allow_pro";
    const isApprovalDecision = isMarketplaceApproval || isProOnlyApproval;
    const isTrustBlock = decisionAction === "block_completely";
    const supabase = createAdminSupabaseClient();
    const targetType: ApplicationType = applicationType === "friend" ? "friend" : "family";
    if (targetType !== "family" && (isProOnlyApproval || isTrustBlock)) {
      return NextResponse.json({ error: "This vetting action is only available for home hosts." }, { status: 400 });
    }
    const tableName = targetType === "family" ? "family_applications" : "friend_applications";
    const effectiveActorId =
      access?.actorId ?? (typeof actorId === "string" && actorId.trim().length > 0 ? actorId : "admin-session");
    const effectiveActorRole: "team" | "admin" =
      access?.actorRole === "team" ? "team" : actorRole === "team" ? "team" : "admin";

    // Fetch application details
    const { data: app, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();

    if (error) throw error;
    if (!app) {
      throw new VettingDecisionError("Application data missing, please refresh or inspect onboarding record.", "application_not_found");
    }

    const isIdempotentApproval = isApprovalDecision && app.status === "approved";
    if (app.status !== "pending" && !isIdempotentApproval) {
      throw new VettingDecisionError("This application is no longer pending review.", "application_not_pending");
    }

    const newStatus = isApprovalDecision ? "approved" : "rejected";

    let credentials: { profile_code: string | null; password: string | null } | null = null;
    let approvalSource: Record<string, unknown> = app as Record<string, unknown>;

    if (targetType === "family" && typeof app.onboarding_draft_id === "string" && app.onboarding_draft_id.length > 0) {
      const { data: draft } = await supabase
        .from("host_onboarding_drafts")
        .select("*")
        .eq("id", app.onboarding_draft_id)
        .maybeSingle();

      if (draft) {
        const payload = draft.payload && typeof draft.payload === "object" ? (draft.payload as Record<string, unknown>) : {};
        approvalSource = { ...(app as Record<string, unknown>), ...payload, ...(draft as Record<string, unknown>), payload };
      }
    }

    console.info("[VettingDecision] processing application", {
      applicationId,
      applicationType: targetType,
      action,
      decisionAction,
      currentStatus: app.status,
      onboardingDraftId: typeof app.onboarding_draft_id === "string" ? app.onboarding_draft_id : null,
      email: typeof app.email === "string" ? app.email : null,
    });

    if (isApprovalDecision) {
      if (targetType === "family") {
        const approval = isProOnlyApproval
          ? await provisionFamilyApplicationForProOnly(supabase, approvalSource, reason ?? null)
          : await approveFamilyApplication(supabase, approvalSource, reason ?? null);
        credentials = {
          profile_code: approval.credentials.profile_code,
          password: approval.credentials.password,
        };

        if (!isIdempotentApproval) {
          await sendEmailSafely({
            to: app.email,
            subject: isProOnlyApproval
              ? "Your Famlo Pro workspace is ready"
              : "Welcome to Famlo — Your partner dashboard is ready",
            html: `
              <div style="font-family: sans-serif; padding: 32px; color: #0e2b57;">
                <h1 style="font-size: 22px; font-weight: 900; color: #165dcc;">Welcome, ${approval.hostName}! 🎉</h1>
                <p>${
                  isProOnlyApproval
                    ? "Your property is not listed on the Famlo marketplace, but your Famlo Pro PMS + Channel Manager workspace is ready."
                    : "Your Famlo home-host application has been approved."
                }</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 24px 0;">
                  <p style="margin: 0 0 12px;"><strong>Login URL:</strong> <a href="https://famlo.in/partners/login" style="color: #165dcc;">famlo.in/partners/login</a></p>
                  <p style="margin: 0 0 12px;"><strong>User ID:</strong> ${approval.credentials.profile_code}</p>
                  <p style="margin: 0;"><strong>Password:</strong> ${approval.credentials.password}</p>
                </div>
                ${
                  isProOnlyApproval
                    ? "<p>You can buy or renew Famlo Pro from your dashboard. This does not make the property public on Famlo.</p>"
                    : ""
                }
                <p>Please change your password after first login.</p>
              </div>
            `
          }, "family-approval");
        }

        if (typeof app.onboarding_draft_id === "string" && app.onboarding_draft_id.length > 0) {
          const { error: draftSyncError } = await supabase
            .from("host_onboarding_drafts")
            .update({
              listing_status: isProOnlyApproval ? "paused" : "approved",
              property_marketplace_status: isProOnlyApproval ? "not_listed" : "approved",
              trust_status: "normal",
              review_notes: reason ?? (isProOnlyApproval
                ? "Not listed on Famlo marketplace, but allowed for Famlo Pro."
                : "Approved by Famlo review team."),
              family_id: approval.credentials.profile_id ?? null,
            })
            .eq("id", app.onboarding_draft_id);

          if (draftSyncError) {
            console.error("[VettingDecision] Family draft post-approval sync failed:", draftSyncError);
          }
        }
      } else {
        const email = String(app.email ?? "").toLowerCase();
        const existingUser = await findExistingPublicUserByEmail(supabase, email);
        const existingAuthUserId = await findExistingAuthUserIdByEmail(supabase, email);

        let userId = existingUser && typeof existingUser.id === "string" ? existingUser.id : "";
        let generatedPassword: string | null =
          typeof app.password === "string" && app.password.length > 0 ? app.password : null;
        let accountCreated = false;

        if (!existingUser && existingAuthUserId) {
          userId = existingAuthUserId;
        } else if (!existingUser) {
          if (!generatedPassword) generatedPassword = generateTemporaryPassword();
          const { data, error: createError } = await supabase.auth.admin.createUser({
            email,
            password: generatedPassword,
            email_confirm: true,
            user_metadata: {
              role: "guide",
              source: "famlo-web-teams"
            }
          });

          if (createError || !data.user) {
            return NextResponse.json(
              { error: createError?.message ?? "Unable to create hommie auth account." },
              { status: 500 }
            );
          }

          userId = data.user.id;
          accountCreated = true;
        }

        if (!userId) {
          return NextResponse.json({ error: "Could not resolve user for hommie approval." }, { status: 500 });
        }

        await ensurePublicUser(supabase, {
          id: userId,
          name: app.full_name,
          email: app.email,
          phone: app.phone,
          city: app.city,
          state: app.state,
          about: app.bio,
          avatar_url: app.photo_url ?? null,
          role: "guide",
          onboarding_completed: false
        });

        const profile = await ensureHommieProfile(supabase, {
          ...(app as Record<string, unknown>),
          partner_code: typeof app.guide_id === "string" ? app.guide_id : undefined,
          partner_password: generatedPassword,
        }, userId, generatedPassword);
        const hommieOverlay = await ensureHommieOverlayFromApplication(
          supabase,
          {
            ...(app as Record<string, unknown>),
            partner_code: profile.profileCode,
            partner_password: generatedPassword,
            legacy_city_guide_id: profile.profileId,
          },
          userId
        );

        await supabase
          .from("friend_applications")
          .update({
            status: "approved",
            approved_guide_id: hommieOverlay.profileId ?? profile.profileId,
            review_notes: reason ?? "Approved by Famlo review team.",
            reviewed_at: new Date().toISOString()
          } as never)
          .eq("id", applicationId);

        await supabase
          .from("hommie_applications_v2")
          .update({
            status: "approved",
            approved_hommie_id: hommieOverlay.profileId,
            review_notes: reason ?? "Approved by Famlo review team.",
            reviewed_at: new Date().toISOString()
          } as never)
          .contains("payload", { legacy_application_id: applicationId });

        credentials = {
          profile_code: hommieOverlay.partnerCode ?? profile.profileCode ?? hommieOverlay.slug,
          password: generatedPassword,
        };

        await sendEmailSafely({
          to: email,
          subject: "Welcome to Famlo — Your hommie dashboard is ready",
          html: `
            <div style="font-family: sans-serif; padding: 32px; color: #0e2b57;">
              <h1 style="font-size: 22px; font-weight: 900; color: #165dcc;">Welcome, ${app.full_name}! 🎉</h1>
              <p>Your Famlo hommie application has been approved.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 24px 0;">
                <p style="margin: 0 0 12px;"><strong>Login URL:</strong> <a href="https://famlo.in/partners/login" style="color: #165dcc;">famlo.in/partners/login</a></p>
                <p style="margin: 0 0 12px;"><strong>User ID:</strong> ${hommieOverlay.slug ?? profile.profileCode}</p>
                <p style="margin: 0;"><strong>Password:</strong> ${generatedPassword ?? "Use your existing password"}</p>
              </div>
              <p>Please change your password after first login.</p>
            </div>
          `
        }, "friend-approval");
      }

    } else if (isTrustBlock && targetType === "family") {
      await blockFamilyApplicationCompletely(supabase, approvalSource, reason ?? null);
    } else {
      await supabase.from(tableName).update({
        status: newStatus,
        review_notes: reason ?? null,
        reviewed_at: new Date().toISOString()
      }).eq("id", applicationId);

      if (targetType === "friend") {
        await supabase
          .from("hommie_applications_v2")
          .update({
            status: "rejected",
            review_notes: reason ?? null,
            reviewed_at: new Date().toISOString()
          } as never)
          .contains("payload", { legacy_application_id: applicationId });
      }

      if (targetType === "family" && typeof app.onboarding_draft_id === "string" && app.onboarding_draft_id.length > 0) {
        await supabase
          .from("host_onboarding_drafts")
          .update({
            listing_status: "rejected",
            property_marketplace_status: "rejected",
            trust_status: isTrustBlock ? "blocked" : "normal",
            review_notes: reason ?? null,
            family_id: null,
          })
          .eq("id", app.onboarding_draft_id);
      }
    }

    // Log to audit trail
    await logAuditAction({
      actorId: effectiveActorId,
      actorRole: effectiveActorRole,
      actionType: isApprovalDecision ? "approve" : "reject",
      targetUserId: applicationId,
      resourceType: targetType === "family" ? "family_application" : "friend_application",
      reason: reason ?? undefined,
      newValue: { status: newStatus, decisionAction }
    });

    if (!isApprovalDecision) {
      // Rejection email
      await sendEmailSafely({
        to: app.email,
        subject: targetType === "family" ? "Update on your Famlo application" : "Update on your Famlo hommie application",
        html: `
          <div style="font-family: sans-serif; padding: 32px; color: #0e2b57;">
            <h1 style="font-size: 22px; font-weight: 900;">Your application status</h1>
            <p>Dear ${app.full_name}, after review, we are unable to approve your Famlo ${targetType === "family" ? "partner" : "hommie"} application at this time.</p>
            ${reason ? `<p style="background: #f8fafc; padding: 16px; border-radius: 10px; font-style: italic;">${reason}</p>` : ""}
            <p>You are welcome to reapply after addressing the above feedback. Contact hello@famlo.in for support.</p>
          </div>
        `
      }, "rejection");
    }

    if (isApprovalDecision || isTrustBlock) {
      revalidateTag("homepage-discovery", "max");
      revalidateTag("homes-discovery", "max");
      revalidatePath("/");
      revalidatePath("/homestays");
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
      decisionAction,
      credentials,
      message: isIdempotentApproval ? "Application already approved. Dashboard access is still active." : undefined,
    });
  } catch (err) {
    console.error("Vetting decision failed:", err);
    const sanitized = sanitizeDecisionError(err);
    return NextResponse.json(
      { error: sanitized.message },
      { status: sanitized.status }
    );
  }
}
