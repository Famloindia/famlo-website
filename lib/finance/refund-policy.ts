import { applyRateBps, clampMoney } from "@/lib/finance/money";

export type RefundPolicyCase =
  | "FREE_CANCELLATION"
  | "PARTIAL_CANCELLATION"
  | "NO_SHOW"
  | "HOST_CANCELLATION";

export type RefundPolicyNightInput = {
  actualValue: number;
};

export type RefundPolicyInput = {
  policyCase: RefundPolicyCase;
  roomBaseAmount: number;
  accommodationGstAmount: number;
  guestPayableAmount?: number;
  retentionPercent?: number;
  nights?: RefundPolicyNightInput[];
};

export type RefundPolicyResult = {
  policyCase: RefundPolicyCase;
  refundAmount: number;
  refundBaseAmount: number;
  refundGstAmount: number;
  retainedBaseAmount: number;
  retainedGstAmount: number;
  hostRecalculatedPayout: number;
  famloRetainedAmount: number;
  hostPenaltyAmount: number;
  notes: string[];
};

const LOWER_SLAB_THRESHOLD = 7500;

function resolveRetentionPercent(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function recalculateGstForRetainedBase(retentionPercent: number, nights: RefundPolicyNightInput[] | undefined, retainedBaseAmount: number): number {
  if (Array.isArray(nights) && nights.length > 0) {
    return clampMoney(
      nights.reduce((sum, night) => {
        const retainedNightBase = clampMoney(night.actualValue * retentionPercent);
        const rateBps = retainedNightBase <= LOWER_SLAB_THRESHOLD ? 500 : 1800;
        return sum + clampMoney(applyRateBps(retainedNightBase, rateBps));
      }, 0)
    );
  }

  const rateBps = retainedBaseAmount <= LOWER_SLAB_THRESHOLD ? 500 : 1800;
  return clampMoney(applyRateBps(retainedBaseAmount, rateBps));
}

export function calculateRefundPolicy(input: RefundPolicyInput): RefundPolicyResult {
  const roomBaseAmount = clampMoney(input.roomBaseAmount);
  const accommodationGstAmount = clampMoney(input.accommodationGstAmount);
  const guestPayableAmount = clampMoney(input.guestPayableAmount ?? roomBaseAmount + accommodationGstAmount);
  const retentionPercent = resolveRetentionPercent(input.retentionPercent);

  switch (input.policyCase) {
    case "FREE_CANCELLATION":
    case "HOST_CANCELLATION":
      return {
        policyCase: input.policyCase,
        refundAmount: guestPayableAmount,
        refundBaseAmount: roomBaseAmount,
        refundGstAmount: accommodationGstAmount,
        retainedBaseAmount: 0,
        retainedGstAmount: 0,
        hostRecalculatedPayout: 0,
        famloRetainedAmount: 0,
        hostPenaltyAmount: 0,
        notes: [input.policyCase === "HOST_CANCELLATION" ? "Host cancellation triggers a full guest refund." : "Free cancellation triggers a full guest refund."],
      };
    case "NO_SHOW":
      return {
        policyCase: input.policyCase,
        refundAmount: 0,
        refundBaseAmount: 0,
        refundGstAmount: 0,
        retainedBaseAmount: roomBaseAmount,
        retainedGstAmount: accommodationGstAmount,
        hostRecalculatedPayout: clampMoney(roomBaseAmount * 0.84),
        famloRetainedAmount: clampMoney(roomBaseAmount * 0.16),
        hostPenaltyAmount: 0,
        notes: ["No-show keeps full booking economics intact and does not trigger a refund."],
      };
    case "PARTIAL_CANCELLATION":
    default: {
      const retainedBaseAmount = clampMoney(roomBaseAmount * retentionPercent);
      const refundBaseAmount = clampMoney(roomBaseAmount - retainedBaseAmount);
      const retainedGstAmount = recalculateGstForRetainedBase(retentionPercent, input.nights, retainedBaseAmount);
      const refundGstAmount = clampMoney(accommodationGstAmount - retainedGstAmount);
      return {
        policyCase: "PARTIAL_CANCELLATION",
        refundAmount: clampMoney(refundBaseAmount + refundGstAmount),
        refundBaseAmount,
        refundGstAmount,
        retainedBaseAmount,
        retainedGstAmount,
        hostRecalculatedPayout: clampMoney(retainedBaseAmount * 0.84),
        famloRetainedAmount: clampMoney(retainedBaseAmount * 0.16),
        hostPenaltyAmount: 0,
        notes: ["Partial cancellation recalculates retained GST on the retained transaction value before computing the refund."],
      };
    }
  }
}
