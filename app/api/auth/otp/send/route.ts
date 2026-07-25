import { NextResponse } from "next/server";
import {
  normalizeIndianOtpPhone,
  OTP_RESEND_COOLDOWN_SECONDS,
  requireTwoFactorApiKey,
} from "@/lib/auth/guest-otp";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { buildOAuthCallbackUrl } from "@/lib/site-url";

async function callTwoFactor(url: string): Promise<any> {
  const postResponse = await fetch(url, { method: "POST", cache: "no-store" });
  const postJson = await postResponse.json().catch(() => null);
  if (postResponse.ok && postJson?.Status === "Success") {
    return postJson;
  }

  const getResponse = await fetch(url, { method: "GET", cache: "no-store" });
  const getJson = await getResponse.json().catch(() => null);
  if (getResponse.ok && getJson?.Status === "Success") {
    return getJson;
  }

  throw new Error(postJson?.Details || getJson?.Details || "Failed to trigger 2Factor SMS");
}

export async function POST(request: Request) {
  try {
    const { type, value, intent } = await request.json();

    if (!value || !type) {
      return NextResponse.json({ error: "Type and value are required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    if (type === "email") {
      const emailIntent = intent === "signup" ? "signup" : "login";
      const { error } = await supabase.auth.signInWithOtp({
        email: value,
        options: {
          shouldCreateUser: emailIntent === "signup",
          emailRedirectTo: buildOAuthCallbackUrl("/")
        }
      });

      if (error) throw error;
      return NextResponse.json({ success: true, message: "Email OTP sent" });
    } 
    
    if (type === "phone") {
      const phoneIntent = intent === "signup" ? "signup" : "login";
      const cleanPhone = normalizeIndianOtpPhone(value);
      const apiKey = requireTwoFactorApiKey();
      const cooldownStart = new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000).toISOString();
      const { data: recentChallenges, error: cooldownError } = await supabase
        .from("phone_otps")
        .select("id")
        .eq("phone", cleanPhone)
        .gte("created_at", cooldownStart)
        .limit(1);

      if (cooldownError) throw cooldownError;
      if ((recentChallenges?.length ?? 0) > 0) {
        return NextResponse.json(
          { error: "Please wait before requesting another verification code." },
          { status: 429 }
        );
      }

      // Call 2Factor.in API
      const apiUrl = `https://2factor.in/API/V1/${apiKey}/SMS/${cleanPhone}/AUTOGEN`;
      const data = await callTwoFactor(apiUrl);

      const sessionId = data.Details;

      const { error } = await supabase.from("phone_otps").insert({
        phone: cleanPhone,
        otp: "2FACTOR_MANAGED",
        otp_session_id: sessionId,
        purpose: phoneIntent === "signup" ? "guest_phone_signup" : "guest_phone_login",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        verified: false
      });

      if (error) throw error;

      return NextResponse.json({ success: true, message: "Phone OTP sent", sessionId });
    }

    return NextResponse.json({ error: "Invalid auth type" }, { status: 400 });
  } catch (error: any) {
    console.error("OTP send failed", {
      name: error instanceof Error ? error.name : "Error",
      providerConfigured: Boolean(process.env.TWO_FACTOR_API_KEY),
    });
    const message =
      error instanceof Error && error.message.includes("valid Indian mobile")
        ? error.message
        : error instanceof Error && error.message.includes("temporarily unavailable")
          ? error.message
          : "Unable to send a verification code. Please try again.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
