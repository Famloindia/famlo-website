import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { sendApprovalCredentialsEmail } from "../../../../lib/approval-email";
import {
  getAdminCookieName,
  verifyAdminSessionToken
} from "../../../../lib/admin-auth";
import { createAdminSupabaseClient } from "../../../../lib/supabase";
import type {
  AdminApplication,
  ApprovalCredentials,
  AdminFamilyApplication,
  AdminFriendApplication,
  ApplicationKind,
  ApplicationStatus,
  AppUser,
  CityGuideProfile,
  FamilyProfile,
  FamilyApplication,
  FriendApplication
} from "../../../../lib/types";

interface UpdateStatusRequestBody {
  applicationId?: string;
  applicationType?: ApplicationKind;
  notes?: string;
  status?: ApplicationStatus | null;
}

interface UpdateStatusResponse {
  application: AdminApplication;
  credentials?: ApprovalCredentials;
}

function generateTemporaryPassword(length = 14): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () =>
    alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  ).join("");
}

function generateProfileCode(prefix: "FAM" | "GUIDE"): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

async function findExistingUserByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AppUser | null) ?? null;
}

async function findExistingAuthUserIdByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    throw error;
  }

  return (
    data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ??
    null
  );
}

function getProvisioningErrorMessage(error: unknown): string {
  const baseMessage =
    error instanceof Error ? error.message : "Unable to provision approved account.";
  const normalizedMessage = baseMessage.toLowerCase();

  if (normalizedMessage.includes("user already registered")) {
    return "This email already exists in Supabase Auth. Check whether that person already has a login, then approve again.";
  }

  if (normalizedMessage.includes("database error creating new user")) {
    return "Supabase Auth could not create the login user. This usually means your service role key is wrong, or an Auth trigger/function in Supabase is failing. Please check Authentication logs in Supabase.";
  }

  if (
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("forbidden")
  ) {
    return "Supabase rejected the admin request. Please verify SUPABASE_SERVICE_ROLE_KEY in /famlo-website/.env.local and restart the app.";
  }

  return baseMessage;
}

async function ensurePublicUser(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  user: AppUser
): Promise<void> {
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    state: user.state,
    about: user.about,
    avatar_url: user.avatar_url,
    role: user.role,
    onboarding_completed: user.onboarding_completed
  };

  const { error } = await supabase.from("users").upsert(payload as never);

  if (error) {
    throw error;
  }
}

async function ensureFamilyProfile(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  application: FamilyApplication,
  userId: string,
  password: string | null
): Promise<{ profileId: string | null; profileCode: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("families")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const profileCode =
    (existing as FamilyProfile | null)?.host_id ?? generateProfileCode("FAM");
  const payload = {
    user_id: userId,
    host_id: profileCode,
    name: application.property_name,
    village: application.village,
    city: application.village,
    state: application.state,
    description: application.about_family,
    about: application.about_family,
    max_guests: application.max_guests,
    is_verified: true,
    is_active: true,
    is_accepting: true,
    family_type: "cultural",
    languages: application.languages,
    password,
    host_password: password,
    host_phone: application.whatsapp_number || application.phone,
    google_maps_link: application.google_maps_link,
    lat: application.latitude,
    lng: application.longitude
  };

  if (existing) {
    const { error } = await supabase
      .from("families")
      .update(payload as never)
      .eq("id", (existing as FamilyProfile).id);

    if (error) {
      throw error;
    }

    return {
      profileId: (existing as FamilyProfile).id,
      profileCode
    };
  }

  const { data, error } = await supabase
    .from("families")
    .insert(payload as never)
    .select("id, host_id")
    .single();

  if (error) {
    throw error;
  }

  return {
    profileId: (data as { id: string; host_id: string | null }).id,
    profileCode: (data as { id: string; host_id: string | null }).host_id
  };
}

async function ensureGuideProfile(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  application: FriendApplication,
  userId: string,
  password: string | null
): Promise<{ profileId: string | null; profileCode: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("city_guides")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const profileCode =
    (existing as CityGuideProfile | null)?.guide_id ?? generateProfileCode("GUIDE");
  const payload = {
    user_id: userId,
    name: application.full_name,
    email: application.email,
    phone: application.phone,
    city: application.city,
    state: application.state,
    bio: application.bio,
    guide_id: profileCode,
    guide_password: password,
    is_online: false,
    is_active: true,
    is_verified: true,
    languages: application.languages,
    activities: application.interests
  };

  if (existing) {
    const { error } = await supabase
      .from("city_guides")
      .update(payload as never)
      .eq("id", (existing as CityGuideProfile).id);

    if (error) {
      throw error;
    }

    return {
      profileId: (existing as CityGuideProfile).id,
      profileCode
    };
  }

  const { data, error } = await supabase
    .from("city_guides")
    .insert(payload as never)
    .select("id, guide_id")
    .single();

  if (error) {
    throw error;
  }

  return {
    profileId: (data as { id: string; guide_id: string | null }).id,
    profileCode: (data as { id: string; guide_id: string | null }).guide_id
  };
}

async function provisionApprovedAccount(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  applicationType: ApplicationKind,
  application: FamilyApplication | FriendApplication
): Promise<ApprovalCredentials> {
  const existingUser = await findExistingUserByEmail(supabase, application.email);
  const existingAuthUserId = await findExistingAuthUserIdByEmail(
    supabase,
    application.email
  );
  let userId = existingUser?.id ?? "";
  let generatedPassword: string | null = null;
  let accountCreated = false;

  if (!existingUser && existingAuthUserId) {
    userId = existingAuthUserId;
  } else if (!existingUser) {
    generatedPassword = generateTemporaryPassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email: application.email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        role: applicationType === "family" ? "family" : "guide",
        source: "famlo-admin-approval"
      }
    });

    if (error || !data.user) {
      throw error ?? new Error("Unable to create auth user.");
    }

    userId = data.user.id;
    accountCreated = true;
  } else {
    userId = existingUser.id;
  }

  let profile: { profileId: string | null; profileCode: string | null };

  if (applicationType === "family") {
    const familyApplication = application as FamilyApplication;

    await ensurePublicUser(supabase, {
      id: userId,
      name: familyApplication.full_name,
      email: familyApplication.email,
      phone: familyApplication.phone,
      city: familyApplication.village,
      state: familyApplication.state,
      about: familyApplication.about_family,
      avatar_url: familyApplication.photo_url,
      role: "family",
      onboarding_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    profile = await ensureFamilyProfile(
      supabase,
      familyApplication,
      userId,
      generatedPassword
    );
  } else {
    const friendApplication = application as FriendApplication;

    await ensurePublicUser(supabase, {
      id: userId,
      name: friendApplication.full_name,
      email: friendApplication.email,
      phone: friendApplication.phone,
      city: friendApplication.city,
      state: friendApplication.state,
      about: friendApplication.bio,
      avatar_url: friendApplication.photo_url,
      role: "guide",
      onboarding_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    profile = await ensureGuideProfile(
      supabase,
      friendApplication,
      userId,
      generatedPassword
    );
  }

  return {
    email: application.email,
    user_id: userId,
    password: generatedPassword,
    account_created: accountCreated,
    profile_type: applicationType,
    profile_id: profile.profileId,
    profile_code: profile.profileCode
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(
      cookieStore.get(getAdminCookieName())?.value
    );

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as UpdateStatusRequestBody;

    if (!body.applicationId || !body.applicationType) {
      return NextResponse.json(
        { error: "Missing application id or type." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    let currentApplication: FamilyApplication | FriendApplication;

    try {
      if (body.applicationType === "family") {
        const { data, error } = await supabase
          .from("family_applications")
          .select("*")
          .eq("id", body.applicationId)
          .single();

        if (error) {
          throw error;
        }

        currentApplication = data as FamilyApplication;
      } else {
        const { data, error } = await supabase
          .from("friend_applications")
          .select("*")
          .eq("id", body.applicationId)
          .single();

        if (error) {
          throw error;
        }

        currentApplication = data as FriendApplication;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load application.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const nextNotes = body.notes?.trim() ?? "";
    const updatePayload: {
      review_notes: string | null;
      reviewed_at?: string | null;
      status?: ApplicationStatus;
    } = {
      review_notes: nextNotes.length > 0 ? nextNotes : null
    };

    if (body.status) {
      updatePayload.status = body.status;
      updatePayload.reviewed_at = new Date().toISOString();
    }

    let credentials: ApprovalCredentials | undefined;

    if (body.status === "approved") {
      try {
        credentials = await provisionApprovedAccount(
          supabase,
          body.applicationType,
          currentApplication
        );
        const emailResult = await sendApprovalCredentialsEmail({
          recipientName:
            body.applicationType === "family"
              ? (currentApplication as FamilyApplication).full_name
              : (currentApplication as FriendApplication).full_name,
          recipientEmail: currentApplication.email,
          applicationType: body.applicationType,
          credentials
        });
        credentials.email_sent = emailResult.sent;
        credentials.email_provider = emailResult.provider;
        credentials.email_error = emailResult.error ?? null;
      } catch (error) {
        const message = getProvisioningErrorMessage(error);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    try {
      if (body.applicationType === "family") {
        const { error: updateError } = await supabase
          .from("family_applications")
          .update(updatePayload as never)
          .eq("id", body.applicationId);

        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: updateError } = await supabase
          .from("friend_applications")
          .update(updatePayload as never)
          .eq("id", body.applicationId);

        if (updateError) {
          throw updateError;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update application.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (body.applicationType === "family") {
      const familyApplication = currentApplication as FamilyApplication;

      if (familyApplication.onboarding_draft_id) {
        const nextListingStatus =
          body.status === "approved"
            ? "approved"
            : body.status === "rejected"
              ? "rejected"
              : "submitted";

        const { error: draftUpdateError } = await supabase
          .from("host_onboarding_drafts")
          .update({
            listing_status: nextListingStatus,
            review_notes: updatePayload.review_notes,
            family_id: credentials?.profile_id ?? null
          } as never)
          .eq("id", familyApplication.onboarding_draft_id);

        if (draftUpdateError) {
          return NextResponse.json(
            { error: draftUpdateError.message },
            { status: 500 }
          );
        }
      }
    }

    try {
      let application: AdminApplication;

      if (body.applicationType === "family") {
        const { data, error: fetchError } = await supabase
          .from("family_applications")
          .select("*")
          .eq("id", body.applicationId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        application = {
          ...(data as AdminFamilyApplication),
          application_type: "family"
        };
      } else {
        const { data, error: fetchError } = await supabase
          .from("friend_applications")
          .select("*")
          .eq("id", body.applicationId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        application = {
          ...(data as AdminFriendApplication),
          application_type: "friend"
        };
      }

      const response: UpdateStatusResponse = { application };

      if (credentials) {
        response.credentials = credentials;
      }

      return NextResponse.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load application.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
