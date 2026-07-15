// app/api/onboarding/home/email-otp/route.ts

import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    const cleanEmail = email?.trim().toLowerCase();
    
    if (!cleanEmail) {
      return NextResponse.json({ error: "Email address is required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store in email_otps table
    const { error } = await supabase.from("email_otps").insert({
      email: cleanEmail,
      otp,
      expires_at: expiresAt,
      verified: false
    });

    if (error) throw error;

    // Send Real Email via Resend
    await sendEmail({
      to: cleanEmail,
      subject: 'Verify your Famlo Account',
      html: `
        <div style="font-family: sans-serif; padding: 24px; color: #0e2b57;">
          <h1 style="font-size: 24px; font-weight: 900;">Verify your Account</h1>
          <p style="font-size: 16px;">Welcome to the Famlo heritage ecosystem. Your 6-digit OTP is: <strong>${otp}</strong></p>
          <div style="background: #f4f8ff; padding: 16px; border-radius: 12px; display: inline-block; font-size: 32px; font-weight: 900; letter-spacing: 0.1em; color: #165dcc; margin-top: 16px;">
            ${otp}
          </div>
          <p style="font-size: 14px; margin-top: 24px; color: #64748b;">This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        </div>
      `
    });

    return NextResponse.json({ success: true, message: "Verification code sent to email" });
  } catch (err) {
    console.error("Email OTP send failed:", err);
    return NextResponse.json({ error: "Failed to send email verification" }, { status: 500 });
  }
}
