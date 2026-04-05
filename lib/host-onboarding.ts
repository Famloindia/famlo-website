import { createAdminSupabaseClient } from "./supabase";

export type HostOnboardingPayload = Record<string, unknown>;
export type HostCompliancePayload = Record<string, unknown>;

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "").trim();
}

export async function sendOtpMessage(params: {
  mobileNumber: string;
  code: string;
}): Promise<{ sent: boolean; provider: string | null; error?: string | null }> {
  const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const whatsappTemplateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;

  if (whatsappToken && whatsappPhoneNumberId && whatsappTemplateName) {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: params.mobileNumber.replace(/^\+/, ""),
          type: "template",
          template: {
            name: whatsappTemplateName,
            language: {
              code: "en"
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: params.code
                  }
                ]
              }
            ]
          }
        })
      }
    );

    if (response.ok) {
      return {
        sent: true,
        provider: "whatsapp-cloud",
        error: null
      };
    }
  }

  const msg91AuthKey = process.env.MSG91_AUTH_KEY;
  const msg91TemplateId = process.env.MSG91_OTP_TEMPLATE_ID;
  const msg91SenderId = process.env.MSG91_SENDER_ID;

  if (!msg91AuthKey || !msg91TemplateId || !msg91SenderId) {
    return {
      sent: false,
      provider: null,
      error: "MSG91 OTP credentials are not configured."
    };
  }

  const response = await fetch("https://control.msg91.com/api/v5/otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: msg91AuthKey
    },
    body: JSON.stringify({
      template_id: msg91TemplateId,
      mobile: params.mobileNumber,
      otp: params.code,
      sender: msg91SenderId
    })
  });

  if (!response.ok) {
    return {
      sent: false,
      provider: "msg91",
      error: "MSG91 could not send the OTP."
    };
  }

  return {
    sent: true,
    provider: "msg91",
    error: null
  };
}

export async function mergeDraftPayload(params: {
  draftId: string;
  payloadPatch?: HostOnboardingPayload;
  compliancePatch?: HostCompliancePayload;
  currentStep?: number;
  listingStatus?: string;
}): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("host_onboarding_drafts")
    .select("payload, compliance, current_step")
    .eq("id", params.draftId)
    .single();

  if (error || !data) {
    throw error ?? new Error("Draft not found.");
  }

  const payload = {
    ...((data as { payload?: HostOnboardingPayload }).payload ?? {}),
    ...(params.payloadPatch ?? {})
  };
  const compliance = {
    ...((data as { compliance?: HostCompliancePayload }).compliance ?? {}),
    ...(params.compliancePatch ?? {})
  };

  const { error: updateError } = await supabase
    .from("host_onboarding_drafts")
    .update({
      payload,
      compliance,
      current_step: Math.max(
        params.currentStep ?? 1,
        (data as { current_step?: number }).current_step ?? 1
      ),
      listing_status: params.listingStatus ?? undefined
    } as never)
    .eq("id", params.draftId);

  if (updateError) {
    throw updateError;
  }
}
