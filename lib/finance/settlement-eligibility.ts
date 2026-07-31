import { resolveOtaPaymentCollectMode, type OtaPaymentCollectMode } from "@/lib/channel-booking-normalization";
import { isDirectSourceChannel } from "@/lib/finance/folio-line-writer";
import { asNumber, asString, type JsonRecord } from "@/lib/platform-utils";

export type SettlementRequiredLineCode = "ROOM_CHARGE" | "PLATFORM_FEE" | "HOST_PAYOUT_PENDING" | "GUEST_PAYMENT";

export type SettlementEligibilityInput = {
  folioId: string;
  bookingId: string | null;
  reservationId: string;
  sourceChannel: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
  guestTotalAmount: number;
  hostPayoutAmount: number;
  refundTotalAmount: number;
  folioMetadata?: JsonRecord | null;
  reservationCheckOutDate?: string | null;
  requiredLineCodes: Set<string>;
  existingActiveSettlementId?: string | null;
  activeCancellationHold?: boolean;
  otaIncluded: boolean;
  requireCheckoutCompleted: boolean;
};

export type SettlementEligibilityResult = {
  eligible: boolean;
  reasons: string[];
  sourceKind: "direct" | "ota";
  paymentCollectMode: OtaPaymentCollectMode;
  isSettlementEligible: boolean;
  ambiguityWarnings: string[];
};

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function getAmbiguityWarnings(metadata: JsonRecord | null | undefined): string[] {
  const warnings = metadata?.ambiguity_warnings;
  return Array.isArray(warnings) ? warnings.map((value) => String(value)).filter(Boolean) : [];
}

function hasRequiredFolioProofLines(lineCodes: Set<string>): boolean {
  return (
    lineCodes.has("ROOM_CHARGE") &&
    lineCodes.has("PLATFORM_FEE") &&
    lineCodes.has("HOST_PAYOUT_PENDING")
  );
}

export function evaluateSettlementEligibility(input: SettlementEligibilityInput): SettlementEligibilityResult {
  const reasons: string[] = [];
  const sourceChannel = asString(input.sourceChannel);
  const sourceKind = isDirectSourceChannel(sourceChannel) ? "direct" : "ota";
  const folioMetadata = input.folioMetadata ?? null;
  const ambiguityWarnings = getAmbiguityWarnings(folioMetadata);
  const paymentCollectMode = resolveOtaPaymentCollectMode(
    asString(folioMetadata?.payment_collect_mode) ??
      asString(folioMetadata?.payment_collect) ??
      null
  );

  if (!input.folioId) reasons.push("missing_folio");
  if (!input.bookingId) reasons.push("missing_booking");
  if (!hasRequiredFolioProofLines(input.requiredLineCodes)) reasons.push("missing_required_proof_lines");

  if (input.requireCheckoutCompleted) {
    const status = normalizeStatus(input.bookingStatus);
    if (status !== "checked_out" && status !== "completed") {
      reasons.push("booking_not_checked_out_or_completed");
    }
  }

  const paymentStatus = normalizeStatus(input.paymentStatus);
  const bookingStatus = normalizeStatus(input.bookingStatus);
  if (bookingStatus === "cancelled" || bookingStatus === "cancelled_by_user" || bookingStatus === "cancelled_by_partner") {
    reasons.push("cancelled_booking");
  }
  if (paymentStatus === "refund_pending" || paymentStatus === "partially_refunded" || paymentStatus === "refunded") {
    reasons.push("refund_not_resolved");
  }

  if (ambiguityWarnings.length > 0) {
    reasons.push("folio_has_ambiguity_warnings");
  }

  if (asString(input.existingActiveSettlementId)) {
    reasons.push("already_in_active_settlement");
  }
  if (input.activeCancellationHold) reasons.push("cancellation_under_review");

  if (asNumber(input.hostPayoutAmount, 0) <= 0) {
    reasons.push("non_positive_host_payout");
  }

  if (sourceKind === "direct") {
    if (paymentStatus !== "paid" && paymentStatus !== "captured") {
      reasons.push("direct_payment_not_captured");
    }
    if (!input.requiredLineCodes.has("GUEST_PAYMENT")) {
      reasons.push("missing_guest_payment_proof");
    }
  } else {
    if (!input.otaIncluded) {
      reasons.push("ota_settlements_disabled");
    }
    if (sourceChannel === "UNKNOWN_OTA") {
      reasons.push("unknown_ota_source");
    }
    if (paymentCollectMode === "UNKNOWN") {
      reasons.push("unknown_payment_collect_mode");
    }
    if (paymentCollectMode === "FAMLO_COLLECT" && !input.requiredLineCodes.has("GUEST_PAYMENT")) {
      reasons.push("missing_guest_payment_proof");
    }
    if ((paymentCollectMode === "OTA_COLLECT" || paymentCollectMode === "PROPERTY_COLLECT") && asNumber(input.guestTotalAmount, 0) <= 0) {
      reasons.push("missing_ota_gross_amount");
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    sourceKind,
    paymentCollectMode,
    isSettlementEligible: reasons.length === 0,
    ambiguityWarnings,
  };
}
