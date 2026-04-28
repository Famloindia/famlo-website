// app/api/teams/vetting/decide/route.ts
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { approveFamilyApplication } from "@/lib/family-approval";
import { ensureHommieOverlayFromApplication } from "@/lib/hommie-bridge";
import { logAuditAction } from "@/lib/audit";
import { sendEmail } from "@/lib/resend";

type ApplicationType = "family" | "friend";

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
  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
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
    const { applicationId, applicationType, action, reason, actorId, actorRole } = await request.json();
    const supabase = createAdminSupabaseClient();
    const targetType: ApplicationType = applicationType === "friend" ? "friend" : "family";
    const tableName = targetType === "family" ? "family_applications" : "friend_applications";

    // Fetch application details
    const { data: app, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", applicationId)
      .single();

    if (error || !app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    if (app.status !== "pending") return NextResponse.json({ error: "Application not in pending state" }, { status: 400 });

    const newStatus = action === "approved" ? "approved" : "rejected";

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

    if (action === "approved") {
      if (targetType === "family") {
        const approval = await approveFamilyApplication(supabase, approvalSource, reason ?? null);
        credentials = {
          profile_code: approval.credentials.profile_code,
          password: approval.credentials.password,
        };

        await sendEmailSafely({
          to: app.email,
          subject: "Welcome to Famlo — Your partner dashboard is ready",
          html: `
            <div style="font-family: sans-serif; padding: 32px; color: #0e2b57;">
              <h1 style="font-size: 22px; font-weight: 900; color: #165dcc;">Welcome, ${approval.hostName}! 🎉</h1>
              <p>Your Famlo home-host application has been approved.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 24px 0;">
                <p style="margin: 0 0 12px;"><strong>Login URL:</strong> <a href="https://famlo.in/partners/login" style="color: #165dcc;">famlo.in/partners/login</a></p>
                <p style="margin: 0 0 12px;"><strong>User ID:</strong> ${approval.credentials.profile_code}</p>
                <p style="margin: 0;"><strong>Password:</strong> ${approval.credentials.password}</p>
              </div>
              <p>Please change your password after first login.</p>
            </div>
          `
        }, "family-approval");

        if (typeof app.onboarding_draft_id === "string" && app.onboarding_draft_id.length > 0) {
          const { error: draftSyncError } = await supabase
            .from("host_onboarding_drafts")
            .update({
              listing_status: "approved",
              review_notes: reason ?? "Approved by Famlo review team.",
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
            review_notes: reason ?? null,
            family_id: null,
          })
          .eq("id", app.onboarding_draft_id);
      }
    }

    // Log to audit trail
    await logAuditAction({
      actorId,
      actorRole,
      actionType: action === "approved" ? "approve" : "reject",
      targetUserId: applicationId,
      resourceType: targetType === "family" ? "family_application" : "friend_application",
      reason: reason ?? undefined,
      newValue: { status: newStatus }
    });

    if (action !== "approved") {
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

    if (action === "approved") {
      revalidateTag("homepage-discovery", "max");
      revalidateTag("homes-discovery", "max");
      revalidatePath("/");
      revalidatePath("/homestays");
    }

    return NextResponse.json({ success: true, status: newStatus, credentials });
  } catch (err) {
    console.error("Vetting decision failed:", err);
    const message =
      err instanceof Error
        ? err.message
        : err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Decision failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
