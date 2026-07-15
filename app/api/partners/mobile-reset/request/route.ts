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

async function callTwoFactor(url: string): Promise<any> {
  const postResponse = await fetch(url, { method: "POST", cache: "no-store" });
  const postJson = await postResponse.json().catch(() => null);
  if (postResponse.ok && postJson?.Status === "Success") return postJson;

  const getResponse = await fetch(url, { method: "GET", cache: "no-store" });
  const getJson = await getResponse.json().catch(() => null);
  if (getResponse.ok && getJson?.Status === "Success") return getJson;

  throw new Error(postJson?.Details || getJson?.Details || "Failed to trigger SMS OTP");
}

export async function POST(request: Request) {
  try {
    const { hostId, mobileNumber } = await request.json();
    const cleanId = normalizeHostId(hostId);
    const cleanMobile = normalizeIndianMobile(mobileNumber);

    if (!cleanId) {
      return NextResponse.json({ error: "Partner ID is required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: family, error: findError } = await supabase
      .from("families")
      .select("id,host_id,host_phone,phone")
      .eq("host_id", cleanId)
      .maybeSingle();

    if (findError) throw findError;
    if (!family || !mobileMatches(cleanMobile, [family.host_phone, family.phone])) {
      return NextResponse.json(
        { error: "No matching host account found for this Partner ID and registered mobile number." },
        { status: 404 }
      );
    }

    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "SMS OTP is not configured on the server. Please contact Famlo support." },
        { status: 500 }
      );
    }

    const data = await callTwoFactor(`https://2factor.in/API/V1/${apiKey}/SMS/${cleanMobile}/AUTOGEN`);
    const sessionId = data.Details;

    await supabase.from("phone_otps").update({ verified: true }).eq("phone", cleanMobile).eq("verified", false);

    const { error: otpError } = await supabase.from("phone_otps").insert({
      phone: cleanMobile,
      otp: "2FACTOR_MANAGED",
      otp_session_id: sessionId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      verified: false,
    });

    if (otpError) throw otpError;

    return NextResponse.json({
      success: true,
      message: "Verification code sent to the registered mobile number.",
    });
  } catch (error) {
    console.error("Mobile password reset request failed:", error);
    const message = error instanceof Error ? error.message : "Failed to process reset request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
