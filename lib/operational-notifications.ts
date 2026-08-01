import type { SupabaseClient } from "@supabase/supabase-js";

import type { JsonRecord } from "@/lib/platform-utils";

export async function enqueuePaidBookingOperationalNotifications(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    hostUserId: string | null;
    familyId: string | null;
    dashboardUrl: string;
    message: string;
    metadata?: JsonRecord;
  }
): Promise<void> {
  const now = Date.now();
  const rows = [
    ...(input.hostUserId
      ? [{
          recipient_role: "host",
          recipient_user_id: input.hostUserId,
          booking_id: input.bookingId,
          family_id: input.familyId,
          event_type: "booking_host_action_required",
          title: "New booking request",
          message: input.message,
          cta_url: input.dashboardUrl,
          dedupe_key: `host:booking_host_action_required:${input.bookingId}`,
          metadata: input.metadata ?? {},
        }]
      : []),
    {
      recipient_role: "admin",
      recipient_user_id: null,
      booking_id: input.bookingId,
      family_id: input.familyId,
      event_type: "paid_booking_awaiting_host",
      title: "Paid booking awaiting host approval",
      message: "A paid booking is waiting for the host decision.",
      cta_url: `/admin/finance/bookings/${encodeURIComponent(input.bookingId)}`,
      dedupe_key: `admin:paid_booking_awaiting_host:${input.bookingId}`,
      metadata: input.metadata ?? {},
    },
    {
      recipient_role: "service",
      recipient_user_id: null,
      booking_id: input.bookingId,
      family_id: input.familyId,
      event_type: "host_approval_sla",
      title: "Host approval SLA review",
      message: "Check this paid booking if the host has not responded within 30 minutes.",
      cta_url: `/admin/finance/bookings/${encodeURIComponent(input.bookingId)}`,
      visible_after: new Date(now + 30 * 60 * 1000).toISOString(),
      dedupe_key: `service:host_approval_sla:${input.bookingId}`,
      metadata: input.metadata ?? {},
    },
  ];

  const { error } = await supabase
    .from("operational_notifications")
    .upsert(rows as never, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) throw error;
}
