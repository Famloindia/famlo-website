import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

function normalizeHostId(input: unknown): string {
  return typeof input === "string" ? input.trim().toUpperCase() : "";
}

function normalizeIndianMobile(input: unknown): string {
  const clean = typeof input === "string" ? input.replace(/[^\d+]/g, "").trim() : "";
  if (!clean) throw new Error("Registered mobile number is required");

  const withoutPlus = clean.startsWith("+") ? clean.slice(1) : clean;
  const normalized = withoutPlus.startsWith("91") ? withoutPlus : `91${withoutPlus}`;
  if (!/^91\d{10}$/.test(normalized)) {
    throw new Error("Please enter a valid registered Indian mobile number.");
  }

  return normalized;
}

function mobileMatches(input: string, candidates: Array<string | null | undefined>): boolean {
  return candidates.some((candidate) => {
    try {
      return normalizeIndianMobile(candidate) === input;
    } catch {
      return false;
    }
  });
}

async function callTwoFactorVerify(url: string): Promise<void> {
  const postResponse = await fetch(url, { method: "POST", cache: "no-store" });
  const postJson = await postResponse.json().catch(() => null);
  if (postResponse.ok && postJson?.Status === "Success") return;

  const getResponse = await fetch(url, { method: "GET", cache: "no-store" });
  const getJson = await getResponse.json().catch(() => null);
  if (getResponse.ok && getJson?.Status === "Success") return;

  throw new Error(postJson?.Details || getJson?.Details || "Invalid verification code");
}

export async function POST(request: Request) {
  try {
    const { hostId, mobileNumber, otp, newPassword } = await request.json();
    const cleanId = normalizeHostId(hostId);
    const cleanMobile = normalizeIndianMobile(mobileNumber);
    const cleanOtp = typeof otp === "string" ? otp.trim() : "";
    const cleanPassword = typeof newPassword === "string" ? newPassword.trim() : "";

    if (!cleanId || !cleanOtp || !cleanPassword) {
      return NextResponse.json({ error: "Partner ID, mobile OTP, and new password are required" }, { status: 400 });
    }

    if (cleanPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: family, error: findError } = await supabase
      .from("families")
      .select("id,user_id,host_id,host_phone,phone")
      .eq("host_id", cleanId)
      .maybeSingle();

    if (findError) throw findError;
    if (!family || !family.user_id || !mobileMatches(cleanMobile, [family.host_phone, family.phone])) {
      return NextResponse.json(
        { error: "Could not resolve account details for this Partner ID and registered mobile number." },
        { status: 404 }
      );
    }

    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "SMS OTP verification is not configured on the server." },
        { status: 500 }
      );
    }

    const { data: otpRecord, error: otpFetchError } = await supabase
      .from("phone_otps")
      .select("*")
      .eq("phone", cleanMobile)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpFetchError) throw otpFetchError;
    if (!otpRecord?.otp_session_id) {
      return NextResponse.json({ error: "No active mobile verification session found" }, { status: 400 });
    }

    await callTwoFactorVerify(`https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${otpRecord.otp_session_id}/${cleanOtp}`);
    await supabase.from("phone_otps").update({ verified: true }).eq("id", otpRecord.id);

    const { error: authError } = await supabase.auth.admin.updateUserById(family.user_id, {
      password: cleanPassword,
    });
    if (authError) throw authError;

    const { error: dbError } = await supabase
      .from("families")
      .update({
        password: cleanPassword,
        host_password: cleanPassword,
      })
      .eq("id", family.id);

    if (dbError) throw dbError;

    return NextResponse.json({
      success: true,
      message: "Password updated successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Mobile password reset confirmation failed:", error);
    const message = error instanceof Error ? error.message : "Failed to reset password";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
