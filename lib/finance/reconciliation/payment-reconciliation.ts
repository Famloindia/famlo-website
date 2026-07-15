import { resolveInternalGuestPayableAmount } from "@/lib/payment-intent";

import {
  buildReconciliationIssue,
  type ReconciliationIssue,
} from "@/lib/finance/reconciliation/reconciliation-contracts";

type JsonRecord = Record<string, unknown>;

export type PaymentReconciliationPaymentRow = {
  id: string;
  booking_id?: string | null;
  gateway?: string | null;
  status?: string | null;
  amount_total?: number | null;
  gateway_payment_id?: string | null;
  gateway_order_id?: string | null;
  raw_response?: JsonRecord | null;
  created_at?: string | null;
};

export type PaymentReconciliationBookingRow = {
  id: string;
  payment_id?: string | null;
  payment_status?: string | null;
  status?: string | null;
  total_price?: number | null;
  pricing_snapshot?: JsonRecord | null;
};

export type PaymentReconciliationIntentRow = {
  payment_id?: string | null;
  booking_id?: string | null;
  provider?: string | null;
  provider_order_id?: string | null;
};

export type PaymentReconciliationProviderEventRow = {
  provider?: string | null;
  event_type?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  signature_valid?: boolean | null;
  processing_status?: string | null;
  created_at?: string | null;
};

export type PaymentReconciliationFolioLineRow = {
  booking_id?: string | null;
  line_code?: string | null;
  source_event_type?: string | null;
  source_event_id?: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isCapturedStatus(status: unknown): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "paid" || normalized === "captured";
}

export function reconcilePayments(input: {
  payments: PaymentReconciliationPaymentRow[];
  bookings: PaymentReconciliationBookingRow[];
  paymentIntents: PaymentReconciliationIntentRow[];
  providerEvents: PaymentReconciliationProviderEventRow[];
  folioLines: PaymentReconciliationFolioLineRow[];
}): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const bookingById = new Map(input.bookings.map((booking) => [booking.id, booking]));
  const intentsByPaymentId = new Map<string, PaymentReconciliationIntentRow>();
  for (const intent of input.paymentIntents) {
    const paymentId = asString(intent.payment_id);
    if (!paymentId) continue;
    intentsByPaymentId.set(paymentId, intent);
  }

  for (const payment of input.payments) {
    if (normalizeStatus(payment.gateway) !== "razorpay") continue;

    const bookingId = asString(payment.booking_id);
    const gatewayPaymentId = asString(payment.gateway_payment_id);
    const gatewayOrderId = asString(payment.gateway_order_id);
    const booking = bookingId ? bookingById.get(bookingId) ?? null : null;
    const paymentStatus = normalizeStatus(payment.status);
    const guestPaymentLines = input.folioLines.filter(
      (line) => asString(line.booking_id) === bookingId && asString(line.line_code) === "GUEST_PAYMENT"
    );
    const matchingIntent = intentsByPaymentId.get(payment.id) ?? null;
    const matchingEvents = input.providerEvents.filter((event) => {
      if (normalizeStatus(event.provider) !== "razorpay") return false;
      const entityId = asString(event.entity_id);
      return entityId === gatewayPaymentId || entityId === gatewayOrderId;
    });

    if (isCapturedStatus(paymentStatus)) {
      if (!booking || asString(booking.payment_id) !== payment.id || !matchingIntent) {
        issues.push(
          buildReconciliationIssue({
            type: "PAYMENT",
            entityId: payment.id,
            provider: "RAZORPAY",
            providerEntityId: gatewayPaymentId,
            severity: "critical",
            reasonCode: "captured_payment_missing_booking_or_intent",
            details: {
              bookingId,
              bookingPaymentId: booking ? asString(booking.payment_id) : null,
              hasIntent: Boolean(matchingIntent),
            },
            firstSeenAt: asString(payment.created_at),
          })
        );
      }

      const expectedAmount = booking
        ? resolveInternalGuestPayableAmount(asNumber(booking.total_price), booking.pricing_snapshot ?? null)
        : null;
      if (expectedAmount !== null && expectedAmount !== asNumber(payment.amount_total)) {
        issues.push(
          buildReconciliationIssue({
            type: "PAYMENT",
            entityId: payment.id,
            provider: "RAZORPAY",
            providerEntityId: gatewayPaymentId,
            severity: "critical",
            reasonCode: "captured_payment_amount_mismatch",
            expectedAmount,
            observedAmount: asNumber(payment.amount_total),
            details: {
              bookingId,
            },
            firstSeenAt: asString(payment.created_at),
          })
        );
      }

      if (guestPaymentLines.length > 1) {
        issues.push(
          buildReconciliationIssue({
            type: "PAYMENT",
            entityId: payment.id,
            provider: "RAZORPAY",
            providerEntityId: gatewayPaymentId,
            severity: "critical",
            reasonCode: "duplicate_guest_payment_proof_lines",
            expectedAmount: 1,
            observedAmount: guestPaymentLines.length,
            details: { bookingId },
            firstSeenAt: asString(payment.created_at),
          })
        );
      }

      if (guestPaymentLines.length === 0) {
        issues.push(
          buildReconciliationIssue({
            type: "PAYMENT",
            entityId: payment.id,
            provider: "RAZORPAY",
            providerEntityId: gatewayPaymentId,
            severity: "critical",
            reasonCode: "missing_guest_payment_proof_line",
            details: { bookingId },
            firstSeenAt: asString(payment.created_at),
          })
        );
      }

      if (matchingEvents.length === 0) {
        issues.push(
          buildReconciliationIssue({
            type: "PAYMENT",
            entityId: payment.id,
            provider: "RAZORPAY",
            providerEntityId: gatewayPaymentId,
            severity: "warning",
            reasonCode: "missing_provider_event_for_finalized_payment",
            details: { bookingId },
            firstSeenAt: asString(payment.created_at),
          })
        );
      }

      const rawResponse = payment.raw_response ?? {};
      const hasSettlementInfo =
        typeof rawResponse === "object" &&
        !Array.isArray(rawResponse) &&
        (asString((rawResponse as JsonRecord).settlement_id) || asString((rawResponse as JsonRecord).fee));
      if (!hasSettlementInfo) {
        issues.push(
          buildReconciliationIssue({
            type: "PAYMENT",
            entityId: payment.id,
            provider: "RAZORPAY",
            providerEntityId: gatewayPaymentId,
            severity: "info",
            reasonCode: "missing_gateway_settlement_or_fee_metadata",
            details: { bookingId },
            firstSeenAt: asString(payment.created_at),
          })
        );
      }
    } else if (
      paymentStatus === "failed" ||
      paymentStatus === "created" ||
      paymentStatus === "authorized" ||
      paymentStatus === "pending"
    ) {
      if (guestPaymentLines.length > 0 || normalizeStatus(booking?.payment_status) === "paid") {
        issues.push(
          buildReconciliationIssue({
            type: "PAYMENT",
            entityId: payment.id,
            provider: "RAZORPAY",
            providerEntityId: gatewayPaymentId,
            severity: "critical",
            reasonCode: "non_captured_payment_finalized",
            details: {
              bookingId,
              paymentStatus,
              bookingPaymentStatus: normalizeStatus(booking?.payment_status),
              guestPaymentProofCount: guestPaymentLines.length,
            },
            firstSeenAt: asString(payment.created_at),
          })
        );
      }
    }
  }

  return issues;
}
