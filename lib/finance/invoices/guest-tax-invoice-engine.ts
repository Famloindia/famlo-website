import type { SupabaseClient } from "@supabase/supabase-js";

import { isGstInvoiceGenerationEnabled } from "@/lib/finance/feature-flags";
import {
  calculateSection95FinanceContract,
} from "@/lib/finance/section-9-5-engine";
import {
  isSection95TaxMode,
  type Section95FinanceInput,
} from "@/lib/finance/finance-contracts";
import { getFinanceSettings, type FinanceSettings } from "@/lib/finance/settings";
import { assertTaxArtifactAllowed } from "@/lib/finance/tax-compliance-guard";

type JsonRecord = Record<string, unknown>;

export type GuestInvoiceLineItem = {
  roomId: string | null;
  date: string | null;
  description: string;
  roomBaseAmount: number;
  gstRateBps: number;
  gstAmount: number;
  totalAmount: number;
};

export type GuestTaxInvoiceDraftInput = {
  bookingId: string;
  reservationId: string | null;
  guestId: string | null;
  guestName: string;
  guestGstin?: string | null;
  requireGuestGstin?: boolean;
  propertyName: string;
  propertyAddress: string;
  checkIn: string | null;
  checkOut: string | null;
  placeOfSupply: string;
  nights: Section95FinanceInput["nights"];
  famloLegalEntityName: string;
  famloGstin: string;
  famloAddress: string;
  calculationVersion?: string | null;
  invoiceDate?: string | null;
  invoiceStatus?: "draft" | "issued" | "cancelled";
  taxMode?: string | null;
};

export type GuestTaxInvoiceArtifact = {
  invoiceNumber: string;
  invoiceDate: string;
  bookingId: string;
  reservationId: string | null;
  guestId: string | null;
  guestName: string;
  guestGstin: string | null;
  famloLegalEntityName: string;
  famloGstin: string;
  famloAddress: string;
  sacCode: "9963";
  propertyName: string;
  propertyAddress: string;
  checkIn: string | null;
  checkOut: string | null;
  lineItems: GuestInvoiceLineItem[];
  roomBaseAmount: number;
  gstAmount: number;
  totalInvoiceAmount: number;
  placeOfSupply: string;
  invoiceStatus: "draft" | "issued" | "cancelled";
  calculationVersion: string;
  issuerRole: "FAMLO";
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function clampMoney(value: number): number {
  return Math.max(0, Math.round(value));
}

function issueNumber(prefix: string, entityId: string, calculationVersion: string): string {
  const clean = entityId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const version = calculationVersion.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8) || "V1";
  return `${prefix}-${clean}-${version}`;
}

function resolveInvoiceDate(value: string | null | undefined): string {
  const trimmed = asString(value);
  return trimmed ?? new Date().toISOString().slice(0, 10);
}

export function buildGuestTaxInvoiceArtifact(input: GuestTaxInvoiceDraftInput): GuestTaxInvoiceArtifact {
  if (input.requireGuestGstin && !asString(input.guestGstin)) {
    throw new Error("Guest GSTIN is required for B2B or ITC-requested guest tax invoices.");
  }

  const contract = calculateSection95FinanceContract({
    taxMode: (isSection95TaxMode(input.taxMode) ? "ECO_SECTION_9_5" : "PENDING_COMPLIANCE") as any,
    nights: input.nights,
  });

  const calculationVersion = asString(input.calculationVersion) ?? contract.calculationVersion;
  const invoiceNumber = issueNumber("GTI", input.bookingId, calculationVersion);

  return {
    invoiceNumber,
    invoiceDate: resolveInvoiceDate(input.invoiceDate),
    bookingId: input.bookingId,
    reservationId: input.reservationId,
    guestId: input.guestId,
    guestName: input.guestName,
    guestGstin: asString(input.guestGstin),
    famloLegalEntityName: input.famloLegalEntityName,
    famloGstin: input.famloGstin,
    famloAddress: input.famloAddress,
    sacCode: "9963",
    propertyName: input.propertyName,
    propertyAddress: input.propertyAddress,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    lineItems: contract.accommodationGstBreakdown.map((night, index) => ({
      roomId: night.roomId,
      date: night.date,
      description: `Accommodation charge ${index + 1}`,
      roomBaseAmount: clampMoney(night.actualValue),
      gstRateBps: night.gstRateBps,
      gstAmount: clampMoney(night.gstAmount),
      totalAmount: clampMoney(night.actualValue + night.gstAmount),
    })),
    roomBaseAmount: contract.roomBaseAmount,
    gstAmount: contract.accommodationGstAmount,
    totalInvoiceAmount: contract.guestPayableAmount,
    placeOfSupply: input.placeOfSupply,
    invoiceStatus: input.invoiceStatus ?? "draft",
    calculationVersion,
    issuerRole: "FAMLO",
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function resolveIssuerProfile(): {
  legalName: string;
  gstin: string;
  address: string;
} {
  return {
    legalName: requireEnv("FAMLO_LEGAL_ENTITY_NAME"),
    gstin: requireEnv("FAMLO_GSTIN"),
    address: requireEnv("FAMLO_LEGAL_ADDRESS"),
  };
}

function normalizeNights(value: unknown): Section95FinanceInput["nights"] {
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
    .filter(Boolean) as Section95FinanceInput["nights"];
}

export async function generateGuestTaxInvoice(
  supabase: SupabaseClient,
  input: { bookingId: string; actorUserId?: string | null }
): Promise<string> {
  const settings = await getFinanceSettings({}, supabase);
  assertTaxArtifactAllowed(settings, "CREATE_GST_INVOICE");
  if (!isGstInvoiceGenerationEnabled()) {
    throw new Error("GST invoice generation is disabled by feature flag.");
  }
  if (!isSection95TaxMode(settings.taxMode)) {
    throw new Error("Guest tax invoices require Section 9(5) tax mode.");
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,user_id,guest_name,payment_status,status,pricing_snapshot,start_date,end_date")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("Booking not found.");
  if (!["paid", "captured"].includes(String(booking.payment_status ?? "").trim().toLowerCase())) {
    throw new Error("Guest tax invoice can only be generated after payment capture.");
  }

  const { data: reservation } = await supabase
    .from("reservations_v2")
    .select("id")
    .eq("booking_id", input.bookingId)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("guest_tax_invoices")
    .select("id")
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const pricingSnapshot = (booking.pricing_snapshot as JsonRecord | null) ?? {};
  const section95Input = (pricingSnapshot.section_9_5_input as JsonRecord | null) ?? null;
  const section95Contract = (pricingSnapshot.section_9_5_contract as JsonRecord | null) ?? null;
  const issuer = resolveIssuerProfile();
  const nights = normalizeNights(
    pricingSnapshot.section_9_5_input_nights ??
      section95Input?.nights ??
      pricingSnapshot.room_nights
  );
  if (nights.length === 0) {
    throw new Error("Guest tax invoice requires room-night pricing data.");
  }

  const requireGuestGstin = Boolean(
    pricingSnapshot.company_booking === true ||
      pricingSnapshot.itc_requested === true ||
      String(pricingSnapshot.guest_type ?? "").trim().toLowerCase() === "b2b"
  );

  const artifact = buildGuestTaxInvoiceArtifact({
    bookingId: input.bookingId,
    reservationId: asString((reservation as JsonRecord | null)?.id),
    guestId: asString(booking.user_id),
    guestName: asString((booking as JsonRecord).guest_name) ?? "Guest",
    guestGstin: asString(pricingSnapshot.guest_gstin),
    requireGuestGstin,
    propertyName: asString(pricingSnapshot.property_name) ?? "Property",
    propertyAddress: asString(pricingSnapshot.property_address) ?? "Property address unavailable",
    checkIn: asString((booking as JsonRecord).start_date),
    checkOut: asString((booking as JsonRecord).end_date),
    placeOfSupply: asString(pricingSnapshot.place_of_supply) ?? "India",
    nights,
    famloLegalEntityName: issuer.legalName,
    famloGstin: issuer.gstin,
    famloAddress: issuer.address,
    calculationVersion: asString(section95Contract?.calculationVersion),
    invoiceStatus: "issued",
    taxMode: settings.taxMode,
  });

  const { data, error } = await supabase
    .from("guest_tax_invoices")
    .insert({
      invoice_number: artifact.invoiceNumber,
      booking_id: input.bookingId,
      reservation_id: artifact.reservationId,
      guest_id: artifact.guestId,
      invoice_type: "guest_tax_invoice",
      status: artifact.invoiceStatus,
      taxable_amount: artifact.roomBaseAmount,
      gst_amount: artifact.gstAmount,
      total_amount: artifact.totalInvoiceAmount,
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
