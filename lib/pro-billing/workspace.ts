import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadStayUnitsForSelector } from "@/lib/stay-units";
import type {
  ProBillingPropertySelectionInput,
  ProBillingValidatedProperty,
  ProBillingWorkspaceProperty,
} from "@/lib/pro-billing/types";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function logDev(message: string, details: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(message, details);
}

async function loadFamiliesForWorkspace(
  supabase: SupabaseClient,
  params: { hostUserId: string; sourceFamilyId?: string | null }
): Promise<Array<Record<string, unknown>>> {
  const normalizedHostUserId = params.hostUserId.trim();
  const normalizedSourceFamilyId = asString(params.sourceFamilyId);
  const mergedFamilies = new Map<string, Record<string, unknown>>();

  const appendFamilies = (rows: Array<Record<string, unknown>> | null | undefined): void => {
    for (const row of rows ?? []) {
      const familyId = asString(row.id);
      if (!familyId) continue;
      if (!mergedFamilies.has(familyId)) {
        mergedFamilies.set(familyId, row);
      }
    }
  };

  const { data: byUserId, error: byUserIdError } = await supabase
    .from("families")
    .select("id,name,host_id,city,state,user_id")
    .eq("user_id", normalizedHostUserId)
    .order("updated_at", { ascending: false });
  if (!byUserIdError && Array.isArray(byUserId) && byUserId.length > 0) {
    appendFamilies(byUserId as Array<Record<string, unknown>>);
    if (!normalizedSourceFamilyId || mergedFamilies.has(normalizedSourceFamilyId)) {
      return Array.from(mergedFamilies.values());
    }
  }

  if (!normalizedSourceFamilyId) {
    return Array.from(mergedFamilies.values());
  }

  const { data: sourceFamily, error: sourceFamilyError } = await supabase
    .from("families")
    .select("id,host_id,user_id")
    .eq("id", normalizedSourceFamilyId)
    .maybeSingle();
  if (sourceFamilyError) throw sourceFamilyError;
  if (!sourceFamily) return Array.from(mergedFamilies.values());

  const sourceHostCode = asString(sourceFamily.host_id);
  const sourceUserId = asString(sourceFamily.user_id);

  if (sourceUserId && sourceUserId === normalizedHostUserId) {
    const { data: bySourceUserId, error: bySourceUserIdError } = await supabase
      .from("families")
      .select("id,name,host_id,city,state,user_id")
      .eq("user_id", sourceUserId)
      .order("updated_at", { ascending: false });
    if (!bySourceUserIdError && Array.isArray(bySourceUserId) && bySourceUserId.length > 0) {
      appendFamilies(bySourceUserId as Array<Record<string, unknown>>);
    }
  }

  if (sourceHostCode) {
    const { data: byHostCode, error: byHostCodeError } = await supabase
      .from("families")
      .select("id,name,host_id,city,state,user_id")
      .ilike("host_id", sourceHostCode)
      .order("updated_at", { ascending: false });
    if (byHostCodeError) throw byHostCodeError;
    appendFamilies((byHostCode ?? []) as Array<Record<string, unknown>>);
  }

  return Array.from(mergedFamilies.values());
}

export function normalizeProBillingSelections(
  selections: ProBillingPropertySelectionInput[]
): ProBillingPropertySelectionInput[] {
  const deduped = new Map<string, Set<string>>();

  for (const selection of selections) {
    const familyId = selection.familyId.trim();
    if (!familyId) continue;
    const roomIds = deduped.get(familyId) ?? new Set<string>();
    for (const roomId of selection.roomIds) {
      const normalizedRoomId = roomId.trim();
      if (normalizedRoomId) roomIds.add(normalizedRoomId);
    }
    deduped.set(familyId, roomIds);
  }

  return Array.from(deduped.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([familyId, roomIds]) => ({
      familyId,
      roomIds: Array.from(roomIds).sort(),
    }));
}

export function buildProBillingScopeHash(
  selections: ProBillingPropertySelectionInput[]
): string {
  const normalized = normalizeProBillingSelections(selections);
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function loadHostProBillingWorkspace(
  supabase: SupabaseClient,
  hostUserId: string,
  options?: { sourceFamilyId?: string | null }
): Promise<ProBillingWorkspaceProperty[]> {
  logDev("[pro-billing.workspace] resolving buy-page workspace", {
    hostUserId,
    selectedFamilyId: options?.sourceFamilyId ?? null,
  });

  const families = await loadFamiliesForWorkspace(supabase, {
    hostUserId,
    sourceFamilyId: options?.sourceFamilyId ?? null,
  });
  logDev("[pro-billing.workspace] resolved workspace families", {
    hostUserId,
    selectedFamilyId: options?.sourceFamilyId ?? null,
    familyIds: families.map((family) => String(family.id)),
  });

  const roomsByFamily = new Map<string, Array<{ id: string; name: string; isActive: boolean }>>();
  const familyIds = families.map((family) => String(family.id)).filter(Boolean);
  const hostIdsByFamilyId = new Map<string, string | null>();

  if (familyIds.length > 0) {
    const { data: hosts, error: hostsError } = await supabase
      .from("hosts")
      .select("id,legacy_family_id")
      .in("legacy_family_id", familyIds);
    if (hostsError) throw hostsError;

    for (const hostRow of (hosts ?? []) as JsonRecord[]) {
      const familyId = asString(hostRow.legacy_family_id);
      const hostId = asString(hostRow.id);
      if (!familyId) continue;
      hostIdsByFamilyId.set(familyId, hostId);
    }
  }

  for (const familyId of familyIds) {
    try {
      const hostId = hostIdsByFamilyId.get(familyId) ?? null;
      const rooms = await loadStayUnitsForSelector(supabase, {
        hostId,
        legacyFamilyId: familyId,
      });
      roomsByFamily.set(
        familyId,
        rooms.map((room) => ({
          id: room.id,
          name: room.name || "Room",
          isActive: room.isActive !== false,
        }))
      );
      logDev("[pro-billing.workspace] room count source", {
        source: "loadStayUnitsForSelector",
        familyId,
        hostId,
        roomCount: rooms.length,
        activeRoomCount: rooms.filter((room) => room.isActive !== false).length,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[pro-billing.workspace] failed to load rooms for family:", {
          familyId,
          hostId: hostIdsByFamilyId.get(familyId) ?? null,
          error,
        });
      }
      roomsByFamily.set(familyId, []);
    }
  }

  return families.map((familyRow) => {
    const family = familyRow as JsonRecord;
    const familyId = String(family.id);
    const activeRoomIds: string[] = [];

    return {
      familyId,
      propertyName: asString(family.name) ?? "Famlo Property",
      hostCode: asString(family.host_id),
      city: asString(family.city),
      state: asString(family.state),
      status: "inactive",
      currentPeriodEnd: null,
      graceUntil: null,
      activeRoomIds,
      rooms: (roomsByFamily.get(familyId) ?? []).map((room) => ({
        ...room,
        isSelectedInActiveScope: activeRoomIds.includes(room.id),
      })),
    };
  });
}

export async function validateProBillingScopeSelections(
  supabase: SupabaseClient,
  hostUserId: string,
  selections: ProBillingPropertySelectionInput[],
  options?: { sourceFamilyId?: string | null }
): Promise<ProBillingValidatedProperty[]> {
  const normalized = normalizeProBillingSelections(selections);
  if (normalized.length === 0) {
    throw new Error("Select at least one property for Famlo Pro billing.");
  }

  const workspace = await loadHostProBillingWorkspace(supabase, hostUserId, {
    sourceFamilyId: options?.sourceFamilyId ?? null,
  });
  const workspaceByFamilyId = new Map(workspace.map((property) => [property.familyId, property]));
  const validated: ProBillingValidatedProperty[] = [];

  for (const selection of normalized) {
    const property = workspaceByFamilyId.get(selection.familyId);
    if (!property) {
      throw new Error(`Property ${selection.familyId} does not belong to this host.`);
    }

    const roomsById = new Map(property.rooms.map((room) => [room.id, room]));
    const rooms = selection.roomIds.map((roomId) => {
      const room = roomsById.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} does not belong to property ${property.propertyName}.`);
      }
      return { id: room.id, name: room.name };
    });

    validated.push({
      familyId: property.familyId,
      propertyName: property.propertyName,
      hostCode: property.hostCode,
      city: property.city,
      state: property.state,
      roomIds: rooms.map((room) => room.id),
      rooms,
    });
  }

  return validated;
}
