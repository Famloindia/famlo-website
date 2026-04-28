function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isHostBookingVisibleToPartner(status: unknown, paymentStatus: unknown): boolean {
  const normalizedStatus = normalize(status);
  const normalizedPaymentStatus = normalize(paymentStatus);

  if (
    normalizedStatus === "rejected" ||
    normalizedStatus === "cancelled" ||
    normalizedStatus === "cancelled_by_partner"
  ) {
    return false;
  }

  if (normalizedPaymentStatus === "paid") {
    return true;
  }

  return (
    normalizedStatus === "awaiting_payment" ||
    normalizedStatus === "pending" ||
    normalizedStatus === "confirmed" ||
    normalizedStatus === "accepted" ||
    normalizedStatus === "cancelled_by_user" ||
    normalizedStatus === "checked_in" ||
    normalizedStatus === "completed"
  );
}

export function isHostBookingInventoryBlocking(status: unknown, paymentStatus: unknown): boolean {
  const normalizedStatus = normalize(status);
  const normalizedPaymentStatus = normalize(paymentStatus);

  if (
    normalizedStatus === "rejected" ||
    normalizedStatus === "cancelled" ||
    normalizedStatus === "cancelled_by_user" ||
    normalizedStatus === "cancelled_by_partner" ||
    normalizedPaymentStatus === "refunded" ||
    normalizedPaymentStatus === "partially_refunded"
  ) {
    return false;
  }

  return isHostBookingVisibleToPartner(normalizedStatus, normalizedPaymentStatus);
}
