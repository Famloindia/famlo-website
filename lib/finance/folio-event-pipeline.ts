import { createHash } from "node:crypto";

import { resolveOtaPaymentCollectMode, type OtaPaymentCollectMode } from "@/lib/channel-booking-normalization";
import { isFinanceEventDryRunEnabled, isFinanceEventPipelineEnabled } from "@/lib/finance/feature-flags";

export type FinanceEventType =
  | "BOOKING_CREATED"
  | "PAYMENT_CAPTURED"
  | "REFUND_CREATED"
  | "BOOKING_CANCELLED"
  | "OTA_BOOKING_IMPORTED"
  | "OTA_BOOKING_MODIFIED"
  | "OTA_BOOKING_CANCELLED";

export type FinanceLineCode =
  | "ROOM_CHARGE"
  | "GUEST_PAYMENT"
  | "PLATFORM_FEE"
  | "REFUND"
  | "HOST_PAYOUT_PENDING"
  | "ADJUSTMENT"
  | "REVERSAL"
  | "CANCELLATION_FEE";

export type PlannedFolioLine = {
  lineCode: FinanceLineCode;
  direction: "debit" | "credit";
  amount: number;
  currency: string;
  description: string;
  idempotencyKey: string;
  sourceEventId: string;
};

export type FinanceEventContractInput = {
  bookingId: string;
  eventType: FinanceEventType;
  sourceEventId: string;
  calculationVersion: string;
  currency?: string | null;
  bookingAmount?: number | null;
  guestPaidAmount?: number | null;
  platformFeeAmount?: number | null;
  hostPayoutAmount?: number | null;
  refundAmount?: number | null;
  adjustmentAmount?: number | null;
  sourceChannel?: string | null;
  paymentCollectMode?: OtaPaymentCollectMode | string | null;
  paymentReferenceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type FinanceEventContractResult = {
  pipelineEnabled: boolean;
  dryRun: boolean;
  plannedLines: PlannedFolioLine[];
};

function sanitizeAmount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function sanitizeSignedAmount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function sanitizeString(value: string | null | undefined, fallback: string): string {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length > 0 ? next : fallback;
}

function defaultPlatformFeeAmount(bookingAmount: number): number {
  return Math.max(0, Math.round((bookingAmount * 1600) / 10000));
}

function defaultHostPayoutAmount(bookingAmount: number, platformFeeAmount: number, refundAmount = 0): number {
  return Math.max(0, bookingAmount - platformFeeAmount - refundAmount);
}

export function buildFolioLineIdempotencyKey(input: {
  bookingId: string;
  eventType: FinanceEventType;
  sourceEventId: string;
  lineCode: FinanceLineCode;
  calculationVersion: string;
}): string {
  const canonical = [
    sanitizeString(input.bookingId, "unknown-booking"),
    sanitizeString(input.eventType, "UNKNOWN_EVENT"),
    sanitizeString(input.sourceEventId, "unknown-source-event"),
    sanitizeString(input.lineCode, "UNKNOWN_LINE"),
    sanitizeString(input.calculationVersion, "v1"),
  ].join(":");

  return createHash("sha256").update(canonical).digest("hex");
}

function buildPlannedLine(
  input: FinanceEventContractInput,
  lineCode: FinanceLineCode,
  direction: "debit" | "credit",
  amount: number,
  description: string
): PlannedFolioLine | null {
  const safeAmount = sanitizeAmount(amount);
  if (safeAmount <= 0) return null;

  return {
    lineCode,
    direction,
    amount: safeAmount,
    currency: sanitizeString(input.currency, "INR"),
    description,
    sourceEventId: sanitizeString(input.sourceEventId, "unknown-source-event"),
    idempotencyKey: buildFolioLineIdempotencyKey({
      bookingId: input.bookingId,
      eventType: input.eventType,
      sourceEventId: sanitizeString(input.sourceEventId, "unknown-source-event"),
      lineCode,
      calculationVersion: sanitizeString(input.calculationVersion, "v1"),
    }),
  };
}

export function planFinanceEventContract(input: FinanceEventContractInput): FinanceEventContractResult {
  const pipelineEnabled = isFinanceEventPipelineEnabled();
  const dryRun = isFinanceEventDryRunEnabled();
  const bookingAmount = sanitizeAmount(input.bookingAmount);
  const guestPaidAmount = sanitizeAmount(input.guestPaidAmount);
  const refundAmount = sanitizeAmount(input.refundAmount);
  const adjustmentAmount = sanitizeSignedAmount(input.adjustmentAmount);
  const platformFeeAmount =
    sanitizeAmount(input.platformFeeAmount) || (bookingAmount > 0 ? defaultPlatformFeeAmount(bookingAmount) : 0);
  const hostPayoutAmount =
    sanitizeAmount(input.hostPayoutAmount) ||
    (bookingAmount > 0 ? defaultHostPayoutAmount(bookingAmount, platformFeeAmount, refundAmount) : 0);

  const lines: Array<PlannedFolioLine | null> = [];

  switch (input.eventType) {
    case "BOOKING_CREATED":
    case "OTA_BOOKING_IMPORTED":
      lines.push(buildPlannedLine(input, "ROOM_CHARGE", "debit", bookingAmount, "Planned stay charge line"));
      lines.push(buildPlannedLine(input, "PLATFORM_FEE", "credit", platformFeeAmount, "Planned platform fee line"));
      lines.push(
        buildPlannedLine(input, "HOST_PAYOUT_PENDING", "credit", hostPayoutAmount, "Planned pending host payout line")
      );
      break;
    case "OTA_BOOKING_MODIFIED":
      lines.push(
        buildPlannedLine(
          input,
          "ADJUSTMENT",
          adjustmentAmount >= 0 ? "debit" : "credit",
          Math.abs(adjustmentAmount),
          "Planned OTA modification adjustment line"
        )
      );
      break;
    case "PAYMENT_CAPTURED":
      lines.push(buildPlannedLine(input, "GUEST_PAYMENT", "credit", guestPaidAmount, "Planned guest payment line"));
      break;
    case "REFUND_CREATED":
      lines.push(buildPlannedLine(input, "REFUND", "debit", refundAmount, "Planned refund line"));
      break;
    case "BOOKING_CANCELLED":
    case "OTA_BOOKING_CANCELLED":
      if (refundAmount > 0) {
        lines.push(buildPlannedLine(input, "REFUND", "debit", refundAmount, "Planned cancellation refund line"));
      }
      if (adjustmentAmount !== 0) {
        lines.push(
          buildPlannedLine(
            input,
            "ADJUSTMENT",
            adjustmentAmount >= 0 ? "debit" : "credit",
            Math.abs(adjustmentAmount),
            "Planned cancellation adjustment line"
          )
        );
      }
      break;
    default:
      break;
  }

  const paymentCollectMode = resolveOtaPaymentCollectMode(input.paymentCollectMode);
  const filteredLines =
    input.eventType === "OTA_BOOKING_IMPORTED" && paymentCollectMode !== "FAMLO_COLLECT"
      ? lines.filter((line) => line?.lineCode !== "GUEST_PAYMENT").filter(Boolean) as PlannedFolioLine[]
      : (lines.filter(Boolean) as PlannedFolioLine[]);

  return {
    pipelineEnabled,
    dryRun,
    plannedLines: filteredLines,
  };
}

export function emitFinanceEventContract(input: FinanceEventContractInput): FinanceEventContractResult {
  const result = planFinanceEventContract(input);
  if (!result.pipelineEnabled) return result;

  const payload = {
    bookingId: input.bookingId,
    eventType: input.eventType,
    sourceEventId: input.sourceEventId,
    calculationVersion: input.calculationVersion,
    sourceChannel: input.sourceChannel ?? null,
    paymentCollectMode: resolveOtaPaymentCollectMode(input.paymentCollectMode),
    dryRun: result.dryRun,
    plannedLines: result.plannedLines,
    metadata: input.metadata ?? {},
  };

  if (result.dryRun) {
    console.info("[finance.event.dry-run]", payload);
    return result;
  }

  console.warn("[finance.event.write-disabled] non-dry-run mode reached before write implementation", payload);
  return result;
}
