import type { SupabaseClient } from "@supabase/supabase-js";

import { isInvoiceEmailDeliveryEnabled } from "@/lib/finance/feature-flags";
import { deliverEmail } from "@/lib/notifications/email/email-provider";
import { renderHostProInvoiceSummaryHtml, type HostProInvoicePayload } from "@/lib/pro-billing/invoice";
import { getPublicSiteUrl } from "@/lib/site-url";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function resolveHostEmail(
  supabase: SupabaseClient,
  hostUserId: string,
  fallbackEmail?: string | null
): Promise<string | null> {
  if (asString(fallbackEmail)) {
    return asString(fallbackEmail);
  }
  const { data } = await supabase.from("users").select("email").eq("id", hostUserId).maybeSingle();
  return asString((data as JsonRecord | null)?.email);
}

async function updateInvoiceEmailStatus(
  supabase: SupabaseClient,
  input: {
    invoiceId: string;
    status: string;
    sentAt?: string | null;
    error?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from("host_pro_invoices")
    .update({
      email_status: input.status,
      email_sent_at: input.sentAt ?? null,
      email_error: input.error ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.invoiceId);
  if (error) throw error;
}

async function logProInvoiceEmail(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    email: string;
    artifactId: string;
    provider: string;
    providerMessageId?: string | null;
    status: string;
    errorMessage?: string | null;
  }
): Promise<string> {
  const payload = {
    recipient_type: "host",
    recipient_id: input.hostUserId,
    email: input.email,
    template_key: "host_pro_invoice",
    artifact_type: "host_pro_invoice",
    artifact_id: input.artifactId,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? null,
    status: input.status,
    error_message: input.errorMessage ?? null,
    sent_at: input.status === "sent" ? new Date().toISOString() : null,
  };

  const { data: existing } = await supabase
    .from("finance_email_deliveries")
    .select("id")
    .eq("template_key", "host_pro_invoice")
    .eq("artifact_type", "host_pro_invoice")
    .eq("artifact_id", input.artifactId)
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

export async function sendHostProInvoiceEmail(
  supabase: SupabaseClient,
  input: {
    invoiceId: string;
    hostUserId: string;
    payload: HostProInvoicePayload;
  }
): Promise<{ deliveryId: string; providerMessageId: string | null }> {
  if (!isInvoiceEmailDeliveryEnabled()) {
    await updateInvoiceEmailStatus(supabase, {
      invoiceId: input.invoiceId,
      status: "failed",
      error: "Finance email delivery is disabled by feature flag.",
    });
    throw new Error("Finance email delivery is disabled by feature flag.");
  }

  const email = await resolveHostEmail(supabase, input.hostUserId, input.payload.hostEmail);
  if (!email) {
    await updateInvoiceEmailStatus(supabase, {
      invoiceId: input.invoiceId,
      status: "failed",
      error: "Host email is not available.",
    });
    throw new Error("Host email is not available.");
  }

  const invoiceUrl = `${getPublicSiteUrl()}/api/host/finance/invoices/${encodeURIComponent(input.invoiceId)}/download`;
  const dashboardUrl = `${getPublicSiteUrl()}/partnerslogin/home/pro/dashboard`;

  const result = await deliverEmail({
    to: email,
    subject: "Your Famlo Pro GST Tax Invoice",
    html: renderHostProInvoiceSummaryHtml({
      hostName: input.payload.hostName,
      invoiceNumber: input.payload.invoiceNumber,
      totalPaid: input.payload.charges.totalPaid,
      invoiceUrl,
      dashboardUrl,
    }),
  });

  const sentAt = result.ok ? new Date().toISOString() : null;
  const deliveryId = await logProInvoiceEmail(supabase, {
    hostUserId: input.hostUserId,
    email,
    artifactId: input.invoiceId,
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    status: result.ok ? "sent" : "failed",
    errorMessage: result.errorMessage,
  });

  await updateInvoiceEmailStatus(supabase, {
    invoiceId: input.invoiceId,
    status: result.ok ? "sent" : "failed",
    sentAt,
    error: result.errorMessage ?? null,
  });

  if (!result.ok) {
    throw new Error(result.errorMessage ?? "Famlo Pro invoice email delivery failed.");
  }

  return {
    deliveryId,
    providerMessageId: result.providerMessageId,
  };
}
