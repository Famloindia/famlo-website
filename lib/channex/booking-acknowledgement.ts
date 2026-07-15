export function assessAcknowledgementEligibility(input: {
  importStatus: string | null;
  ackStatus: string | null;
  linkedBookingId: string | null;
  externalRevisionId: string | null;
  source: string | null;
}): { ok: boolean; status: number; message: string; state: string } {
  const importStatus = input.importStatus ?? "preview";
  const ackStatus = input.ackStatus ?? "not_acknowledged";

  if (!["imported", "modified_applied", "cancelled_applied"].includes(importStatus)) {
    return {
      ok: false,
      status: 409,
      message: "Only successfully applied Famlo revisions can be acknowledged.",
      state: importStatus,
    };
  }

  if (ackStatus !== "not_acknowledged") {
    return {
      ok: false,
      status: 409,
      message: `This booking preview is already ${ackStatus}.`,
      state: ackStatus,
    };
  }

  if (!input.linkedBookingId) {
    return {
      ok: false,
      status: 409,
      message: "A linked Famlo booking is required before acknowledgement.",
      state: "missing_linked_booking",
    };
  }

  if (!input.externalRevisionId) {
    return {
      ok: false,
      status: 409,
      message:
        input.source === "booking_list_api"
          ? "Cannot acknowledge Booking List preview; requires feed revision id."
          : "Cannot acknowledge this preview because external_revision_id is missing.",
      state: "missing_revision_id",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "Revision can be acknowledged after successful apply.",
    state: "eligible",
  };
}
