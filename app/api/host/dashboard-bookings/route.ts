import { NextResponse } from "next/server";

import { isHostBookingVisibleToPartner } from "@/lib/host-booking-state";
import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

function mapV2BookingRow(row: Record<string, unknown>): Record<string, unknown> {
  const pricing = (row.pricing_snapshot as Record<string, unknown> | null) ?? {};
  return {
    id: row.id,
    status: row.status,
    payment_status: row.payment_status,
    date_from: row.start_date,
    date_to: row.end_date,
    guests_count: row.guests_count,
    total_price: row.total_price,
    family_payout: row.partner_payout_amount,
    base_price: pricing.base_price ?? pricing.unit_price ?? null,
    platform_fee: pricing.platform_fee ?? null,
    created_at: row.created_at,
    user_id: row.user_id,
    quarter_type: row.quarter_type,
    quarter_time: row.quarter_time,
    vibe: row.notes,
    family_id: row.host_id,
    conversation_id: row.conversation_id,
    stay_unit_id: row.stay_unit_id ?? null,
    users: row.users,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const requestedFamilyId = searchParams.get("familyId");

  try {
    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    if (!hostSession?.familyId && !hostSession?.hostUserId) {
      return NextResponse.json({ error: "Host session required." }, { status: 401 });
    }

    if (requestedFamilyId && hostSession.familyId && requestedFamilyId !== hostSession.familyId) {
      return NextResponse.json({ error: "You can only load your own booking data." }, { status: 403 });
    }

    const familyId = requestedFamilyId ?? hostSession.familyId;
    if (!familyId) {
      return NextResponse.json([]);
    }

    const { data: v2Hosts, error: hostError } = await supabase
      .from("hosts")
      .select("id,legacy_family_id")
      .eq("legacy_family_id", familyId);

    if (hostError) throw hostError;

    const hostIds = ((v2Hosts ?? []) as Array<Record<string, unknown>>)
      .map((row) => (typeof row.id === "string" ? row.id : null))
      .filter((value): value is string => Boolean(value));

    const familyIdByHostId = new Map(
      ((v2Hosts ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const hostId = typeof row.id === "string" ? row.id : null;
          const legacyFamilyId = typeof row.legacy_family_id === "string" ? row.legacy_family_id : null;
          return hostId && legacyFamilyId ? [hostId, legacyFamilyId] : null;
        })
        .filter((entry): entry is [string, string] => Boolean(entry))
    );

    if (hostIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: bookingRowsV2, error: bookingError } = await supabase
      .from("bookings_v2")
      .select([
        "id", "status", "start_date", "end_date", "guests_count",
        "total_price", "partner_payout_amount", "pricing_snapshot",
        "created_at", "user_id", "quarter_type", "quarter_time", "notes", "host_id", "payment_status",
        "conversation_id", "stay_unit_id", "users!user_id(id,name,city,state,gender,about,kyc_status)",
      ].join(","))
      .in("host_id", hostIds)
      .order("start_date", { ascending: false })
      .limit(200);

    if (bookingError) throw bookingError;

    const bookingRows = ((bookingRowsV2 ?? []) as Array<Record<string, unknown>>)
      .filter((row) => isHostBookingVisibleToPartner(row.status, row.payment_status))
      .map((row) => {
        const mapped = mapV2BookingRow(row);
        const v2HostId = typeof row.host_id === "string" ? row.host_id : null;
        return {
          ...mapped,
          family_id: v2HostId ? (familyIdByHostId.get(v2HostId) ?? v2HostId) : mapped.family_id,
        };
      });

    return NextResponse.json(bookingRows);
  } catch (error) {
    console.error("[host.dashboard-bookings] load:error", error);
    return NextResponse.json({ error: "Failed to load booking rows." }, { status: 500 });
  }
}
