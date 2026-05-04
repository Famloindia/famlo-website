import { NextResponse } from "next/server";

import { fetchChannexBookingFeed, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type FeedBody = {
  familyId?: string;
};

type BookingFeedSummary = {
  externalBookingId: string | null;
  revisionId: string | null;
  status: string | null;
  otaName: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  guestName: string | null;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
  amount: string | null;
  currency: string | null;
  paymentCollect: string | null;
  paymentType: string | null;
  unmatchedRoom: boolean;
  insertedAt: string | null;
  importStatus: string;
  ackStatus: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function summarizeGuestName(customer: unknown): string | null {
  const record = asObject(customer);
  if (!record) return null;

  const name = asStringOrNull(record.name);
  const surname = asStringOrNull(record.surname);
  const combined = [name, surname].filter(Boolean).join(" ");
  return combined || null;
}

function asNumericStringOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
  }
  return null;
}

function summarizeRevision(
  revision: Record<string, unknown>,
  mappedRoomTypeIds: Set<string>
): BookingFeedSummary {
  const rooms = Array.isArray(revision.rooms) ? revision.rooms : [];
  const firstRoom = rooms.find((room) => room && typeof room === "object" && !Array.isArray(room)) as
    | Record<string, unknown>
    | undefined;

  const externalRoomTypeId = asStringOrNull(firstRoom?.room_type_id);
  const externalRatePlanId = asStringOrNull(firstRoom?.rate_plan_id);

  return {
    externalBookingId:
      asStringOrNull(revision.unique_id) ??
      asStringOrNull(revision.booking_id) ??
      asStringOrNull(revision.ota_reservation_code),
    revisionId: asStringOrNull(revision.id),
    status: asStringOrNull(revision.status),
    otaName: asStringOrNull(revision.ota_name),
    arrivalDate: asStringOrNull(revision.arrival_date) ?? asStringOrNull(firstRoom?.checkin_date),
    departureDate: asStringOrNull(revision.departure_date) ?? asStringOrNull(firstRoom?.checkout_date),
    guestName: summarizeGuestName(revision.customer),
    externalRoomTypeId,
    externalRatePlanId,
    amount: asStringOrNull(revision.amount) ?? asStringOrNull(firstRoom?.amount),
    currency: asStringOrNull(revision.currency),
    paymentCollect: asStringOrNull(revision.payment_collect),
    paymentType: asStringOrNull(revision.payment_type),
    unmatchedRoom: externalRoomTypeId ? !mappedRoomTypeIds.has(externalRoomTypeId) : true,
    insertedAt: asStringOrNull(revision.inserted_at),
    importStatus: "preview",
    ackStatus: "not_acknowledged",
  };
}

async function logFeedResult(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "store_booking_feed_preview",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.feed] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as FeedBody;
    const familyId = asString(body.familyId);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const config = getChannexConfigSummary();
    if (!config.configured) {
      return NextResponse.json(
        {
          ok: false,
          status: "missing_config",
          message: "Channex staging configuration is incomplete.",
          configured: false,
          revisions: [],
        },
        { status: 503 }
      );
    }

    const [{ data: propertyRow }, { data: roomMappingRows }] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("external_property_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("channel_room_mappings")
        .select("external_room_type_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
    ]);

    const externalPropertyId = asStringOrNull(propertyRow?.external_property_id);
    if (!externalPropertyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "create_property_first",
          message: "Create provider property first before checking the Channex booking feed.",
          revisions: [],
        },
        { status: 409 }
      );
    }

    const result = await fetchChannexBookingFeed();
    const mappedRoomTypeIds = new Set(
      (roomMappingRows ?? [])
        .map((row) => asStringOrNull(row.external_room_type_id))
        .filter((value): value is string => Boolean(value))
    );

    const matchedRevisions = result.revisions.filter(
      (revision) => asStringOrNull(revision.property_id) === externalPropertyId
    );
    const normalizedRevisions = matchedRevisions.map((revision) => summarizeRevision(revision, mappedRoomTypeIds));
    if (normalizedRevisions.length > 0) {
      const upsertRows = matchedRevisions.map((revision, index) => {
        const summary = normalizedRevisions[index];
        return {
          family_id: familyId,
          provider_code: "channex",
          external_property_id: externalPropertyId,
          external_booking_id: summary.externalBookingId,
          external_revision_id: summary.revisionId,
          external_room_type_id: summary.externalRoomTypeId,
          external_rate_plan_id: summary.externalRatePlanId,
          ota_name: summary.otaName,
          status: summary.status,
          arrival_date: summary.arrivalDate,
          departure_date: summary.departureDate,
          guest_name: summary.guestName,
          amount: asNumericStringOrNull(summary.amount),
          currency: summary.currency,
          payment_collect: summary.paymentCollect,
          raw_payload: revision,
          import_status: "preview",
          ack_status: "not_acknowledged",
          updated_at: new Date().toISOString(),
        };
      });

      const { error: upsertError } = await supabase
        .from("channel_booking_revisions")
        .upsert(upsertRows as never, { onConflict: "provider_code,external_revision_id" });

      if (upsertError) {
        const message = String(upsertError.message ?? "");
        if (!/relation|does not exist|schema cache/i.test(message)) {
          throw upsertError;
        }
      }
    }

    const { data: storedRevisionRows } = await supabase
      .from("channel_booking_revisions")
      .select("external_booking_id,external_revision_id,status,ota_name,arrival_date,departure_date,guest_name,external_room_type_id,external_rate_plan_id,amount,currency,payment_collect,import_status,ack_status,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(20);

    const storedRevisions = ((storedRevisionRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      externalBookingId: asStringOrNull(row.external_booking_id),
      revisionId: asStringOrNull(row.external_revision_id),
      status: asStringOrNull(row.status),
      otaName: asStringOrNull(row.ota_name),
      arrivalDate: asStringOrNull(row.arrival_date),
      departureDate: asStringOrNull(row.departure_date),
      guestName: asStringOrNull(row.guest_name),
      externalRoomTypeId: asStringOrNull(row.external_room_type_id),
      externalRatePlanId: asStringOrNull(row.external_rate_plan_id),
      amount: asNumericStringOrNull(row.amount),
      currency: asStringOrNull(row.currency),
      paymentCollect: asStringOrNull(row.payment_collect),
      paymentType: null,
      unmatchedRoom: asStringOrNull(row.external_room_type_id) ? !mappedRoomTypeIds.has(asStringOrNull(row.external_room_type_id) as string) : true,
      insertedAt: asStringOrNull(row.updated_at),
      importStatus: asStringOrNull(row.import_status) ?? "preview",
      ackStatus: asStringOrNull(row.ack_status) ?? "not_acknowledged",
    }));
    const unmatchedRoomCount = normalizedRevisions.filter((revision) => revision.unmatchedRoom).length;
    const message = result.ok
      ? normalizedRevisions.length > 0
        ? `Fetched and stored ${normalizedRevisions.length} Channex staging booking revision${normalizedRevisions.length === 1 ? "" : "s"} for this property. Preview only; nothing was imported or acknowledged.`
        : "No unacknowledged Channex staging booking revisions matched this property. Preview only; nothing was imported or acknowledged."
      : result.message;

    await logFeedResult({
      supabase,
      familyId,
      status: result.ok ? "success" : "failed",
      message,
      payload: {
        environment: result.environment,
        endpoint: result.endpoint,
        http_status: result.httpStatus,
        external_property_id: externalPropertyId,
        matched_revision_count: normalizedRevisions.length,
        revision_ids: normalizedRevisions.map((revision) => revision.revisionId).filter(Boolean),
        unmatched_room_count: unmatchedRoomCount,
        checked_by: authorizedResource.isAdmin ? "admin" : "host",
      },
    });

    return NextResponse.json(
      {
        ok: result.ok,
        status: result.ok ? "completed" : "failed",
        configured: config.configured,
        environment: result.environment,
        message,
        revisionsFound: normalizedRevisions.length,
        unmatchedRoomCount,
        externalPropertyId,
        lastCheckedAt: new Date().toISOString(),
        revisions: storedRevisions,
        requiresAcknowledgement: true,
        acknowledged: false,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.feed] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to fetch the Channex booking feed.",
        revisions: [],
      },
      { status: 500 }
    );
  }
}
