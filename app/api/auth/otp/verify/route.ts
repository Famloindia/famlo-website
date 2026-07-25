import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  consumeOtpVerificationAttempt,
  GENERIC_OTP_ERROR,
  getOtpClientAddress,
  isUsableOtpChallenge,
  normalizeIndianOtpPhone,
  requireTwoFactorApiKey,
  verifyTwoFactorOtp,
} from "@/lib/auth/guest-otp";
import { createGuestSessionToken, getGuestCookieName, getGuestSessionMaxAge } from "@/lib/guest-auth";
import { normalizeGuestPhone } from "@/lib/guest-identity";
import { loadGuestSessionSnapshot } from "@/lib/guest-session";
import { createAdminSupabaseClient } from "@/lib/supabase";

async function findAuthUserByPhone(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  phone: string
): Promise<User | null> {
  const normalizedPhone = normalizeGuestPhone(phone);
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => normalizeGuestPhone(user.phone) === normalizedPhone);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Unable to resolve the verified account.");
}

export async function POST(request: Request) {
  try {
    const { type, value, otp, sessionId, intent } = await request.json();

    if (!value || !otp || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    if (type === "email") {
      // Supabase native email OTP verification
      const { data, error } = await supabase.auth.verifyOtp({
        email: value,
        token: otp,
        type: "signup" // Try signup first
      });

      if (error) {
        // Try login type if signup fails
        const { data: loginData, error: loginError } = await supabase.auth.verifyOtp({
          email: value,
          token: otp,
          type: "magiclink"
        });
        if (loginError) throw loginError;
        if (loginData.user?.id) {
          await loadGuestSessionSnapshot(supabase, {
            id: loginData.user.id,
            email: loginData.user.email ?? null,
            phone: loginData.user.phone ?? null,
            provider:
              typeof loginData.user.app_metadata?.provider === "string"
                ? loginData.user.app_metadata.provider
                : "email",
            authKind: "supabase",
          });
        }
        return NextResponse.json({ success: true, session: loginData.session });
      }

      if (data.user?.id) {
        await loadGuestSessionSnapshot(supabase, {
          id: data.user.id,
          email: data.user.email ?? null,
          phone: data.user.phone ?? null,
          provider:
            typeof data.user.app_metadata?.provider === "string"
              ? data.user.app_metadata.provider
              : "email",
          authKind: "supabase",
        });
      }
      return NextResponse.json({ success: true, session: data.session });
    }

    if (type === "phone") {
      const phoneIntent = intent === "signup" ? "signup" : "login";
      const expectedPurpose =
        phoneIntent === "signup" ? "guest_phone_signup" : "guest_phone_login";
      const cleanPhone = normalizeIndianOtpPhone(value);
      const cleanSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
      if (!cleanSessionId || !consumeOtpVerificationAttempt(cleanPhone, getOtpClientAddress(request))) {
        return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
      }

      const { data: challenge, error: challengeError } = await supabase
        .from("phone_otps")
        .select("id,otp_session_id,expires_at,verified,purpose")
        .eq("phone", cleanPhone)
        .eq("otp_session_id", cleanSessionId)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (challengeError || !challenge || !isUsableOtpChallenge(challenge, cleanSessionId)) {
        return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
      }
      if (
        challenge.purpose !== expectedPurpose &&
        challenge.purpose !== "guest_phone_auth"
      ) {
        return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
      }

      const apiKey = requireTwoFactorApiKey();
      await verifyTwoFactorOtp({
        apiKey,
        sessionId: cleanSessionId,
        otp: String(otp).trim(),
      });

      let authUser = await findAuthUserByPhone(supabase, cleanPhone);
      if (!authUser) {
        if (phoneIntent === "login") {
          return NextResponse.json({ error: GENERIC_OTP_ERROR }, { status: 401 });
        }
        const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
          phone: `+${cleanPhone}`,
          phone_confirm: true,
          user_metadata: {
            role: "guest",
            source: "famlo-web-phone-otp",
          },
        });
        if (createError || !createdUser.user) {
          throw new Error("Unable to create the verified account.");
        }
        authUser = createdUser.user;
      }

      const canonicalUserId = authUser.id;
      const { data: existingProfile } = await supabase
        .from("users")
        .select("id,email,name,city,state,about,date_of_birth,gender,avatar_url,onboarding_completed")
        .eq("id", canonicalUserId)
        .maybeSingle();
      const { error: upsertError } = await supabase.from("users").upsert(
        {
          id: canonicalUserId,
          phone: `+${cleanPhone}`,
          phone_verified_at: authUser.phone_confirmed_at ?? new Date().toISOString(),
          email: existingProfile?.email ?? authUser.email ?? null,
          name: existingProfile?.name ?? null,
          city: existingProfile?.city ?? null,
          state: existingProfile?.state ?? null,
          about: existingProfile?.about ?? null,
          date_of_birth: existingProfile?.date_of_birth ?? null,
          gender: existingProfile?.gender ?? null,
          avatar_url: existingProfile?.avatar_url ?? null,
          role: "guest",
          onboarding_completed: Boolean(existingProfile?.onboarding_completed),
          auth_provider: "phone",
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "id" }
      );
      if (upsertError) throw upsertError;

      const { error: consumeError } = await supabase
        .from("phone_otps")
        .update({ verified: true })
        .eq("id", challenge.id)
        .eq("verified", false);
      if (consumeError) throw consumeError;

      const response = NextResponse.json({
        success: true,
        customSession: true,
      });
      response.cookies.set(getGuestCookieName(), createGuestSessionToken(canonicalUserId, `+${cleanPhone}`), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: getGuestSessionMaxAge(),
      });
      return response;
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    console.error("OTP verification failed", {
      name: error instanceof Error ? error.name : "Error",
      providerConfigured: Boolean(process.env.TWO_FACTOR_API_KEY),
    });
    const providerUnavailable =
      error instanceof Error && error.message === "Phone verification is temporarily unavailable.";
    return NextResponse.json(
      { error: providerUnavailable ? error.message : GENERIC_OTP_ERROR },
      { status: providerUnavailable ? 503 : 401 }
    );
  }
}
