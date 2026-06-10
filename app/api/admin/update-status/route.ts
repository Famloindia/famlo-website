import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { approveFamilyApplication } from "@/lib/family-approval";
import { ensureHommieOverlayFromApplication } from "@/lib/hommie-bridge";
import { maskCoordinates } from "@/lib/location-utils";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";

type ApplicationType = "family" | "friend";
type ApplicationStatus = "pending" | "approved" | "rejected";

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

function generateProfileCode(prefix: "FAM" | "GUIDE"): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

async function syncHommieApplicationV2(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  legacyApplicationId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("hommie_applications_v2")
    .update(payload as never)
    .contains("payload", { legacy_application_id: legacyApplicationId });

  if (error) {
    console.error("[ApprovalAPI] Failed to sync hommie_applications_v2:", error);
  }
}

async function findExistingPublicUserByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) {
    throw error;
  }
  return (data as Record<string, unknown> | null) ?? null;
}

async function findExistingAuthUserIdByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw error;
  }

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensurePublicUser(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("users").upsert(payload as never);
  if (error) {
    throw error;
  }
}

async function ensureFamilyProfile(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  application: Record<string, unknown>,
  userId: string,
  password: string | null
): Promise<{ profileId: string | null; profileCode: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("families")
    .select("id,host_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const profileCode =
    existing && typeof existing.host_id === "string" ? existing.host_id : generateProfileCode("FAM");
  const exactLat = parseFloat(String(application.lat_exact || application.latitude || application.lat || 0)) || null;
  const exactLng = parseFloat(String(application.lng_exact || application.longitude || application.lng || 0)) || null;
  const publicCoords =
    exactLat != null && exactLng != null
      ? maskCoordinates(exactLat, exactLng, String(existing?.id || application.id || application.email || profileCode))
      : null;

  const payload: any = {
    user_id: userId,
    host_id: profileCode,
    name: application.primary_host_name || application.fullName || application.name || application.propertyName || "Famlo Stay",
    email: application.email,
    street_address: application.street_address || application.propertyAddress || application.property_address,
    city: application.cityName || application.city,
    state: application.state,
    village: application.villageName || application.village,
    country: application.country || "India",
    family_composition: application.familyComposition || application.family_composition || application.house_type,
    about: application.hostBio || application.host_bio || application.host_story || application.about_family,
    description: application.hostBio || application.host_bio || application.host_story || application.about_family,
    languages_spoken: application.languages_spoken || application.languages || application.languagesSpoken,
    famlo_experience: application.famlo_experience || application.famloExperiences || application.famloExperience,
    images: Array.isArray(application.hostGalleryPhotos)
      ? application.hostGalleryPhotos
      : Array.isArray(application.host_gallery_photos)
        ? application.host_gallery_photos
        : [],
    bathroom_type: application.bathroom_type || application.bathroomType,
    common_areas: application.common_areas || application.commonArea,
    amenities: application.amenities || application.cultural_offerings || application.amenitie,
    house_rules: application.house_rules || application.houserules || application.houseRules,

    // Bank details
    bank_account_holder_name: application.bank_account_holder_name || application.bankAccountName,
    bank_account_number: application.bank_account_number || application.bankAccountNumber,
    ifsc_code: application.ifsc_code || application.ifscCode,
    bank_name: application.bank_name || application.bankName,
    upi_id: application.upi_id || application.upiId,

    // Auth & Status
    password: password,
    host_password: password,
    host_photo_url: application.host_photo_url || application.hostPhoto || application.photo_url || null,
    host_phone: application.host_phone || application.mobileNumber || application.phone || application.mobile_number,
    lat: publicCoords?.lat || null,
    lng: publicCoords?.lng || null,
    lat_exact: exactLat,
    lng_exact: exactLng,
    rating: 4.8,
    is_verified: true,
    is_active: true,
    is_accepting: true,
    family_type: "cultural"
  };

  if (existing && typeof existing.id === "string") {
    const { error } = await supabase.from("families").update(payload as never).eq("id", existing.id);
    if (error) {
      throw error;
    }
    return { profileId: existing.id, profileCode };
  }

  const { data, error } = await supabase
    .from("families")
    .insert(payload as never)
    .select("id,host_id")
    .single();

  if (error) {
    throw error;
  }

  const profileId = typeof data.id === "string" ? data.id : null;
  const profileCodeResult = typeof data.host_id === "string" ? data.host_id : null;

  return {
    profileId: profileId,
    profileCode: profileCodeResult
  };
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

  if (existingError) {
    throw existingError;
  }

  const profileCode =
    existing && typeof existing.partner_code === "string"
      ? existing.partner_code
      : generateProfileCode("GUIDE");

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
    if (error) {
      throw error;
    }
    return { profileId: existing.id, profileCode };
  }

  const { data, error } = await supabase
    .from("hommie_profiles_v2")
    .insert(payload as never)
    .select("id,partner_code")
    .single();

  if (error) {
    throw error;
  }

  return {
    profileId: typeof data.id === "string" ? data.id : null,
    profileCode: typeof data.partner_code === "string" ? data.partner_code : null
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    applicationId?: string;
    applicationType?: ApplicationType;
    status?: ApplicationStatus;
    notes?: string;
  };

  if (!body.applicationId || !body.applicationType || !body.status) {
    return NextResponse.json({ error: "Missing application update data." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const tableName = body.applicationType === "family" ? "family_applications" : "friend_applications";

  try {
    const { data: currentApplication, error: loadError } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", body.applicationId)
      .single();

    if (loadError || !currentApplication) {
      return NextResponse.json(
        { error: loadError?.message ?? "Unable to load application." },
        { status: 500 }
      );
    }

    let credentials:
      | {
          email: string;
          user_id: string;
          password: string | null;
          account_created: boolean;
          profile_type: "family" | "friend";
          profile_id: string | null;
          profile_code: string | null;
        }
      | undefined;

    if (body.status === "approved") {
      const application = currentApplication as Record<string, unknown>;
      const email = String(application.email ?? "");

      // FETCH DRAFT DATA IF EXISTS
      let onboardingData: any = { ...application };
      if (application.onboarding_draft_id) {
        const { data: draft } = await supabase
          .from("host_onboarding_drafts")
          .select("*")
          .eq("id", application.onboarding_draft_id)
          .single();
        if (draft) {
          // Spread draft.payload to ensure deep fields like upiId, bankAccountNumber, etc. are accessible
          const payloadData = (draft.payload as Record<string, any>) || {};
          onboardingData = { ...onboardingData, ...payloadData, ...draft };
        }
      }

      if (body.applicationType === "family") {
        const approval = await approveFamilyApplication(supabase, onboardingData as Record<string, unknown>, body.notes ?? null);
        credentials = approval.credentials;

        // 3. SEND WELCOME EMAIL TO HOME HOST
        if (body.status === "approved") {
          const hostName = approval.hostName;
          const loginUrl = "https://famlo.in/partners/login";
          
          console.log(`[ApprovalAPI] Sending welcome email to: ${email} for Host: ${approval.credentials.profile_code}`);
          
          try {
            const emailRes = await sendEmail({
              to: email,
              subject: 'Welcome to the Famlo Family – Your Partner Dashboard Access',
              html: `
                <div style="font-family: sans-serif; padding: 24px; color: #0e2b57; line-height: 1.6;">
                  <h1 style="font-size: 22px; font-weight: 900; color: #165dcc;">Welcome to the Famlo Family!</h1>
                  
                  <p>Dear ${hostName},</p>
                  
                  <p>Thank you for joining Famlo! We are thrilled to welcome you as our partner and are eager to begin this journey together.</p>
                  
                  <p>Your registration through our onboarding process is complete, and your partner account is now active. You can access your personal dashboard to manage your listings and track your progress using the credentials below:</p>
                  
                  <div style="background: #f4f8ff; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 12px;"><strong>Login Link:</strong> <a href="${loginUrl}" style="color: #165dcc;">${loginUrl.replace('https://', '')}</a></p>
                    <p style="margin: 0 0 12px;"><strong>User ID:</strong> <span style="font-family: monospace; font-size: 16px; background: #fff; padding: 2px 6px; border-radius: 4px;">${approval.credentials.profile_code}</span></p>
                    <p style="margin: 0;"><strong>Password:</strong> <span style="font-family: monospace; font-size: 16px; background: #fff; padding: 2px 6px; border-radius: 4px;">${approval.credentials.password}</span></p>
                  </div>
                  
                  <p>We recommend changing your password after your first login to ensure your account remains secure. If you have any questions or need assistance getting started, please don't hesitate to reach out to our support team.</p>
                  
                  <p>We look forward to a successful partnership!</p>
                  
                  <p style="margin-top: 32px;">
                    Warm regards,<br><br>
                    <strong>Aryan Krishan</strong><br>
                    Founder, Famlo<br>
                    & Team Famlo
                  </p>
                </div>
              `
            });
            console.log(`[ApprovalAPI] Email delivery status:`, emailRes);
          } catch (emailErr) {
            console.error(`[ApprovalAPI] Email delivery CRASHED:`, emailErr);
          }
        }
      } else {
        const existingUser = await findExistingPublicUserByEmail(supabase, email);
        const existingAuthUserId = await findExistingAuthUserIdByEmail(supabase, email);

        let userId = existingUser && typeof existingUser.id === "string" ? existingUser.id : "";
        let generatedPassword: string | null = onboardingData.password || null;
        let accountCreated = false;

        if (!existingUser && existingAuthUserId) {
          userId = existingAuthUserId;
        } else if (!existingUser) {
          if (!generatedPassword) generatedPassword = generateTemporaryPassword();
          const { data, error } = await supabase.auth.admin.createUser({
            email,
            password: generatedPassword,
            email_confirm: true,
            user_metadata: {
              role: "guide",
              source: "famlo-web-admin"
            }
          });

          if (error || !data.user) {
            return NextResponse.json(
              { error: error?.message ?? "Unable to create auth user." },
              { status: 500 }
            );
          }

          userId = data.user.id;
          accountCreated = true;
        }

        if (!userId) {
          return NextResponse.json({ error: "Could not resolve user for approval." }, { status: 500 });
        }

        await ensurePublicUser(supabase, {
          id: userId,
          name: currentApplication.full_name,
          email: currentApplication.email,
          phone: currentApplication.phone,
          city: currentApplication.city,
          state: currentApplication.state,
          about: currentApplication.bio,
          avatar_url: currentApplication.photo_url ?? null,
          role: "guide",
          onboarding_completed: false
        });

        const profile = await ensureHommieProfile(supabase, {
          ...(currentApplication as Record<string, unknown>),
          partner_code: typeof onboardingData.guide_id === "string" ? onboardingData.guide_id : undefined,
          partner_password: generatedPassword,
        }, userId, generatedPassword);
        const hommieOverlay = await ensureHommieOverlayFromApplication(
          supabase,
          {
            ...(currentApplication as Record<string, unknown>),
            partner_code: profile.profileCode,
            partner_password: generatedPassword,
            legacy_city_guide_id: profile.profileId,
          },
          userId
        );

        await supabase
          .from("friend_applications")
          .update({
            approved_guide_id: hommieOverlay.profileId ?? profile.profileId
          } as never)
          .eq("id", body.applicationId);

        await syncHommieApplicationV2(supabase, body.applicationId, {
          status: "approved",
          approved_hommie_id: hommieOverlay.profileId,
          review_notes: body.notes ?? "Approved from admin console.",
          reviewed_at: new Date().toISOString()
        });

        const loginUrl = "https://famlo.in/partners/login";
        await sendEmail({
          to: email,
          subject: "Welcome to Famlo — Your hommie dashboard is ready",
          html: `
            <div style="font-family: sans-serif; padding: 24px; color: #0e2b57; line-height: 1.6;">
              <h1 style="font-size: 22px; font-weight: 900; color: #165dcc;">Welcome to the Famlo Family!</h1>
              <p>Dear ${currentApplication.full_name},</p>
              <p>Your Famlo hommie profile has been approved and your dashboard is ready.</p>
              <div style="background: #f4f8ff; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #e2e8f0;">
                <p style="margin: 0 0 12px;"><strong>Login Link:</strong> <a href="${loginUrl}" style="color: #165dcc;">${loginUrl.replace("https://", "")}</a></p>
                <p style="margin: 0 0 12px;"><strong>User ID:</strong> <span style="font-family: monospace; font-size: 16px; background: #fff; padding: 2px 6px; border-radius: 4px;">${hommieOverlay.slug ?? profile.profileCode}</span></p>
                <p style="margin: 0;"><strong>Password:</strong> <span style="font-family: monospace; font-size: 16px; background: #fff; padding: 2px 6px; border-radius: 4px;">${generatedPassword ?? "Use your existing password"}</span></p>
              </div>
              <p>Please change your password after your first login.</p>
              <p style="margin-top: 32px;">
                Warm regards,<br><br>
                <strong>Aryan Krishan</strong><br>
                Founder, Famlo<br>
                & Team Famlo
              </p>
            </div>
          `
        });

        credentials = {
          email,
          user_id: userId,
          password: generatedPassword,
          account_created: accountCreated,
          profile_type: "friend",
          profile_id: hommieOverlay.profileId ?? profile.profileId,
          profile_code: hommieOverlay.partnerCode ?? profile.profileCode ?? hommieOverlay.slug
        };
      }
    }

    const reviewNotes = body.notes?.trim() ?? "";
    const updatePayload = {
      status: body.status,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes.length > 0 ? reviewNotes : null
    };

    if (body.applicationType === "friend" && body.status !== "approved") {
      await syncHommieApplicationV2(supabase, body.applicationId, updatePayload as Record<string, unknown>);
    }

    if (!(body.applicationType === "family" && body.status === "approved")) {
      const { error: updateError } = await supabase
        .from(tableName)
        .update(updatePayload as never)
        .eq("id", body.applicationId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message ?? "Unable to update application." },
          { status: 500 }
        );
      }
    }

    if (
      body.applicationType === "family" &&
      typeof currentApplication.onboarding_draft_id === "string" &&
      currentApplication.onboarding_draft_id.length > 0
    ) {
      const nextListingStatus =
        body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : "submitted";

      if (!(body.applicationType === "family" && body.status === "approved")) {
        await supabase
          .from("host_onboarding_drafts")
          .update({
            listing_status: nextListingStatus,
            review_notes: reviewNotes.length > 0 ? reviewNotes : null,
            family_id: credentials?.profile_id ?? null
          } as never)
          .eq("id", currentApplication.onboarding_draft_id);
      }
    }

    if (body.status === "approved") {
      revalidateTag("homepage-discovery", "max");
      revalidateTag("homes-discovery", "max");
      revalidatePath("/");
      revalidatePath("/homestays");
    }

    return NextResponse.json({ ok: true, credentials: credentials ?? null });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Unable to update application.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
