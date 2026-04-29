import { NextResponse } from "next/server";

import { isHostBookingVisibleToPartner } from "@/lib/host-booking-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "42703" && message.includes(columnName)) ||
    (message.includes(columnName) && (message.includes("schema cache") || message.includes("does not exist"))) ||
    (columnName === "stay_unit_id" && message === "")
  );
}

function mapV2BookingRow(row: Record<string, unknown>): Record<string, unknown> {
  const pricing = (row.pricing_snapshot as Record<string, unknown> | null) ?? {};
  const stayUnitId =
    (typeof row.stay_unit_id === "string" && row.stay_unit_id.trim().length > 0 ? row.stay_unit_id : null) ??
    (typeof pricing.stay_unit_id === "string" && pricing.stay_unit_id.trim().length > 0 ? pricing.stay_unit_id : null);

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
    stay_unit_id: stayUnitId,
    users: row.users,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const requestedFamilyId = searchParams.get("familyId");
  const summaryOnly = searchParams.get("summary") === "1";

  try {
    const supabase = createAdminSupabaseClient();
    const familyId = requestedFamilyId?.trim() ?? "";
    if (!familyId) {
      return NextResponse.json(summaryOnly ? { totalStays: 0, totalEarnings: 0 } : []);
    }

    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this host listing." }, { status: 403 });
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
      return NextResponse.json(summaryOnly ? { totalStays: 0, totalEarnings: 0 } : []);
    }

    let bookingRowsV2: Array<Record<string, unknown>> | null = null;
    let bookingError: unknown = null;

    if (summaryOnly) {
      const result = await supabase
        .from("bookings_v2")
        .select("status,payment_status,total_price,partner_payout_amount")
        .in("host_id", hostIds)
        .order("start_date", { ascending: false })
        .limit(200);
      bookingRowsV2 = (result.data ?? []) as unknown as Array<Record<string, unknown>>;
      bookingError = result.error;
    } else {
      const detailedSelectWithStayUnit = [
        "id", "status", "start_date", "end_date", "guests_count",
        "total_price", "partner_payout_amount", "pricing_snapshot",
        "created_at", "user_id", "quarter_type", "quarter_time", "notes", "host_id", "payment_status",
        "conversation_id", "stay_unit_id", "users!user_id(id,name,city,state,gender,about,date_of_birth,kyc_status)",
      ].join(",");
      const detailedSelectFallback = [
        "id", "status", "start_date", "end_date", "guests_count",
        "total_price", "partner_payout_amount", "pricing_snapshot",
        "created_at", "user_id", "quarter_type", "quarter_time", "notes", "host_id", "payment_status",
        "conversation_id", "users!user_id(id,name,city,state,gender,about,date_of_birth,kyc_status)",
      ].join(",");

      let result = await supabase
        .from("bookings_v2")
        .select(detailedSelectWithStayUnit)
        .in("host_id", hostIds)
        .order("start_date", { ascending: false })
        .limit(200);

      if (result.error && isMissingColumnError(result.error, "stay_unit_id")) {
        result = await supabase
          .from("bookings_v2")
          .select(detailedSelectFallback)
          .in("host_id", hostIds)
          .order("start_date", { ascending: false })
          .limit(200);
      }

      bookingRowsV2 = (result.data ?? []) as unknown as Array<Record<string, unknown>>;
      bookingError = result.error;
    }

    if (bookingError) throw bookingError;

    if (summaryOnly) {
      const revenueRows = ((bookingRowsV2 ?? []) as Array<Record<string, unknown>>).filter((row) => {
        if (!isHostBookingVisibleToPartner(row.status, row.payment_status)) return false;
        return (
          row.payment_status === "paid" ||
          row.status === "confirmed" ||
          row.status === "completed" ||
          row.status === "checked_in" ||
          row.status === "accepted"
        );
      });

      const totalEarnings = revenueRows.reduce((acc, row) => {
        const payout = Number(row.partner_payout_amount);
        if (payout > 0) return acc + payout;
        return acc + (Number(row.total_price) || 0);
      }, 0);

      return NextResponse.json({
        totalStays: revenueRows.length,
        totalEarnings,
      });
    }

    const bookingRows = ((bookingRowsV2 ?? []) as unknown as Array<Record<string, unknown>>)
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
