import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import {
  getHostInteractionEventBucket,
  HOST_INTERACTION_EVENT_TYPES,
  type HostInteractionEventType,
} from "@/lib/host-interactions";
import { createAdminSupabaseClient } from "@/lib/supabase";

type HostInteractionRequest = {
  eventType?: HostInteractionEventType | string;
  hostId?: string | null;
  legacyFamilyId?: string | null;
  userId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  pagePath?: string | null;
  metadata?: Record<string, unknown>;
  recordedAt?: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const next = asString(value);
  return next.length > 0 ? next : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as HostInteractionRequest | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid interaction payload." }, { status: 400 });
  }

  const eventType = asString(body.eventType) as HostInteractionEventType;
  if (!HOST_INTERACTION_EVENT_TYPES.includes(eventType)) {
    return NextResponse.json({ error: "Unsupported interaction type." }, { status: 400 });
  }

  const visitorId = asString(body.visitorId);
  if (!visitorId) {
    return NextResponse.json({ error: "Missing visitor identity." }, { status: 400 });
  }

  const sessionId = asNullableString(body.sessionId);
  const userId = asNullableString(body.userId);
  const pagePath = asNullableString(body.pagePath);
  const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
  const eventBucket = getHostInteractionEventBucket(eventType, Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt);

  const supabase = createAdminSupabaseClient();
  let hostId = asNullableString(body.hostId);
  let legacyFamilyId = asNullableString(body.legacyFamilyId);

  if (!hostId && !legacyFamilyId) {
    return NextResponse.json({ error: "Missing host reference." }, { status: 400 });
  }

  if (!hostId) {
    const { data: hostRow, error } = await supabase
      .from("hosts")
      .select("id,legacy_family_id")
      .eq("legacy_family_id", legacyFamilyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    hostId = asNullableString(hostRow?.id);
    legacyFamilyId = asNullableString(hostRow?.legacy_family_id) ?? legacyFamilyId;
  } else {
    const { data: hostRow, error } = await supabase
      .from("hosts")
      .select("id,legacy_family_id")
      .eq("id", hostId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    legacyFamilyId = asNullableString(hostRow?.legacy_family_id) ?? legacyFamilyId;
  }

  if (!hostId) {
    return NextResponse.json({ error: "Could not resolve host." }, { status: 404 });
  }

  const { error } = await supabase.from("host_interaction_events_v2").upsert(
    {
      user_id: userId,
      visitor_id: visitorId,
      session_id: sessionId,
      host_id: hostId,
      legacy_family_id: legacyFamilyId,
      event_type: eventType,
      event_bucket: eventBucket,
      page_path: pagePath,
      metadata: asRecord(body.metadata),
      created_at: recordedAt.toISOString(),
      updated_at: recordedAt.toISOString(),
    },
    { onConflict: "visitor_id,host_id,event_type,event_bucket" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag("homepage-discovery", "max");
  revalidateTag("homes-discovery", "max");

  return NextResponse.json({ success: true });
}
