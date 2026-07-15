import { NextResponse } from "next/server";

import { generateOtp, normalizePhone, sendOtpMessage } from "@/lib/host-onboarding";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    fullName?: string;
    email?: string;
    mobileNumber?: string;
    cityNeighbourhood?: string;
    state?: string;
    cityName?: string;
    villageName?: string;
  };

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const mobileNumber = normalizePhone(String(body.mobileNumber ?? ""));
  const cityNeighbourhood = String(body.cityNeighbourhood ?? "").trim();
  const state = String(body.state ?? "").trim();
  const cityName = String(body.cityName ?? "").trim();
  const villageName = String(body.villageName ?? "").trim();

  if (!fullName || !email || !mobileNumber || !cityNeighbourhood) {
    return NextResponse.json(
      { error: "Full name, email, mobile number, and city are required." },
      { status: 400 }
    );
  }

  const otpCode = generateOtp();
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("host_onboarding_drafts")
    .insert({
      mobile_number: mobileNumber,
      primary_host_name: fullName,
      city_neighbourhood: cityNeighbourhood,
      otp_code: otpCode,
      otp_sent_at: new Date().toISOString(),
      current_step: 1,
      listing_status: "otp_pending",
      payload: {
        fullName,
        email,
        mobileNumber,
        cityNeighbourhood,
        state,
        cityName,
        villageName
      },
      compliance: {}
    } as never)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to start onboarding." },
      { status: 500 }
    );
  }

  const smsResult = await sendOtpMessage({
    mobileNumber,
    code: otpCode
  });

  return NextResponse.json({
    draftId: (data as { id: string }).id,
    sent: smsResult.sent,
    provider: smsResult.provider,
    error: smsResult.error ?? null,
    devOtp: process.env.NODE_ENV !== "production" ? otpCode : undefined
  });
}
