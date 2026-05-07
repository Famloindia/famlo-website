import { NextResponse } from "next/server";

import { isHostBookingVisibleToPartner } from "@/lib/host-booking-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadUserProfileCompatibility } from "@/lib/user-profile";

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

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

async function loadFamilyRows(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyIds: string[]
): Promise<Array<Record<string, unknown>>> {
  if (familyIds.length === 0) return [];

  const initialResult = await supabase
    .from("families")
    .select("id,name,property_name,city,state,village")
    .in("id", familyIds);

  if (initialResult.error && isMissingColumnError(initialResult.error, "property_name")) {
    const fallbackResult = await supabase
      .from("families")
      .select("id,name,city,state,village")
      .in("id", familyIds);
    if (fallbackResult.error) {
      console.warn("[host.dashboard-bookings] family enrichment skipped", fallbackResult.error);
      return [];
    }
    return (fallbackResult.data ?? []) as Array<Record<string, unknown>>;
  }

  if (initialResult.error) {
    console.warn("[host.dashboard-bookings] family enrichment skipped", initialResult.error);
    return [];
  }

  return (initialResult.data ?? []) as Array<Record<string, unknown>>;
}

async function loadStayUnitRows(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  stayUnitIds: string[]
): Promise<Array<Record<string, unknown>>> {
  if (stayUnitIds.length === 0) return [];

  const initialResult = await supabase
    .from("stay_units_v2")
    .select("id,name,unit_key,host_id")
    .in("id", stayUnitIds);

  if (initialResult.error && isMissingColumnError(initialResult.error, "unit_key")) {
    const fallbackResult = await supabase
      .from("stay_units_v2")
      .select("id,name,host_id")
      .in("id", stayUnitIds);
    if (fallbackResult.error) {
      console.warn("[host.dashboard-bookings] stay unit enrichment skipped", fallbackResult.error);
      return [];
    }
    return (fallbackResult.data ?? []) as Array<Record<string, unknown>>;
  }

  if (initialResult.error) {
    console.warn("[host.dashboard-bookings] stay unit enrichment skipped", initialResult.error);
    return [];
  }

  return (initialResult.data ?? []) as Array<Record<string, unknown>>;
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
    const uniqueFamilyIds = Array.from(new Set(familyIdByHostId.values()));

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

    const bookingRows: Array<Record<string, unknown>> = ((bookingRowsV2 ?? []) as unknown as Array<Record<string, unknown>>)
      .filter((row) => isHostBookingVisibleToPartner(row.status, row.payment_status))
      .map((row) => {
        const mapped = mapV2BookingRow(row);
        const v2HostId = typeof row.host_id === "string" ? row.host_id : null;
        return {
          ...mapped,
          family_id: v2HostId ? (familyIdByHostId.get(v2HostId) ?? v2HostId) : mapped.family_id,
        };
      });

    const guestUserIds = Array.from(
      new Set(
        bookingRows
          .map((row) => (typeof row.user_id === "string" ? row.user_id : null))
          .filter((value): value is string => Boolean(value))
      )
    );
    const stayUnitIds = Array.from(
      new Set(
        bookingRows
          .map((row) => (typeof row.stay_unit_id === "string" ? row.stay_unit_id : null))
          .filter((value): value is string => Boolean(value))
      )
    );

    const [familyRows, stayUnitRows, guestProfiles] = await Promise.all([
      loadFamilyRows(supabase, uniqueFamilyIds),
      loadStayUnitRows(supabase, stayUnitIds),
      Promise.all(
        guestUserIds.map(async (userId) => {
          try {
            const profile = await loadUserProfileCompatibility(supabase, userId);
            return [userId, profile] as const;
          } catch (error) {
            console.warn("[host.dashboard-bookings] guest profile enrichment skipped", { userId, error });
            return [userId, null] as const;
          }
        })
      ),
    ]);

    const familyById = new Map(
      familyRows
        .map((row) => (typeof row.id === "string" ? [row.id, row] : null))
        .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry))
    );
    const stayUnitById = new Map(
      stayUnitRows
        .map((row) => (typeof row.id === "string" ? [row.id, row] : null))
        .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry))
    );
    const guestProfileById = new Map(guestProfiles);

    const enrichedRows = bookingRows.map((row) => {
      const familyRow = typeof row.family_id === "string" ? familyById.get(row.family_id) : null;
      const stayUnitRow = typeof row.stay_unit_id === "string" ? stayUnitById.get(row.stay_unit_id) : null;
      const guestProfile = typeof row.user_id === "string" ? guestProfileById.get(row.user_id) : null;
      const userRecord =
        row.users && typeof row.users === "object" && !Array.isArray(row.users)
          ? ({ ...(row.users as Record<string, unknown>) } as Record<string, unknown>)
          : {};

      if (guestProfile?.avatar_url) {
        userRecord.avatar_url = guestProfile.avatar_url;
      }
      if (!userRecord.city && guestProfile?.city) {
        userRecord.city = guestProfile.city;
      }
      if (!userRecord.state && guestProfile?.state) {
        userRecord.state = guestProfile.state;
      }
      if (!userRecord.about && guestProfile?.about) {
        userRecord.about = guestProfile.about;
      }
      if (!userRecord.gender && guestProfile?.gender) {
        userRecord.gender = guestProfile.gender;
      }
      if (!userRecord.date_of_birth && guestProfile?.date_of_birth) {
        userRecord.date_of_birth = guestProfile.date_of_birth;
      }

      return {
        ...row,
        users: userRecord,
        property_name: firstString(familyRow?.property_name, familyRow?.name, stayUnitRow?.name, "Famlo Stay"),
        property_location: firstString(familyRow?.village, familyRow?.city, familyRow?.state),
        stay_unit_name: firstString(stayUnitRow?.name, stayUnitRow?.unit_key),
      };
    });

    return NextResponse.json(enrichedRows);
  } catch (error) {
    console.error("[host.dashboard-bookings] load:error", error);
    return NextResponse.json({ error: "Failed to load booking rows." }, { status: 500 });
  }
}
