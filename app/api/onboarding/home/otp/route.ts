// app/api/onboarding/home/otp/route.ts

import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

function normalizeIndianMobile(input: unknown): string {
  const clean = typeof input === "string" ? input.replace(/[^\d+]/g, "").trim() : "";
  if (!clean) {
    throw new Error("Mobile number is required");
  }

  const withoutPlus = clean.startsWith("+") ? clean.slice(1) : clean;
  const normalized = withoutPlus.startsWith("91") ? withoutPlus : `91${withoutPlus}`;

  if (!/^91\d{10}$/.test(normalized)) {
    throw new Error("Please enter a valid Indian mobile number.");
  }

  return normalized;
}

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
    const { mobileNumber } = await request.json();
    const cleanMobile = normalizeIndianMobile(mobileNumber);

    const supabase = createAdminSupabaseClient();
    const apiKey = process.env.TWO_FACTOR_API_KEY;

    if (!apiKey) {
      console.error("[OTP] TWO_FACTOR_API_KEY missing in host onboarding");
      return NextResponse.json(
        { error: "SMS OTP is not configured on the server. Please contact Famlo support." },
        { status: 500 }
      );
    }

    const apiUrl = `https://2factor.in/API/V1/${apiKey}/SMS/${cleanMobile}/AUTOGEN`;
    const data = await callTwoFactor(apiUrl);

    const sessionId = data.Details; // This is the Session ID needed for verification

    await supabase
      .from("phone_otps")
      .update({ verified: true })
      .eq("phone", cleanMobile)
      .eq("verified", false);

    const { error } = await supabase.from("phone_otps").insert({
      phone: cleanMobile,
      otp: "2FACTOR_MANAGED", // 2Factor manages the code itself
      otp_session_id: sessionId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      verified: false
    });

    if (error) throw error;

    console.log(`[ONBOARDING 2FA] SMS triggered for ${cleanMobile}, session: ${sessionId}`);

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully via 2Factor",
      normalizedMobileNumber: cleanMobile,
    });
  } catch (error) {
    console.error("2Factor trigger failed:", error);
    const message = error instanceof Error ? error.message : "Failed to send SMS OTP";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
