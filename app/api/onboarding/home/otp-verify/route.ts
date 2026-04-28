// app/api/onboarding/home/otp-verify/route.ts

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

async function callTwoFactorVerify(url: string): Promise<any> {
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

  throw new Error(postJson?.Details || getJson?.Details || "Invalid verification code");
}

export async function POST(request: Request) {
  try {
    const { mobileNumber, otpCode } = await request.json();
    const cleanMobile = normalizeIndianMobile(mobileNumber);
    
    if (!cleanMobile || !otpCode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const apiKey = process.env.TWO_FACTOR_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "SMS OTP verification is not configured on the server." },
        { status: 500 }
      );
    }

    const { data: record, error } = await supabase
      .from("phone_otps")
      .select("*")
      .eq("phone", cleanMobile)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !record || !record.otp_session_id) {
      return NextResponse.json({ error: "No active verification session found" }, { status: 400 });
    }

    const verifyUrl = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${record.otp_session_id}/${String(otpCode).trim()}`;
    await callTwoFactorVerify(verifyUrl);

    await supabase
      .from("phone_otps")
      .update({ verified: true })
      .eq("id", record.id);

    const { generateHostPassword } = await import("@/lib/host-onboarding");
    const generatedPassword = generateHostPassword();

    const { data: draft, error: draftError } = await supabase
      .from("host_onboarding_drafts")
      .insert({
        mobile_number: cleanMobile,
        password: generatedPassword,
        current_step: 1,
        listing_status: "draft",
        payload: { mobileNumber: cleanMobile }
      })
      .select("id")
      .single();

    if (draftError) throw draftError;

    return NextResponse.json({ 
      success: true, 
      verified: true, 
      draftId: draft.id,
      message: "Mobile verified and draft created" 
    });
  } catch (error) {
    console.error("OTP verification failed:", error);
    const message = error instanceof Error ? error.message : "Failed to verify OTP";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
