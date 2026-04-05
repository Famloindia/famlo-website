import type { ApprovalCredentials } from "./types";

interface ApprovalWhatsAppInput {
  recipientName: string;
  mobileNumber: string;
  credentials: ApprovalCredentials;
}

export async function sendApprovalCredentialsWhatsApp(
  input: ApprovalWhatsAppInput
): Promise<{ sent: boolean; provider: string | null; error?: string | null }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_CREDENTIALS_TEMPLATE_NAME;

  if (!token || !phoneNumberId || !templateName) {
    return {
      sent: false,
      provider: null,
      error: "WhatsApp credentials template is not configured."
    };
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.mobileNumber.replace(/^\+/, ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: input.recipientName },
              { type: "text", text: input.credentials.user_id },
              { type: "text", text: input.credentials.password ?? "Use password reset" }
            ]
          }
        ]
      }
    })
  });

  if (!response.ok) {
    return {
      sent: false,
      provider: "whatsapp-cloud",
      error: "WhatsApp could not send the login credentials."
    };
  }

  return {
    sent: true,
    provider: "whatsapp-cloud",
    error: null
  };
}
