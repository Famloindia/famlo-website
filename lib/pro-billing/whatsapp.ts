import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueNotificationRecord } from "@/lib/notifications/enqueue";
import type { HostProInvoicePayload } from "@/lib/pro-billing/invoice";
import { getPublicSiteUrl } from "@/lib/site-url";

function asPhone(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function updateInvoiceWhatsappStatus(
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
      whatsapp_status: input.status,
      whatsapp_sent_at: input.sentAt ?? null,
      whatsapp_error: input.error ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.invoiceId);
  if (error) throw error;
}

export async function enqueueHostProInvoiceWhatsApp(
  supabase: SupabaseClient,
  input: {
    invoiceId: string;
    hostUserId: string;
    payload: HostProInvoicePayload;
  }
): Promise<{ status: "queued" | "failed" | "deduped"; reason?: string | null }> {
  const phone = asPhone(input.payload.hostPhone);
  if (!phone) {
    await updateInvoiceWhatsappStatus(supabase, {
      invoiceId: input.invoiceId,
      status: "failed",
      error: "Host phone is not available.",
    });
    return { status: "failed", reason: "Host phone is not available." };
  }

  const invoiceUrl = `${getPublicSiteUrl()}/api/host/finance/invoices/${encodeURIComponent(input.invoiceId)}/download`;
  const enqueueStatus = await enqueueNotificationRecord(supabase, {
    eventType: "host_pro_invoice_receipt",
    channel: "whatsapp",
    userId: input.hostUserId,
    dedupeKey: `host-pro-invoice:${input.invoiceId}:whatsapp`,
    recipientRole: "host",
    recipientPhone: phone,
    templateName: "host_pro_invoice_receipt",
    payload: {
      title: "Famlo Pro payment received",
      message: `Hi ${input.payload.hostName}, your Famlo Pro payment of ₹${Math.round(input.payload.charges.totalPaid)} has been received. Your GST Tax Invoice cum Payment Receipt is available here: ${invoiceUrl}. Thank you for choosing Famlo Pro.`,
      phone,
      invoice_id: input.invoiceId,
      invoice_url: invoiceUrl,
      total_paid: input.payload.charges.totalPaid,
      host_name: input.payload.hostName,
    },
  });

  await updateInvoiceWhatsappStatus(supabase, {
    invoiceId: input.invoiceId,
    status: enqueueStatus === "deduped" ? "queued" : "queued",
    error: null,
  });

  return { status: enqueueStatus === "deduped" ? "deduped" : "queued", reason: null };
}

export async function syncHostProInvoiceWhatsappDelivery(
  supabase: SupabaseClient,
  input: {
    invoiceId: string;
    status: "processed" | "failed" | "skipped";
    errorMessage?: string | null;
  }
): Promise<void> {
  await updateInvoiceWhatsappStatus(supabase, {
    invoiceId: input.invoiceId,
    status: input.status === "processed" ? "sent" : input.status,
    sentAt: input.status === "processed" ? new Date().toISOString() : null,
    error: input.errorMessage ?? null,
  });
}
