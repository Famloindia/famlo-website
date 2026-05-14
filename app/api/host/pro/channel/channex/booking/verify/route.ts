import { NextResponse } from "next/server";

import {
  fetchChannexChannelsForProperty,
  fetchChannexPropertyById,
  getChannexConfigSummary,
} from "@/lib/channel-providers/channex/client";
import { mergeChannelSetupMetadata } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type VerifyAction = "check" | "mark_verified" | "mark_failed";

type VerifyBody = {
  familyId?: string;
  action?: VerifyAction;
  reason?: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function loadRows(supabase: ReturnType<typeof createAdminSupabaseClient>, familyId: string) {
  const [{ data: channexRow, error: channexError }, { data: bookingRow, error: bookingError }] = await Promise.all([
    supabase
      .from("channel_properties")
      .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .maybeSingle(),
    supabase
      .from("channel_properties")
      .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", "booking")
      .maybeSingle(),
  ]);

  if (channexError) throw channexError;
  if (bookingError) throw bookingError;

  return {
    channexRow: channexRow as Record<string, unknown> | null,
    bookingRow: bookingRow as Record<string, unknown> | null,
  };
}

function buildVerificationPayload(input: {
  propertyId: string;
  propertyTitle: string | null;
  propertyAccChannelsCount: number | null;
  channels: Array<{
    id: string;
    title: string | null;
    hotelId: string | null;
    isActive: boolean;
    propertyIds: string[];
  }>;
}) {
  const attachedChannels = input.channels.filter((channel) => channel.propertyIds.includes(input.propertyId));
  const activeChannel = attachedChannels.find((channel) => channel.isActive) ?? null;
  const discoveredHotelId =
    activeChannel?.hotelId ??
    attachedChannels.find((channel) => Boolean(channel.hotelId))?.hotelId ??
    null;
  const attachedCount = input.propertyAccChannelsCount ?? attachedChannels.length;
  const channelAttached = attachedChannels.length > 0 || attachedCount > 0;
  const channelActive = Boolean(activeChannel?.id);

  return {
    hotelId: discoveredHotelId,
    activeChannelId: activeChannel?.id ?? null,
    activeChannelTitle: activeChannel?.title ?? null,
    channelAttached,
    channelActive,
    accChannelsCount: attachedCount,
    propertyTitle: input.propertyTitle,
  };
}

async function updateChannexHealth(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  row: Record<string, unknown>,
  verification: ReturnType<typeof buildVerificationPayload>
): Promise<void> {
  const nowIso = new Date().toISOString();
  const metadata = asObject(row.metadata);
  const feedHealth = asObject(metadata.channexFeedHealth);
  const ariHealth = asObject(metadata.channexAriHealth);

  const nextFeedHealth = {
    ...feedHealth,
    hotelId: verification.hotelId,
    activeChannelId: verification.activeChannelId,
    activeChannelTitle: verification.activeChannelTitle,
    channelAttached: verification.channelAttached,
    channelActive: verification.channelActive,
    accChannelsCount: verification.accChannelsCount,
    lastCheckedAt: nowIso,
  };

  const nextAriHealth = {
    ...ariHealth,
    activeChannelId: verification.activeChannelId,
    activeChannelTitle: verification.activeChannelTitle,
    channelAttached: verification.channelAttached,
    channelActive: verification.channelActive,
    accChannelsCount: verification.accChannelsCount,
    lastCheckedAt: nowIso,
  };

  const { error } = await supabase
    .from("channel_properties")
    .update({
      metadata: {
        ...metadata,
        channexFeedHealth: nextFeedHealth,
        channexAriHealth: nextAriHealth,
      },
      updated_at: nowIso,
    } as never)
    .eq("id", row.id);

  if (error) throw error;
}

async function upsertBookingSetup(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string,
  bookingRow: Record<string, unknown> | null,
  metadataPatch: Record<string, unknown>,
  options?: {
    status?: "setup_started" | "needs_details" | "connection_requested" | "matching_needed";
    currentStep?: "connection" | "room_matching";
    lastError?: string | null;
  }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const nextMetadata = mergeChannelSetupMetadata(bookingRow?.metadata ?? {}, {
    status: options?.status ?? null,
    currentStep: options?.currentStep ?? null,
    lastError: options?.lastError ?? null,
    metadataPatch,
    updatedAt: nowIso,
  });

  const payload = {
    id: asString(bookingRow?.id) ?? undefined,
    family_id: familyId,
    provider_code: "booking",
    external_property_id: typeof bookingRow?.external_property_id === "string" ? bookingRow.external_property_id : null,
    sync_status: typeof bookingRow?.sync_status === "string" ? bookingRow.sync_status : "not_connected",
    metadata: nextMetadata,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from("channel_properties")
    .upsert(payload as never, { onConflict: "family_id,provider_code" });

  if (error) throw error;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as VerifyBody;
    const familyId = asString(body.familyId) ?? "";
    const action = body.action ?? "check";
    const reason = asString(body.reason);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!["check", "mark_verified", "mark_failed"].includes(action)) {
      return NextResponse.json({ error: "action is invalid." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!authorizedResource.isAdmin) {
      return NextResponse.json({ error: "Operator access is required." }, { status: 403 });
    }

    const config = getChannexConfigSummary();
    if (!config.configured) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: "Channex staging configuration is incomplete.",
        },
        { status: 400 }
      );
    }

    const { channexRow, bookingRow } = await loadRows(supabase, familyId);
    const externalPropertyId = asString(channexRow?.external_property_id);

    if (!externalPropertyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "missing_property",
          error: "Create the Channex staging property first.",
        },
        { status: 409 }
      );
    }

    const [propertyResult, channelsResult] = await Promise.all([
      fetchChannexPropertyById(externalPropertyId),
      fetchChannexChannelsForProperty(externalPropertyId),
    ]);

    if (!propertyResult.ok || !channelsResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: !propertyResult.ok ? propertyResult.message : channelsResult.message,
        },
        { status: 502 }
      );
    }

    const verification = buildVerificationPayload({
      propertyId: externalPropertyId,
      propertyTitle: propertyResult.data?.title ?? null,
      propertyAccChannelsCount: propertyResult.data?.accChannelsCount ?? null,
      channels: channelsResult.data,
    });

    if (channexRow?.id) {
      await updateChannexHealth(supabase, channexRow, verification);
    }

    if (action === "mark_verified") {
      const hasVerifiedSignal =
        verification.channelAttached &&
        (verification.channelActive || Boolean(verification.activeChannelId));

      if (!hasVerifiedSignal) {
        return NextResponse.json(
          {
            ok: false,
            status: "blocked",
            error: "A real attached or active Booking.com channel signal is required before marking verification complete.",
            verification,
          },
          { status: 409 }
        );
      }

      await upsertBookingSetup(supabase, familyId, bookingRow, {
        operator_verified_booking_connection: true,
        operator_verified_booking_connection_at: new Date().toISOString(),
        booking_connection_status: "verified",
        booking_connection_error: null,
      }, {
        status: "matching_needed",
        currentStep: "room_matching",
        lastError: null,
      });
    }

    if (action === "mark_failed") {
      await upsertBookingSetup(supabase, familyId, bookingRow, {
        operator_verified_booking_connection: false,
        booking_connection_status: "failed",
        booking_connection_error: reason ?? "Verification failed.",
      }, {
        status: "needs_details",
        currentStep: "connection",
        lastError: reason ?? "Verification failed.",
      });
    }

    return NextResponse.json({
      ok: true,
      status:
        action === "mark_verified"
          ? "verified"
          : action === "mark_failed"
            ? "failed"
            : "checked",
      verification,
    });
  } catch (error) {
    console.error("[host.pro.channel.channex.booking.verify] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unable to verify the Booking.com channel state.",
      },
      { status: 500 }
    );
  }
}
