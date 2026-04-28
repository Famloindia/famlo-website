import { NextResponse } from "next/server";

import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("relation") ||
    lower.includes("null value") ||
    lower.includes("violates")
  );
}

function resolveNextKycStatus(existingStatus: unknown, hasDocument: boolean): string {
  const current = typeof existingStatus === "string" ? existingStatus.trim() : "";

  if (!hasDocument) {
    if (current === "verified" || current === "auto_verified" || current === "pending" || current === "rejected") {
      return current;
    }
    return "not_started";
  }

  if (current === "verified" || current === "auto_verified") {
    return current;
  }

  return "pending";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const {
      userId,
      email,
      phone,
      name,
      city,
      state,
      about,
      dob,
      gender,
      avatarUrl,
      idDocumentUrl,
      idDocumentType,
    } = (await request.json()) as Record<string, unknown>;

    if (
      typeof name !== "string" ||
      typeof city !== "string" ||
      typeof state !== "string" ||
      typeof about !== "string" ||
      typeof dob !== "string" ||
      typeof gender !== "string"
    ) {
      return NextResponse.json({ error: "Missing required verification fields." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (typeof userId === "string" && userId.trim().length > 0 && userId !== authUser.id) {
      return NextResponse.json({ error: "You can only submit your own verification." }, { status: 403 });
    }
    const effectiveUserId = authUser.id;
    const now = new Date().toISOString();
    const cleanIdDocumentUrl = typeof idDocumentUrl === "string" ? idDocumentUrl.trim() : "";
    const cleanIdDocumentType =
      typeof idDocumentType === "string" && idDocumentType.trim().length > 0
        ? idDocumentType.trim()
        : "aadhaar_face_match";

    let existingUser: Record<string, unknown> | null = null;
    const { data: selectedUser, error: existingUserError } = await supabase
      .from("users")
      .select("id,email,phone,role,auth_provider,kyc_status")
      .eq("id", effectiveUserId)
      .maybeSingle();

    if (existingUserError) {
      if (!isSchemaCompatibilityError(existingUserError.message)) {
        throw existingUserError;
      }
    } else {
      existingUser = (selectedUser as Record<string, unknown> | null) ?? null;
    }

    const nextKycStatus = resolveNextKycStatus(existingUser?.kyc_status, Boolean(cleanIdDocumentUrl));

    const userPatch = {
      name: name.trim(),
      city: city.trim(),
      state: state.trim(),
      about: about.trim(),
      date_of_birth: dob.trim(),
      gender: gender.trim(),
      avatar_url: typeof avatarUrl === "string" && avatarUrl.trim().length > 0 ? avatarUrl.trim() : null,
      id_document_url: cleanIdDocumentUrl || null,
      id_document_type: cleanIdDocumentUrl ? cleanIdDocumentType : null,
      verification_url: cleanIdDocumentUrl || null,
      verification_type: cleanIdDocumentUrl ? cleanIdDocumentType : null,
      onboarding_completed: true,
      kyc_status: nextKycStatus,
      kyc_submitted_at: cleanIdDocumentUrl ? now : null,
      updated_at: now,
    } as const;

    const fallbackUserPatch = {
      name: name.trim(),
      city: city.trim(),
      state: state.trim(),
      about: about.trim(),
      avatar_url: typeof avatarUrl === "string" && avatarUrl.trim().length > 0 ? avatarUrl.trim() : null,
      verification_url: cleanIdDocumentUrl || null,
      verification_type: cleanIdDocumentUrl ? cleanIdDocumentType : null,
      kyc_status: nextKycStatus,
      kyc_submitted_at: cleanIdDocumentUrl ? now : null,
      updated_at: now,
    } as const;

    const userUpsertPayload = {
      id: effectiveUserId,
      email:
        typeof email === "string" && email.trim().length > 0
          ? email.trim()
          : typeof existingUser?.email === "string"
            ? existingUser.email
            : null,
      phone:
        typeof phone === "string" && phone.trim().length > 0
          ? phone.trim()
          : typeof existingUser?.phone === "string"
            ? existingUser.phone
            : null,
      role: typeof existingUser?.role === "string" ? existingUser.role : "guest",
      auth_provider: typeof existingUser?.auth_provider === "string" ? existingUser.auth_provider : "guest",
      created_at: now,
      ...userPatch,
    } as const;

    const fallbackUserUpsertPayload = {
      id: effectiveUserId,
      email:
        typeof email === "string" && email.trim().length > 0
          ? email.trim()
          : typeof existingUser?.email === "string"
            ? existingUser.email
            : null,
      phone:
        typeof phone === "string" && phone.trim().length > 0
          ? phone.trim()
          : typeof existingUser?.phone === "string"
            ? existingUser.phone
            : null,
      role: typeof existingUser?.role === "string" ? existingUser.role : "guest",
      auth_provider: typeof existingUser?.auth_provider === "string" ? existingUser.auth_provider : "guest",
      created_at: now,
      ...fallbackUserPatch,
    } as const;

    const minimalUserUpsertPayload = {
      id: effectiveUserId,
      email:
        typeof email === "string" && email.trim().length > 0
          ? email.trim()
          : typeof existingUser?.email === "string"
            ? existingUser.email
            : null,
      name: name.trim(),
      updated_at: now,
    } as const;

    let { error: userWriteError } = await supabase
      .from("users")
      .upsert(userUpsertPayload as never, { onConflict: "id" });

    if (userWriteError) {
      const canRetry = isSchemaCompatibilityError(userWriteError.message);
      if (!canRetry) throw userWriteError;

      ({ error: userWriteError } = await supabase
        .from("users")
        .upsert(fallbackUserUpsertPayload as never, { onConflict: "id" }));
    }

    if (userWriteError && isSchemaCompatibilityError(userWriteError.message)) {
      ({ error: userWriteError } = await supabase
        .from("users")
        .upsert(minimalUserUpsertPayload as never, { onConflict: "id" }));
    }

    if (userWriteError) throw userWriteError;

    const { error: profileError } = await supabase
      .from("user_profiles_v2")
      .upsert({
        user_id: effectiveUserId,
        display_name: name.trim(),
        phone: typeof phone === "string" && phone.trim().length > 0 ? phone.trim() : null,
        home_city: city.trim(),
        home_state: state.trim(),
        bio: about.trim(),
        date_of_birth: dob.trim(),
        gender: gender.trim(),
        avatar_url: typeof avatarUrl === "string" && avatarUrl.trim().length > 0 ? avatarUrl.trim() : null,
        email: typeof email === "string" && email.trim().length > 0 ? email.trim() : null,
        updated_at: now,
      } as never, { onConflict: "user_id" });

    if (profileError) {
      const isMissingTable = isSchemaCompatibilityError(profileError.message);
      if (!isMissingTable) throw profileError;
    }

    return NextResponse.json({
      success: true,
      status: nextKycStatus,
      message: cleanIdDocumentUrl ? "Verification submitted for review." : "Profile saved successfully.",
    });
  } catch (error) {
    console.error("Guest verification submission failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit verification." },
      { status: 500 }
    );
  }
}
