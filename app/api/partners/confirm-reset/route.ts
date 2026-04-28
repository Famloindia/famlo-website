// app/api/partners/confirm-reset/route.ts

import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { hostId, otp, newPassword } = await request.json();
    const cleanId = hostId?.trim().toUpperCase();
    const cleanOtp = otp?.trim();
    const cleanPassword = newPassword?.trim();

    if (!cleanId || !cleanOtp || !cleanPassword) {
      return NextResponse.json({ error: "Host ID, OTP, and New Password are all required" }, { status: 400 });
    }

    if (cleanPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // 1. Resolve email from Host ID
    const { data: family, error: findError } = await supabase
      .from("families")
      .select("email, user_id, id")
      .eq("host_id", cleanId)
      .maybeSingle();

    if (findError) throw findError;
    if (!family || !family.email || !family.user_id) {
      return NextResponse.json({ error: "Could not resolve account details" }, { status: 404 });
    }

    const email = family.email.trim().toLowerCase();

    // 2. Verify OTP
    const { data: otpRecord, error: otpFetchError } = await supabase
      .from("email_otps")
      .select("*")
      .eq("email", email)
      .eq("otp", cleanOtp)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpFetchError) throw otpFetchError;
    if (!otpRecord) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 });
    }

    // 3. Mark OTP as used
    await supabase.from("email_otps").update({ verified: true }).eq("id", otpRecord.id);

    // 4. Update Supabase Auth Password
    const { error: authError } = await supabase.auth.admin.updateUserById(
      family.user_id,
      { password: cleanPassword }
    );

    if (authError) throw authError;

    // 5. Update families table for parity (password and host_password)
    const { error: dbError } = await supabase
      .from("families")
      .update({
        password: cleanPassword,
        host_password: cleanPassword
      })
      .eq("id", family.id);

    if (dbError) throw dbError;

    return NextResponse.json({ 
      success: true, 
      message: "Password updated successfully. You can now log in with your new credentials." 
    });
  } catch (err) {
    console.error("Password reset confirmation failed:", err);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
