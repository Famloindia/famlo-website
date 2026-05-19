import {
  fetchChannexChannelsForProperty,
  fetchChannexPropertyById,
  fetchChannexRatePlansForProperty,
  fetchChannexRoomTypesForProperty,
  type ChannexChannelStructureRecord,
} from "@/lib/channel-providers/channex/client";
import {
  resolveProviderFromChannexUniqueId,
  resolveProviderFromOtaName,
} from "@/lib/channel-providers/provider-capabilities";
import { mergeChannelSetupMetadata } from "@/lib/channel-setup-state";

import type { ChannelProviderKey } from "./provider-registry";

type JsonRecord = Record<string, unknown>;

export type ProviderStructureCatalog = {
  room_types: Array<{
    id: string;
    title: string | null;
    property_id: string | null;
    count_of_rooms: number | null;
  }>;
  rate_plans: Array<{
    id: string;
    title: string | null;
    property_id: string | null;
    room_type_id: string | null;
  }>;
  refreshed_at: string;
};

export type ProviderAdapterInspection = {
  propertyTitle: string | null;
  hotelId: string | null;
  activeChannelId: string | null;
  activeChannelTitle: string | null;
  discoveredChannelId: string | null;
  discoveredChannelTitle: string | null;
  channelAttached: boolean;
  channelActive: boolean;
  matchedChannelCount: number;
  roomTypesFoundCount: number;
  ratePlansFoundCount: number;
  structureRefreshedAt: string;
  catalog: ProviderStructureCatalog;
};

export type ProviderAdapterRefreshState = {
  metadata: JsonRecord;
  syncStatus: string;
  status: "matching_needed" | "connection_requested";
  currentStep: "room_matching" | "connection";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function providerChannelMatches(providerKey: ChannelProviderKey, channel: ChannexChannelStructureRecord): boolean {
  const resolvedFromUniqueId = resolveProviderFromChannexUniqueId(channel.uniqueId);
  if (resolvedFromUniqueId) return resolvedFromUniqueId === providerKey;

  const resolvedFromName = resolveProviderFromOtaName(`${channel.title ?? ""} ${channel.hotelId ?? ""}`);
  if (resolvedFromName) return resolvedFromName === providerKey;

  return false;
}

export async function inspectProviderConnectionInChannex(
  providerKey: ChannelProviderKey,
  externalPropertyId: string
): Promise<{ ok: true; inspection: ProviderAdapterInspection } | { ok: false; message: string }> {
  const [propertyResult, channelsResult, roomTypesResult, ratePlansResult] = await Promise.all([
    fetchChannexPropertyById(externalPropertyId),
    fetchChannexChannelsForProperty(externalPropertyId),
    fetchChannexRoomTypesForProperty(externalPropertyId),
    fetchChannexRatePlansForProperty(externalPropertyId),
  ]);

  if (!propertyResult.ok || !channelsResult.ok || !roomTypesResult.ok || !ratePlansResult.ok) {
    return {
      ok: false,
      message:
        propertyResult.message ||
        channelsResult.message ||
        roomTypesResult.message ||
        ratePlansResult.message ||
        "Unable to inspect provider connection in Channex.",
    };
  }

  const matchedChannels = channelsResult.data.filter((channel) => providerChannelMatches(providerKey, channel));
  const activeChannel = matchedChannels.find((channel) => channel.isActive) ?? null;
  const discoveredChannel = activeChannel ?? matchedChannels[0] ?? null;
  const nowIso = new Date().toISOString();

  return {
    ok: true,
    inspection: {
      propertyTitle: propertyResult.data?.title ?? null,
      hotelId: discoveredChannel?.hotelId ?? null,
      activeChannelId: activeChannel?.id ?? null,
      activeChannelTitle: activeChannel?.title ?? null,
      discoveredChannelId: discoveredChannel?.id ?? null,
      discoveredChannelTitle: discoveredChannel?.title ?? null,
      channelAttached: matchedChannels.length > 0,
      channelActive: Boolean(activeChannel?.id),
      matchedChannelCount: matchedChannels.length,
      roomTypesFoundCount: roomTypesResult.data.length,
      ratePlansFoundCount: ratePlansResult.data.length,
      structureRefreshedAt: nowIso,
      catalog: {
        room_types: roomTypesResult.data.map((roomType) => ({
          id: roomType.id,
          title: roomType.title,
          property_id: roomType.propertyId,
          count_of_rooms: roomType.countOfRooms,
        })),
        rate_plans: ratePlansResult.data.map((ratePlan) => ({
          id: ratePlan.id,
          title: ratePlan.title,
          property_id: ratePlan.propertyId,
          room_type_id: ratePlan.roomTypeId,
        })),
        refreshed_at: nowIso,
      },
    },
  };
}

export function buildProviderRefreshState(input: {
  providerKey: ChannelProviderKey;
  currentMetadata: JsonRecord;
  inspection: ProviderAdapterInspection;
}): ProviderAdapterRefreshState {
  const { providerKey, currentMetadata, inspection } = input;

  const nextSetupMetadata = mergeChannelSetupMetadata(currentMetadata, {
    status: inspection.channelAttached ? "matching_needed" : "connection_requested",
    currentStep: inspection.channelAttached ? "room_matching" : "connection",
    lastError: null,
    metadataPatch:
      providerKey === "booking"
        ? {
            booking_connection_status: inspection.channelAttached ? "channel_visible_in_channex" : "verification_requested",
            booking_connection_error: null,
            provider_discovered_hotel_id: inspection.hotelId,
            provider_discovered_channel_id: inspection.discoveredChannelId,
            provider_discovered_channel_title: inspection.discoveredChannelTitle,
            provider_channel_attached: inspection.channelAttached,
            provider_channel_active: inspection.channelActive,
            provider_room_types_found_count: inspection.roomTypesFoundCount,
            provider_rate_plans_found_count: inspection.ratePlansFoundCount,
            provider_structure_refreshed_at: inspection.structureRefreshedAt,
          }
        : {
            provider_connection_status:
              inspection.channelAttached
                ? "channel_visible_in_channex"
                : (currentMetadata.channel_setup && typeof currentMetadata.channel_setup === "object"
                    ? asString((currentMetadata.channel_setup as JsonRecord).provider_connection_status)
                    : "") || "details_submitted",
            provider_connection_error: null,
            provider_discovered_hotel_id: inspection.hotelId,
            provider_discovered_channel_id: inspection.discoveredChannelId,
            provider_discovered_channel_title: inspection.discoveredChannelTitle,
            provider_channel_attached: inspection.channelAttached,
            provider_channel_active: inspection.channelActive,
            provider_room_types_found_count: inspection.roomTypesFoundCount,
            provider_rate_plans_found_count: inspection.ratePlansFoundCount,
            provider_structure_refreshed_at: inspection.structureRefreshedAt,
          },
    updatedAt: inspection.structureRefreshedAt,
  });

  return {
    metadata: {
      ...nextSetupMetadata,
      provider_mapping_catalog: inspection.catalog,
    },
    syncStatus:
      inspection.channelAttached && inspection.channelActive
        ? "connected"
        : asString(currentMetadata.sync_status) || "not_connected",
    status: inspection.channelAttached ? "matching_needed" : "connection_requested",
    currentStep: inspection.channelAttached ? "room_matching" : "connection",
  };
}

export function providerVerificationMetadataPatch(input: {
  providerKey: ChannelProviderKey;
  inspection: ProviderAdapterInspection;
  currentMetadata: JsonRecord;
}): JsonRecord {
  const refreshState = buildProviderRefreshState(input);
  return asRecord(refreshState.metadata.channel_setup);
}
