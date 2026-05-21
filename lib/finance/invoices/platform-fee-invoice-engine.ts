import type { SupabaseClient } from "@supabase/supabase-js";

import { isPlatformFeeInvoiceGenerationEnabled } from "@/lib/finance/feature-flags";
import { buildGuestTaxInvoiceArtifact } from "@/lib/finance/invoices/guest-tax-invoice-engine";
import { isSection95TaxMode } from "@/lib/finance/finance-contracts";
import { getFinanceSettings } from "@/lib/finance/settings";
import { assertTaxArtifactAllowed } from "@/lib/finance/tax-compliance-guard";

type JsonRecord = Record<string, unknown>;

export type PlatformFeeInvoiceArtifact = {
  invoiceNumber: string;
  bookingId: string;
  reservationId: string | null;
  hostId: string;
  hostLegalName: string;
  hostGstin: string | null;
  serviceDescription: "Platform Service Fee";
  taxableValue: number;
  gstAmount: number;
  totalAmount: number;
  invoiceStatus: "draft" | "issued" | "cancelled";
  calculationVersion: string;
  issuerRole: "FAMLO";
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function issueNumber(prefix: string, entityId: string, calculationVersion: string): string {
  const clean = entityId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const version = calculationVersion.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8) || "V1";
  return `${prefix}-${clean}-${version}`;
}

export function buildPlatformFeeInvoiceArtifact(input: {
  bookingId: string;
  reservationId: string | null;
  hostId: string;
  hostLegalName: string;
  hostGstin?: string | null;
  roomBaseAmount: number;
  calculationVersion: string;
  invoiceStatus?: "draft" | "issued" | "cancelled";
}): PlatformFeeInvoiceArtifact {
  const totalAmount = Math.max(0, Math.round(input.roomBaseAmount * 0.16));
  const taxableValue = Math.max(0, Math.round(totalAmount / 1.18));
  const gstAmount = Math.max(0, Math.round(totalAmount - taxableValue));

  return {
    invoiceNumber: issueNumber("PFI", input.bookingId, input.calculationVersion),
    bookingId: input.bookingId,
    reservationId: input.reservationId,
    hostId: input.hostId,
    hostLegalName: input.hostLegalName,
    hostGstin: asString(input.hostGstin),
    serviceDescription: "Platform Service Fee",
    taxableValue,
    gstAmount,
    totalAmount,
    invoiceStatus: input.invoiceStatus ?? "draft",
    calculationVersion: input.calculationVersion,
    issuerRole: "FAMLO",
  };
}

function normalizeNights(value: unknown): Array<{ actualValue: number; listedValue?: number; roomId?: string | null; date?: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as JsonRecord;
      const actualValue = Number(record.actualValue ?? record.actual_value ?? record.amount ?? 0);
      if (!Number.isFinite(actualValue)) return null;
      return {
        roomId: asString(record.roomId ?? record.room_id),
        date: asString(record.date),
        listedValue: Number(record.listedValue ?? record.listed_value ?? actualValue),
        actualValue,
      };
    })
    .filter(Boolean) as Array<{ actualValue: number; listedValue?: number; roomId?: string | null; date?: string | null }>;
}

export async function generatePlatformFeeInvoice(
  supabase: SupabaseClient,
  input: { bookingId: string; actorUserId?: string | null }
): Promise<string> {
  const settings = await getFinanceSettings({}, supabase);
  assertTaxArtifactAllowed(settings, "CREATE_TAX_INVOICE");
  if (!isPlatformFeeInvoiceGenerationEnabled()) {
    throw new Error("Platform fee invoice generation is disabled by feature flag.");
  }
  if (!isSection95TaxMode(settings.taxMode)) {
    throw new Error("Platform fee invoices require Section 9(5) tax mode.");
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,host_id,pricing_snapshot")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking?.id || !booking.host_id) throw new Error("Booking or host not found.");

  const { data: reservation } = await supabase
    .from("reservations_v2")
    .select("id")
    .eq("booking_id", input.bookingId)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("platform_fee_invoices")
    .select("id")
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const pricingSnapshot = (booking.pricing_snapshot as JsonRecord | null) ?? {};
  const section95Input = (pricingSnapshot.section_9_5_input as JsonRecord | null) ?? null;
  const section95Contract = (pricingSnapshot.section_9_5_contract as JsonRecord | null) ?? null;
  const nights = normalizeNights(
    pricingSnapshot.section_9_5_input_nights ??
      section95Input?.nights ??
      pricingSnapshot.room_nights
  );
  if (nights.length === 0) {
    throw new Error("Platform fee invoice requires room-night pricing data.");
  }

  const guestArtifact = buildGuestTaxInvoiceArtifact({
    bookingId: input.bookingId,
    reservationId: asString((reservation as JsonRecord | null)?.id),
    guestId: null,
    guestName: "Guest",
    propertyName: asString(pricingSnapshot.property_name) ?? "Property",
    propertyAddress: asString(pricingSnapshot.property_address) ?? "Property address unavailable",
    checkIn: null,
    checkOut: null,
    placeOfSupply: asString(pricingSnapshot.place_of_supply) ?? "India",
    nights,
    famloLegalEntityName: requireEnv("FAMLO_LEGAL_ENTITY_NAME"),
    famloGstin: requireEnv("FAMLO_GSTIN"),
    famloAddress: requireEnv("FAMLO_LEGAL_ADDRESS"),
    calculationVersion: asString(section95Contract?.calculationVersion),
    taxMode: settings.taxMode,
  });

  const { data: hostRecord } = await supabase
    .from("hosts")
    .select("user_id,display_name")
    .eq("id", booking.host_id)
    .maybeSingle();

  const hostUserId = asString((hostRecord as JsonRecord | null)?.user_id);
  const { data: hostTaxDetails } = hostUserId
    ? await supabase
        .from("host_tax_details")
        .select("pan_holder_name,verification_status,metadata")
        .eq("user_id", hostUserId)
        .maybeSingle()
    : { data: null as JsonRecord | null };

  const artifact = buildPlatformFeeInvoiceArtifact({
    bookingId: input.bookingId,
    reservationId: asString((reservation as JsonRecord | null)?.id),
    hostId: String(booking.host_id),
    hostLegalName:
      asString((hostTaxDetails as JsonRecord | null)?.pan_holder_name) ??
      asString((hostRecord as JsonRecord | null)?.display_name) ??
      asString(pricingSnapshot.host_legal_name) ??
      "Host",
    hostGstin:
      asString(((hostTaxDetails as JsonRecord | null)?.metadata as JsonRecord | null)?.gstin) ??
      asString(pricingSnapshot.host_gstin),
    roomBaseAmount: guestArtifact.roomBaseAmount,
    calculationVersion: guestArtifact.calculationVersion,
    invoiceStatus: "issued",
  });

  const { data, error } = await supabase
    .from("platform_fee_invoices")
    .insert({
      invoice_number: artifact.invoiceNumber,
      booking_id: input.bookingId,
      reservation_id: artifact.reservationId,
      host_id: artifact.hostId,
      status: artifact.invoiceStatus,
      taxable_amount: artifact.taxableValue,
      gst_amount: artifact.gstAmount,
      total_amount: artifact.totalAmount,
      payload: artifact as unknown as JsonRecord,
      calculation_version: artifact.calculationVersion,
      issued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}
