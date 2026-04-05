import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    draftId?: string;
    otpCode?: string;
  };

  const draftId = String(body.draftId ?? "").trim();
  const otpCode = String(body.otpCode ?? "").trim();

  if (!draftId || !otpCode) {
    return NextResponse.json({ error: "Draft ID and OTP are required." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("host_onboarding_drafts")
    .select("id, otp_code")
    .eq("id", draftId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  if ((data as { otp_code?: string | null }).otp_code !== otpCode) {
    return NextResponse.json({ error: "Invalid OTP." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("host_onboarding_drafts")
    .update({
      otp_verified_at: new Date().toISOString(),
      listing_status: "draft",
      current_step: 2
    } as never)
    .eq("id", draftId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ draftId, verified: true });
}
