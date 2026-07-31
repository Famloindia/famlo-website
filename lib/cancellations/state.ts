export type CancellationStatus =
  | "requested" | "under_review" | "guest_contact_pending" | "guest_contacted"
  | "host_contact_pending" | "host_contacted" | "recommended_approve" | "recommended_reject"
  | "on_hold" | "approved" | "rejected" | "withdrawn" | "refund_pending"
  | "refund_processing" | "refund_failed" | "completed";

const WITHDRAWABLE = new Set<CancellationStatus>([
  "requested", "under_review", "guest_contact_pending", "guest_contacted", "host_contact_pending",
  "host_contacted", "recommended_approve", "recommended_reject", "on_hold",
]);

export function canWithdrawCancellation(status: CancellationStatus): boolean {
  return WITHDRAWABLE.has(status);
}
export function cancellationBlocksSettlement(status: CancellationStatus): boolean {
  return !["rejected", "withdrawn", "completed"].includes(status);
}

export function canServiceExecutivePerform(action: string): boolean {
  return ["assign", "guest_contacted", "guest_unreachable", "host_contacted", "host_unreachable", "recommend_approve", "recommend_reject"].includes(action);
}

export function canAdminApproveRefund(input: {
  status: CancellationStatus;
  approvedMinor: number;
  remainingMinor: number;
  suggestedMinor: number;
  overrideReason?: string | null;
}): boolean {
  if (!["requested", "under_review", "guest_contact_pending", "guest_contacted", "host_contact_pending", "host_contacted", "recommended_approve", "recommended_reject", "on_hold"].includes(input.status)) return false;
  if (!Number.isSafeInteger(input.approvedMinor) || input.approvedMinor < 0 || input.approvedMinor > input.remainingMinor) return false;
  return input.approvedMinor === input.suggestedMinor || Boolean(input.overrideReason?.trim());
}

export type HostSlaStage = "pending" | "reminder_due" | "internal_warning" | "overdue";

export function getHostSlaStage(elapsedHours: number): HostSlaStage {
  if (elapsedHours >= 12) return "overdue";
  if (elapsedHours >= 10) return "internal_warning";
  if (elapsedHours >= 6) return "reminder_due";
  return "pending";
}
