import { NextResponse } from "next/server";

import { sendApprovalCredentialsEmail } from "@/lib/approval-email";
import { sendApprovalCredentialsWhatsApp } from "@/lib/approval-whatsapp";
import { provisionFamilyFromApplication } from "@/lib/partner-provisioning";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as { draftId?: string };
  const draftId = String(body.draftId ?? "").trim();

  if (!draftId) {
    return NextResponse.json({ error: "Draft ID is required." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("host_onboarding_drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const payload = ((data as { payload?: Record<string, unknown> }).payload ?? {}) as Record<
    string,
    unknown
  >;

  const { data: applicationData, error: insertError } = await supabase
    .from("family_applications")
    .insert({
      full_name: String(payload.fullName ?? ""),
      email: String(payload.email ?? ""),
      phone: String(payload.mobileNumber ?? ""),
      whatsapp_number: String(payload.mobileNumber ?? ""),
      property_name: String(payload.propertyName ?? ""),
      property_address: String(payload.propertyAddress ?? ""),
      village: String(
        payload.villageName ?? payload.cityName ?? payload.cityNeighbourhood ?? payload.village ?? ""
      ),
      state: String(payload.state ?? ""),
      house_type: String(payload.familyComposition ?? payload.houseType ?? ""),
      about_family: String(payload.hostBio ?? ""),
      languages: Array.isArray(payload.languages)
        ? (payload.languages as string[])
        : [],
      max_guests: Number(payload.maxGuests ?? 2),
      cultural_offerings: [String(payload.culturalActivity ?? "")].filter(Boolean),
      photo_url: Array.isArray(payload.photos)
        ? String((payload.photos as string[])[0] ?? "")
        : String(payload.photoUrl ?? ""),
      google_maps_link: String(payload.googleMapsLink ?? ""),
      latitude: Number(payload.latitude ?? 0),
      longitude: Number(payload.longitude ?? 0),
      onboarding_draft_id: draftId,
      status: "approved",
      reviewed_at: new Date().toISOString(),
      review_notes: "Auto-approved to continue compliance onboarding."
    } as never)
    .select("*")
    .single();

  if (insertError || !applicationData) {
    return NextResponse.json(
      { error: insertError?.message ?? "Unable to submit listing for review." },
      { status: 500 }
    );
  }

  const credentials = await provisionFamilyFromApplication(
    supabase,
    applicationData as never
  );

  const emailResult = await sendApprovalCredentialsEmail({
    recipientName: String(payload.fullName ?? ""),
    recipientEmail: String(payload.email ?? ""),
    applicationType: "family",
    credentials
  });

  const whatsappResult = await sendApprovalCredentialsWhatsApp({
    recipientName: String(payload.fullName ?? ""),
    mobileNumber: String(payload.mobileNumber ?? ""),
    credentials
  });

  const { error: updateError } = await supabase
    .from("host_onboarding_drafts")
    .update({
      family_application_id: (applicationData as { id: string }).id,
      family_id: credentials.profile_id,
      current_step: 5,
      listing_status: "approved"
    } as never)
    .eq("id", draftId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    draftId,
    applicationId: (applicationData as { id: string }).id,
    credentials,
    emailSent: emailResult.sent,
    whatsappSent: whatsappResult.sent
  });
}
