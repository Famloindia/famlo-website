import { NextResponse } from "next/server";

import { getChannelProviderCapabilities } from "@/lib/channel-providers/provider-capabilities";
import { isChannelProviderKey, mergeChannelSetupMetadata, readChannelSetupMetadata } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type GoLiveReadinessBody = {
  familyId?: string;
  providerKey?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function logGoLiveReadiness(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "booking",
    action: "mark_assisted_go_live_ready",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.operator.go-live-readiness] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as GoLiveReadinessBody;
    const familyId = asString(body.familyId);
    const providerKey = asString(body.providerKey) || "booking";

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKey)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }

    const capabilities = getChannelProviderCapabilities(providerKey);
    if (!capabilities.supportsGoLiveReadiness || capabilities.mode === "feed_only") {
      return NextResponse.json(
        {
          error: "This provider does not currently support OTA-style go-live readiness in Famlo.",
          providerStatus: capabilities.displayStatus,
        },
        { status: 409 }
      );
    }

    if (!capabilities.supportsAutoActivation) {
      return NextResponse.json(
        {
          ok: false,
          status: "assisted_only",
          message: "This provider stays in assisted review until operator sync and mapping checks are completed. No activation was performed.",
          providerStatus: capabilities.displayStatus,
        },
        { status: 409 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!authorizedResource.isAdmin) {
      return NextResponse.json({ error: "Operator access is required." }, { status: 403 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const [
      { data: bookingRow },
      { data: channexRow },
      rooms,
      { data: roomMappings },
      { data: ratePlans },
      { data: syncLogs },
    ] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
        .eq("family_id", familyId)
        .eq("provider_code", "booking")
        .maybeSingle(),
      supabase
        .from("channel_properties")
        .select("id,external_property_id,metadata")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource.hostId,
        legacyFamilyId: familyId,
      }),
      supabase
        .from("channel_room_mappings")
        .select("stay_unit_id,external_room_type_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      supabase
        .from("channel_rate_plans")
        .select("stay_unit_id,external_rate_plan_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      supabase
        .from("channel_sync_logs")
        .select("id,action,status,message,created_at")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const setupMetadata = readChannelSetupMetadata(bookingRow?.metadata ?? {});
    const channexMetadata = asObject(channexRow?.metadata);
    const ariHealth = asObject(channexMetadata.channexAriHealth);
    const feedHealth = asObject(channexMetadata.channexFeedHealth);
    const activeRooms = rooms.filter((room) => room.isActive);
    const mappedRoomIds = new Set(
      (roomMappings ?? [])
        .filter((row) => asString(row.external_room_type_id))
        .map((row) => asString(row.stay_unit_id))
    );
    const mappedRateIds = new Set(
      (ratePlans ?? [])
        .filter((row) => asString(row.external_rate_plan_id))
        .map((row) => asString(row.stay_unit_id))
    );
    const missingRoomMappings = activeRooms.filter((room) => !mappedRoomIds.has(room.id)).map((room) => room.name);
    const missingRatePlans = activeRooms.filter((room) => !mappedRateIds.has(room.id)).map((room) => room.name);
    const latestLimitedAri = (syncLogs ?? []).find((log) => log.action === "push_ari_limited_test");
    const latestBookingFeed = (syncLogs ?? []).find((log) => log.action === "fetch_booking_feed");
    const blockers = [
      setupMetadata.operator_verified_booking_connection === true ||
      setupMetadata.booking_connection_status === "verified" ||
      setupMetadata.booking_connection_status === "ready_for_assisted_go_live"
        ? null
        : "Booking.com connection has not been operator-verified.",
      asString(channexRow?.external_property_id) ? null : "Channex property is missing.",
      activeRooms.length > 0 ? null : "No active Famlo room is available.",
      missingRoomMappings.length === 0 ? null : `Room mappings missing for ${missingRoomMappings.join(", ")}.`,
      missingRatePlans.length === 0 ? null : `Rate plans missing for ${missingRatePlans.join(", ")}.`,
      latestLimitedAri?.status === "success" ? null : "Limited ARI test sync has not succeeded.",
      latestBookingFeed?.status === "success" ? null : "Booking feed poll has not succeeded.",
      ariHealth.channelAttached === true || feedHealth.channelAttached === true ? null : "Channex channel is not attached.",
      ariHealth.channelActive === true || feedHealth.channelActive === true ? null : "Channex channel is not active.",
    ].filter((item): item is string => Boolean(item));

    const nowIso = new Date().toISOString();
    const ready = blockers.length === 0;
    const nextMetadata = mergeChannelSetupMetadata(bookingRow?.metadata ?? {}, {
      status: ready ? "review_requested" : "needs_review",
      currentStep: "activate",
      lastError: ready ? null : blockers.join(" "),
      metadataPatch: {
        channel_ready_for_assisted_go_live: ready,
        ready_for_assisted_go_live_at: ready ? nowIso : null,
        ready_for_assisted_go_live_by: authorizedResource.hostUserId ?? "operator",
        assisted_go_live_blockers: blockers,
        booking_connection_status: ready ? "ready_for_assisted_go_live" : setupMetadata.booking_connection_status,
        operator_notes: ready
          ? "Operator marked Booking.com ready for assisted go-live review. No activation was performed."
          : "Operator go-live readiness check found blockers. No activation was performed.",
      },
      updatedAt: nowIso,
    });

    const payload = {
      id: asString(bookingRow?.id) || undefined,
      family_id: familyId,
      provider_code: "booking",
      external_property_id: typeof bookingRow?.external_property_id === "string" ? bookingRow.external_property_id : null,
      sync_status: typeof bookingRow?.sync_status === "string" ? bookingRow.sync_status : "not_connected",
      metadata: nextMetadata,
      updated_at: nowIso,
    };

    const { error: upsertError } = await supabase
      .from("channel_properties")
      .upsert(payload as never, { onConflict: "family_id,provider_code" });

    if (upsertError) throw upsertError;

    const message = ready
      ? "Booking.com is marked ready for assisted go-live review. No channel was activated."
      : "Booking.com is not ready for assisted go-live review. No channel was activated.";

    await logGoLiveReadiness({
      supabase,
      familyId,
      status: ready ? "success" : "failed",
      message,
      payload: {
        ready,
        blockers,
        external_property_id: asString(channexRow?.external_property_id) || null,
        active_rooms: activeRooms.length,
        room_mappings_ready: mappedRoomIds.size,
        rate_plans_ready: mappedRateIds.size,
        latest_limited_ari_status: latestLimitedAri?.status ?? null,
        latest_booking_feed_status: latestBookingFeed?.status ?? null,
      },
    });

    return NextResponse.json({
      ok: ready,
      status: ready ? "ready_for_assisted_go_live" : "blocked",
      message,
      blockers,
    }, { status: ready ? 200 : 409 });
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.go-live-readiness] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to mark assisted go-live readiness.",
      },
      { status: 500 }
    );
  }
}
