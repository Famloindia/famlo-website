import { assertRuntimeSafety } from "@/lib/app-env";
import { sendEmail } from "@/lib/resend";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export type EmailProviderResult = {
  ok: boolean;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
};

export async function deliverEmail(payload: EmailPayload): Promise<EmailProviderResult> {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "resend";

  if (provider === "resend") {
    assertRuntimeSafety("email_execution");
    const result = await sendEmail(payload);
    return {
      ok: Boolean(result?.success),
      provider: "resend",
      providerMessageId: typeof result?.id === "string" ? result.id : null,
      errorMessage: result?.success ? null : result?.error ?? "Email delivery failed.",
    };
  }

  if (provider === "log") {
    console.log("[FinanceEmail:log]", payload.subject, payload.to);
    return {
      ok: true,
      provider: "log",
      providerMessageId: `log-${Date.now()}`,
      errorMessage: null,
    };
  }

  return {
    ok: false,
    provider,
    providerMessageId: null,
    errorMessage: `Unsupported email provider: ${provider}`,
  };
}
