// app/api/onboarding/home/email-verify/route.ts

import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();
    const cleanEmail = email?.trim().toLowerCase();
    
    if (!cleanEmail || !otp) {
      return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // Check latest valid OTP
    const { data: records, error } = await supabase
      .from("email_otps")
      .select("*")
      .eq("email", cleanEmail)
      .eq("otp", otp)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !records || records.length === 0) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    // Mark as verified
    const { error: updateError } = await supabase
      .from("email_otps")
      .update({ verified: true })
      .eq("id", records[0].id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: "Email verified successfully" });
  } catch (err) {
    console.error("Email verification failed:", err);
    return NextResponse.json({ error: "Failed to verify email" }, { status: 500 });
  }
}
