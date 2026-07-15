import { NextResponse } from "next/server";

import {
  assertFreePmsRoomAccess,
  loadFreePmsCalendarSnapshot,
  writeFreePmsSingleDateUpdate,
} from "@/lib/free-pms-calendar";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function actionFromBody(value: unknown): "block" | "unblock" | "save_price" | "reset_price" | null {
  if (value === "block" || value === "unblock" || value === "save_price" || value === "reset_price") return value;
  if (value === "save") return "save_price";
  if (value === "reset") return "reset_price";
  return null;
}

async function authorize(
  request: Request,
  input: { familyId: string; roomId: string }
): Promise<
  | { ok: true; supabase: ReturnType<typeof createAdminSupabaseClient>; actorUserId: string | null; actorRole: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = createAdminSupabaseClient();
  const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId: input.familyId });
  if (!hostAccess?.familyId || hostAccess.familyId !== input.familyId) {
    return { ok: false, response: NextResponse.json({ error: "You do not have access to this Free calendar." }, { status: 403 }) };
  }
  try {
    await assertFreePmsRoomAccess(supabase, input);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "You do not have access to this room calendar." }, { status: 403 }) };
  }
  return {
    ok: true,
    supabase,
    actorUserId: hostAccess.hostUserId ?? null,
    actorRole: hostAccess.isAdmin ? "admin" : "host",
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const familyId = asString(url.searchParams.get("familyId"));
    const roomId = asString(url.searchParams.get("roomId") ?? url.searchParams.get("stayUnitId"));
    const date = asString(url.searchParams.get("date"));
    if (!familyId || !roomId || !date || !isIsoDate(date)) {
      return NextResponse.json({ error: "Valid familyId, roomId, and date are required." }, { status: 400 });
    }
    const auth = await authorize(request, { familyId, roomId });
    if (!auth.ok) return auth.response;
    const snapshot = await loadFreePmsCalendarSnapshot(auth.supabase, {
      familyId,
      dateFrom: date,
      dateTo: date,
      roomIds: [roomId],
    });
    return NextResponse.json(
      { ok: true, day: snapshot.days[0] ?? null, rows: snapshot.rows },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[host.free-pms.calendar.day.get] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Free calendar day." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: unknown;
      roomId?: unknown;
      stayUnitId?: unknown;
      date?: unknown;
      action?: unknown;
      amount?: unknown;
    };
    const familyId = asString(body.familyId);
    const roomId = asString(body.roomId) || asString(body.stayUnitId);
    const date = asString(body.date);
    const action = actionFromBody(body.action);
    const amount = asNumber(body.amount);

    if (!familyId || !roomId || !date || !action || !isIsoDate(date)) {
      return NextResponse.json({ error: "Valid familyId, roomId, date, and action are required." }, { status: 400 });
    }
    if (action === "save_price" && (amount == null || amount <= 0)) {
      return NextResponse.json({ error: "Enter a valid positive daily rate." }, { status: 400 });
    }

    const auth = await authorize(request, { familyId, roomId });
    if (!auth.ok) return auth.response;

    const day = await writeFreePmsSingleDateUpdate(auth.supabase, {
      familyId,
      roomId,
      date,
      action,
      amount,
      actorUserId: auth.actorUserId,
      actorRole: auth.actorRole,
    });

    return NextResponse.json({
      ok: true,
      action,
      date,
      roomId,
      stayUnitId: roomId,
      day,
      projectedDays: [day],
      queuedJobIds: [],
      stagingWorkerTriggered: false,
    });
  } catch (error) {
    console.error("[host.free-pms.calendar.day.post] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update Free calendar day." },
      { status: 500 }
    );
  }
}
