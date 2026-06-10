import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSiteUrl } from "@/lib/site-url";
import { asString, type JsonRecord } from "@/lib/platform-utils";

const EXPORT_PROVIDER = "famlo_export";
const EXPORT_SOURCE_LABEL = "Famlo ICS Export";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toMetadata(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

export function buildCalendarExportUrl(input: { hostId: string; token: string }): string {
  return new URL(`/ical/host/${input.hostId}/${input.token}.ics`, getPublicSiteUrl()).toString();
}

export async function ensureCalendarExportToken(
  supabase: SupabaseClient,
  input: {
    ownerType: string;
    ownerId: string;
  }
): Promise<string> {
  const existing = await supabase
    .from("calendar_connections")
    .select("id,metadata")
    .eq("owner_type", input.ownerType)
    .eq("owner_id", input.ownerId)
    .eq("provider", EXPORT_PROVIDER)
    .eq("source_label", EXPORT_SOURCE_LABEL)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const existingMetadata = toMetadata(existing.data?.metadata);
  const existingToken = asString(existingMetadata.export_token);
  if (existingToken) {
    return existingToken;
  }

  const token = randomBytes(24).toString("hex");
  const metadata = {
    ...existingMetadata,
    export_token: token,
    export_token_hash: hashToken(token),
    export_token_created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("calendar_connections").upsert(
    {
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      provider: EXPORT_PROVIDER,
      source_label: EXPORT_SOURCE_LABEL,
      import_mode: "push",
      export_enabled: true,
      last_sync_status: "never",
      metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_type,owner_id,provider,source_label" }
  );
  if (error) {
    throw error;
  }

  return token;
}

export async function regenerateCalendarExportToken(
  supabase: SupabaseClient,
  input: {
    ownerType: string;
    ownerId: string;
  }
): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const metadata = {
    export_token: token,
    export_token_hash: hashToken(token),
    export_token_created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("calendar_connections").upsert(
    {
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      provider: EXPORT_PROVIDER,
      source_label: EXPORT_SOURCE_LABEL,
      import_mode: "push",
      export_enabled: true,
      last_sync_status: "never",
      metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_type,owner_id,provider,source_label" }
  );
  if (error) {
    throw error;
  }

  return token;
}

export async function resolveCalendarExportByToken(
  supabase: SupabaseClient,
  token: string
): Promise<{ ownerType: string; ownerId: string } | null> {
  const tokenHash = hashToken(token);
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("owner_type,owner_id")
    .eq("provider", EXPORT_PROVIDER)
    .eq("source_label", EXPORT_SOURCE_LABEL)
    .eq("metadata->>export_token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const ownerType = asString((data as JsonRecord | null)?.owner_type);
  const ownerId = asString((data as JsonRecord | null)?.owner_id);
  if (!ownerType || !ownerId) {
    return null;
  }

  return { ownerType, ownerId };
}
