// app/api/partners/request-reset/route.ts

import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";

export async function POST(request: Request) {
  try {
    const { hostId } = await request.json();
    const cleanId = hostId?.trim().toUpperCase();

    if (!cleanId) {
      return NextResponse.json({ error: "Host ID is required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // 1. Find the host in the families table
    const { data: family, error: findError } = await supabase
      .from("families")
      .select("email, name")
      .eq("host_id", cleanId)
      .maybeSingle();

    if (findError) throw findError;
    if (!family || !family.email) {
      return NextResponse.json({ error: "No partner account found with this ID" }, { status: 404 });
    }

    const email = family.email.trim().toLowerCase();

    // 2. Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // 3. Store in email_otps table
    const { error: otpError } = await supabase.from("email_otps").insert({
      email,
      otp,
      expires_at: expiresAt,
      verified: false
    });

    if (otpError) throw otpError;

    // 4. Send Reset Email via Resend
    await sendEmail({
      to: email,
      subject: 'Reset your Famlo Partner Password',
      html: `
        <div style="font-family: sans-serif; padding: 24px; color: #0e2b57;">
          <h1 style="font-size: 24px; font-weight: 900; color: #165dcc;">Password Reset Verification</h1>
          <p style="font-size: 16px;">Hello ${family.name || 'Partner'},</p>
          <p style="font-size: 16px;">We received a request to reset your Famlo partner account password (ID: <strong>${cleanId}</strong>). Your 6-digit verification code is:</p>
          
          <div style="background: #f4f8ff; padding: 16px; border-radius: 12px; display: inline-block; font-size: 32px; font-weight: 900; letter-spacing: 0.1em; color: #165dcc; margin: 16px 0;">
            ${otp}
          </div>
          
          <p style="font-size: 14px; margin-top: 24px; color: #64748b;">This code is valid for 10 minutes. If you did not request this reset, your account is still secure and you can ignore this email.</p>
          
          <p style="font-size: 14px; border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 16px;">
            Famlo Partner Support
          </p>
        </div>
      `
    });

    return NextResponse.json({ 
      success: true, 
      message: "Verification code sent to your registered email" 
    });
  } catch (err) {
    console.error("Password reset request failed:", err);
    return NextResponse.json({ error: "Failed to process reset request" }, { status: 500 });
  }
}
