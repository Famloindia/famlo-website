import type { ApprovalCredentials, ApplicationKind } from "./types";

type ApprovalEmailKind = ApplicationKind | "hommie" | "home";

interface ApprovalEmailInput {
  recipientName: string;
  recipientEmail: string;
  applicationType: ApprovalEmailKind;
  credentials: ApprovalCredentials;
}

interface ApprovalEmailResult {
  sent: boolean;
  provider: string | null;
  error?: string | null;
}

function getRequiredValue(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
}

function buildRoleLabel(applicationType: ApprovalEmailKind): string {
  if (applicationType === "family") {
    return "Famlo Visits partner";
  }

  if (applicationType === "friend") {
    return "CityBuddy partner";
  }

  return "Famlo Stays partner";
}

function buildHtml(input: ApprovalEmailInput): string {
  const passwordLine = input.credentials.password
    ? `<p style="margin:12px 0 0;color:#1A1A2E;"><strong>Temporary password:</strong> ${input.credentials.password}</p>`
    : `<p style="margin:12px 0 0;color:#1A1A2E;">Your account already existed, so no new password was generated. Please use the password reset option if needed.</p>`;

  return `
    <div style="font-family:Arial,sans-serif;background:#F7FBFF;padding:32px;color:#1A1A2E;">
      <div style="max-width:640px;margin:0 auto;background:#FFFFFF;border-radius:24px;padding:32px;border:1px solid #D5E7F8;">
        <p style="margin:0 0 8px;color:#1A6EBB;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Famlo approval</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Your application has been approved</h1>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">
          Hi ${input.recipientName}, your ${buildRoleLabel(input.applicationType)} profile is now approved.
        </p>
        <div style="background:#F7FBFF;border-radius:18px;padding:20px;border:1px solid #D5E7F8;">
          <p style="margin:0;color:#1A1A2E;"><strong>Email:</strong> ${input.recipientEmail}</p>
          <p style="margin:12px 0 0;color:#1A1A2E;"><strong>User ID:</strong> ${input.credentials.user_id}</p>
          <p style="margin:12px 0 0;color:#1A1A2E;"><strong>Partner code:</strong> ${input.credentials.profile_code ?? "Not available"}</p>
          ${passwordLine}
        </div>
        <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#4B5563;">
          Please keep these details safe. If you did not expect this email, contact hello@famlo.in.
        </p>
      </div>
    </div>
  `;
}

export async function sendApprovalCredentialsEmail(
  input: ApprovalEmailInput
): Promise<ApprovalEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    return {
      sent: false,
      provider: null,
      error: "RESEND_API_KEY is missing, so approval emails are disabled."
    };
  }

  const fromEmail = getRequiredValue(
    process.env.MAIL_FROM_EMAIL,
    "MAIL_FROM_EMAIL"
  );

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [input.recipientEmail],
      subject: "Your Famlo partner login details",
      html: buildHtml(input)
    })
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    throw new Error(
      errorPayload?.message ?? "Resend could not send the approval email."
    );
  }

  return {
    sent: true,
    provider: "resend",
    error: null
  };
}
