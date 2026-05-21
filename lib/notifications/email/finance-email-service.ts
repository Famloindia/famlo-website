import type { SupabaseClient } from "@supabase/supabase-js";

import { isInvoiceEmailDeliveryEnabled } from "@/lib/finance/feature-flags";
import { resolveFinanceDocumentById } from "@/lib/finance/invoices/pdf/document-service";
import { deliverEmail } from "@/lib/notifications/email/email-provider";
import { buildCreditNoteEmail } from "@/lib/notifications/templates/credit-note-email";
import { buildGuestInvoiceEmail } from "@/lib/notifications/templates/guest-invoice-email";
import { buildHostPlatformFeeInvoiceEmail } from "@/lib/notifications/templates/host-platform-fee-invoice-email";
import { buildPayoutFailedEmail } from "@/lib/notifications/templates/payout-failed-email";
import { buildPayoutProcessedEmail } from "@/lib/notifications/templates/payout-processed-email";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function appBaseUrl(): string | null {
  return asString(process.env.APP_BASE_URL) ?? asString(process.env.NEXT_PUBLIC_APP_URL);
}

async function logFinanceEmail(
  supabase: SupabaseClient,
  input: {
    recipientType: string;
    recipientId?: string | null;
    email: string;
    templateKey: string;
    artifactType?: string | null;
    artifactId?: string | null;
    provider: string;
    providerMessageId?: string | null;
    status: string;
    errorMessage?: string | null;
  }
) {
  const payload = {
    recipient_type: input.recipientType,
    recipient_id: input.recipientId ?? null,
    email: input.email,
    template_key: input.templateKey,
    artifact_type: input.artifactType ?? null,
    artifact_id: input.artifactId ?? null,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? null,
    status: input.status,
    error_message: input.errorMessage ?? null,
    sent_at: input.status === "sent" ? new Date().toISOString() : null,
  };

  const { data: existing } = await supabase
    .from("finance_email_deliveries")
    .select("id")
    .eq("template_key", input.templateKey)
    .eq("artifact_type", input.artifactType ?? null)
    .eq("artifact_id", input.artifactId ?? null)
    .eq("email", input.email)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("finance_email_deliveries").update(payload).eq("id", existing.id);
    if (error) throw error;
    return String(existing.id);
  }

  const { data, error } = await supabase.from("finance_email_deliveries").insert(payload).select("id").single();
  if (error) throw error;
  return String(data.id);
}

async function resolveEmailForGuestInvoice(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ recipientId: string | null; email: string | null }> {
  const { data: booking } = await supabase.from("bookings_v2").select("user_id,guest_name").eq("id", bookingId).maybeSingle();
  const recipientId = asString((booking as JsonRecord | null)?.user_id);
  if (!recipientId) return { recipientId: null, email: null };
  const { data: user } = await supabase.from("users").select("email").eq("id", recipientId).maybeSingle();
  return {
    recipientId,
    email: asString((user as JsonRecord | null)?.email),
  };
}

async function resolveEmailForHostInvoice(
  supabase: SupabaseClient,
  hostId: string
): Promise<{ recipientId: string | null; email: string | null }> {
  const { data: host } = await supabase.from("hosts").select("user_id").eq("id", hostId).maybeSingle();
  const recipientId = asString((host as JsonRecord | null)?.user_id);
  if (!recipientId) return { recipientId: null, email: null };
  const { data: user } = await supabase.from("users").select("email").eq("id", recipientId).maybeSingle();
  return {
    recipientId,
    email: asString((user as JsonRecord | null)?.email),
  };
}

export async function sendInvoiceEmail(
  supabase: SupabaseClient,
  input: { invoiceId: string; resend?: boolean }
): Promise<{ deliveryId: string; providerMessageId: string | null }> {
  if (!isInvoiceEmailDeliveryEnabled()) {
    throw new Error("Invoice email delivery is disabled by feature flag.");
  }

  const document = await resolveFinanceDocumentById(supabase, input.invoiceId);
  if (!document) throw new Error("Invoice artifact not found.");

  const baseUrl = appBaseUrl();
  const downloadUrl =
    document.kind === "platform_fee_invoice"
      ? baseUrl
        ? `${baseUrl}/api/host/finance/invoices/${document.artifactId}/download`
        : null
      : baseUrl
        ? `${baseUrl}/api/admin/finance/invoices/${document.artifactId}/download`
        : null;

  if (document.kind === "guest_tax_invoice") {
    const recipient = await resolveEmailForGuestInvoice(supabase, document.bookingId);
    if (!recipient.email) throw new Error("Guest email is not available.");
    const email = buildGuestInvoiceEmail({ artifact: document.payload, downloadUrl });
    const result = await deliverEmail({ to: recipient.email, subject: email.subject, html: email.html });
    const deliveryId = await logFinanceEmail(supabase, {
      recipientType: "guest",
      recipientId: recipient.recipientId,
      email: recipient.email,
      templateKey: "guest_invoice",
      artifactType: document.kind,
      artifactId: document.artifactId,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      status: result.ok ? "sent" : "failed",
      errorMessage: result.errorMessage,
    });
    if (!result.ok) throw new Error(result.errorMessage ?? "Invoice email delivery failed.");
    return { deliveryId, providerMessageId: result.providerMessageId };
  }

  if (document.kind === "platform_fee_invoice") {
    const recipient = await resolveEmailForHostInvoice(supabase, document.payload.hostId);
    if (!recipient.email) throw new Error("Host email is not available.");
    const email = buildHostPlatformFeeInvoiceEmail({ artifact: document.payload, downloadUrl });
    const result = await deliverEmail({ to: recipient.email, subject: email.subject, html: email.html });
    const deliveryId = await logFinanceEmail(supabase, {
      recipientType: "host",
      recipientId: recipient.recipientId,
      email: recipient.email,
      templateKey: "platform_fee_invoice",
      artifactType: document.kind,
      artifactId: document.artifactId,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      status: result.ok ? "sent" : "failed",
      errorMessage: result.errorMessage,
    });
    if (!result.ok) throw new Error(result.errorMessage ?? "Invoice email delivery failed.");
    return { deliveryId, providerMessageId: result.providerMessageId };
  }

  const recipient = await resolveEmailForGuestInvoice(supabase, document.bookingId);
  if (!recipient.email) throw new Error("Credit note recipient email is not available.");
  const email = buildCreditNoteEmail({
    creditNoteNumber: document.payload.creditNoteNumber,
    bookingId: document.bookingId,
    totalReversalAmount: document.payload.totalReversalAmount,
    downloadUrl,
  });
  const result = await deliverEmail({ to: recipient.email, subject: email.subject, html: email.html });
  const deliveryId = await logFinanceEmail(supabase, {
    recipientType: "guest",
    recipientId: recipient.recipientId,
    email: recipient.email,
    templateKey: "credit_note",
    artifactType: document.kind,
    artifactId: document.artifactId,
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    status: result.ok ? "sent" : "failed",
    errorMessage: result.errorMessage,
  });
  if (!result.ok) throw new Error(result.errorMessage ?? "Credit note email delivery failed.");
  return { deliveryId, providerMessageId: result.providerMessageId };
}

export async function sendPayoutEmail(
  supabase: SupabaseClient,
  input: { payoutExecutionId: string; template: "processed" | "failed" }
): Promise<{ deliveryId: string; providerMessageId: string | null }> {
  if (!isInvoiceEmailDeliveryEnabled()) {
    throw new Error("Finance email delivery is disabled by feature flag.");
  }

  const { data: payout } = await supabase
    .from("host_payout_executions")
    .select("id,settlement_id,host_id,amount,status,failure_reason")
    .eq("id", input.payoutExecutionId)
    .maybeSingle();
  if (!payout?.id) throw new Error("Payout execution not found.");

  const recipient = await resolveEmailForHostInvoice(supabase, String(payout.host_id));
  if (!recipient.email) throw new Error("Host email is not available.");

  const template =
    input.template === "processed"
      ? buildPayoutProcessedEmail({ settlementId: String(payout.settlement_id), amount: Number(payout.amount ?? 0) })
      : buildPayoutFailedEmail({
          settlementId: String(payout.settlement_id),
          amount: Number(payout.amount ?? 0),
          failureReason: asString((payout as JsonRecord).failure_reason),
        });

  const result = await deliverEmail({ to: recipient.email, subject: template.subject, html: template.html });
  const deliveryId = await logFinanceEmail(supabase, {
    recipientType: "host",
    recipientId: recipient.recipientId,
    email: recipient.email,
    templateKey: input.template === "processed" ? "payout_processed" : "payout_failed",
    artifactType: "host_payout_execution",
    artifactId: String(payout.id),
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    status: result.ok ? "sent" : "failed",
    errorMessage: result.errorMessage,
  });
  if (!result.ok) throw new Error(result.errorMessage ?? "Payout email delivery failed.");
  return { deliveryId, providerMessageId: result.providerMessageId };
}
