import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { buildOAuthCallbackUrl } from "@/lib/site-url";

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
    const { type, value } = await request.json();

    if (!value || !type) {
      return NextResponse.json({ error: "Type and value are required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    if (type === "email") {
      // Use Supabase native OTP for email
      const { error } = await supabase.auth.signInWithOtp({
        email: value,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: buildOAuthCallbackUrl("/app")
        }
      });

      if (error) throw error;
      return NextResponse.json({ success: true, message: "Email OTP sent" });
    } 
    
    if (type === "phone") {
      const cleanPhone = normalizeIndianMobile(value);
      const apiKey = process.env.TWO_FACTOR_API_KEY;

      if (!apiKey) {
        console.warn("[OTP Mock] TWO_FACTOR_API_KEY missing - simulating phone send");
        return NextResponse.json({ success: true, message: "Mock Phone OTP sent", mock: true });
      }

      // Call 2Factor.in API
      const apiUrl = `https://2factor.in/API/V1/${apiKey}/SMS/${cleanPhone}/AUTOGEN`;
      const data = await callTwoFactor(apiUrl);

      const sessionId = data.Details;

      // Track in phone_otps table
      const { error } = await supabase.from("phone_otps").insert({
        phone: cleanPhone,
        otp: "2FACTOR_MANAGED",
        otp_session_id: sessionId,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        verified: false
      });

      if (error) throw error;

      return NextResponse.json({ success: true, message: "Phone OTP sent", sessionId });
    }

    return NextResponse.json({ error: "Invalid auth type" }, { status: 400 });
  } catch (error: any) {
    console.error("OTP send failed:", error);
    return NextResponse.json({ error: error.message || "Failed to send OTP" }, { status: 500 });
  }
}
