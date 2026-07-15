import { NextRequest, NextResponse } from "next/server";

import { hasReadOnlyAdminAccess } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

type EntityType = "property" | "host" | "guest" | "booking" | "room";

type EntityRow = {
  id: string;
  type: EntityType;
  name: string;
  city: string;
  status: string;
  revenue: number;
  rating: number | null;
  joined: string;
  email: string;
  upi?: string;
};

type Diagnostic = {
  source: string;
  message: string;
};

type QueryResultRow = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeStatus(value: unknown, fallback = "unknown"): string {
  const status = asString(value);
  return status ? status.toLowerCase() : fallback;
}

function deriveRoomStatus(row: QueryResultRow): string {
  const explicitStatus = normalizeStatus(row.status, "");
  if (explicitStatus) return explicitStatus;
  if (typeof row.is_active === "boolean") {
    return row.is_active ? "active" : "inactive";
  }
  return "active";
}

function parseMissingColumn(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const detail = typeof record.details === "string" ? record.details : "";
  const message = typeof record.message === "string" ? record.message : "";
  const combined = `${detail} ${message}`;
  const patterns = [
    /column\s+([a-zA-Z0-9_]+)\s+does not exist/i,
    /Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i,
  ];
  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match?.[1]) {
      const column = match[1].split(".").pop();
      return column ?? match[1];
    }
  }
  return null;
}

function buildDiagnostic(source: string, error: unknown): Diagnostic {
  if (!error || typeof error !== "object") {
    return { source, message: "Unknown schema read failure." };
  }
  const record = error as Record<string, unknown>;
  return {
    source,
    message: typeof record.message === "string" && record.message.trim().length > 0 ? record.message : "Schema read failed.",
  };
}

async function selectWithFallback(
  table: string,
  columns: string[],
  limit: number
): Promise<{ rows: QueryResultRow[]; diagnostics: Diagnostic[] }> {
  const supabase = createAdminSupabaseClient();
  const diagnostics: Diagnostic[] = [];
  const selected = [...columns];
  let orderByCreatedAt = selected.includes("created_at");

  for (let attempt = 0; attempt < columns.length; attempt += 1) {
    let query = supabase.from(table).select(selected.join(", "));
    if (orderByCreatedAt) {
      query = query.order("created_at", { ascending: false });
    }
    const { data, error } = await query.limit(limit);

    if (!error) {
      return { rows: ((data as unknown) as QueryResultRow[] | null) ?? [], diagnostics };
    }

    const missingColumn = parseMissingColumn(error);
    if (missingColumn && selected.includes(missingColumn)) {
      if (missingColumn === "created_at") {
        orderByCreatedAt = false;
      }
      const next = selected.filter((column) => column !== missingColumn);
      selected.splice(0, selected.length, ...next);
      continue;
    }

    diagnostics.push(buildDiagnostic(table, error));
    console.error("[admin.entities.read-failed]", {
      table,
      code: typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : null,
      message: typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : "Unknown read failure.",
      details: typeof (error as { details?: unknown }).details === "string" ? (error as { details: string }).details : null,
    });
    return { rows: [], diagnostics };
  }

  return { rows: [], diagnostics: diagnostics.length > 0 ? diagnostics : [{ source: table, message: "No readable columns available." }] };
}

function matchesSearch(entity: EntityRow, query: string): boolean {
  if (!query) return true;
  const haystack = [entity.id, entity.name, entity.email, entity.city, entity.status]
    .map((value) => value.toLowerCase())
    .join(" ");
  return haystack.includes(query.toLowerCase());
}

function matchesStatus(entity: EntityRow, status: string): boolean {
  return status === "all" || entity.status === status;
}

function deriveUserEntityType(role: string | null): EntityType | null {
  if (!role) return "guest";
  if (role === "host") return "host";
  if (role === "guest" || role === "user") return "guest";
  return null;
}

export async function GET(request: NextRequest) {
  if (!(await hasReadOnlyAdminAccess())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = (request.nextUrl.searchParams.get("type") ?? "all").toLowerCase();
  const search = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const status = (request.nextUrl.searchParams.get("status") ?? "all").toLowerCase();
  const offsetValue = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const offset = Number.isFinite(offsetValue) ? Math.max(0, offsetValue) : 0;
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(1, limitValue), 100) : 50;
  const fetchLimit = Math.min(Math.max(offset + limit + 25, 100), 200);

  const diagnostics: Diagnostic[] = [];

  const [familiesResult, usersResult, roomsResult, bookingsResult] = await Promise.all([
    type === "all" || type === "property"
      ? selectWithFallback("families", ["id", "name", "city", "village", "is_active", "created_at", "user_id", "price_fullday"], fetchLimit)
      : Promise.resolve({ rows: [], diagnostics: [] }),
    type === "all" || type === "host" || type === "guest"
      ? selectWithFallback("users", ["id", "name", "email", "role", "city", "state", "created_at", "kyc_status"], fetchLimit)
      : Promise.resolve({ rows: [], diagnostics: [] }),
    type === "all" || type === "room"
      ? selectWithFallback(
          "stay_units_v2",
          ["id", "name", "is_active", "created_at", "host_id", "legacy_family_id", "price_fullday", "price_morning", "price_afternoon", "price_evening"],
          fetchLimit
        )
      : Promise.resolve({ rows: [], diagnostics: [] }),
    type === "all" || type === "booking"
      ? selectWithFallback("bookings_v2", ["id", "status", "created_at", "user_id", "host_id", "payment_status", "total_price"], fetchLimit)
      : Promise.resolve({ rows: [], diagnostics: [] }),
  ]);

  diagnostics.push(...familiesResult.diagnostics, ...usersResult.diagnostics, ...roomsResult.diagnostics, ...bookingsResult.diagnostics);

  const familyUserIds = familiesResult.rows
    .map((row) => asString(row.user_id))
    .filter((value): value is string => Boolean(value));

  const userEmailMap = new Map<string, string>();
  if (familyUserIds.length > 0) {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.from("users").select("id, email").in("id", familyUserIds);
    if (error) {
      diagnostics.push(buildDiagnostic("users:family-email-lookup", error));
    } else {
      for (const row of (data as QueryResultRow[] | null) ?? []) {
        const id = asString(row.id);
        const email = asString(row.email);
        if (id && email) userEmailMap.set(id, email);
      }
    }
  }

  const userEntities: EntityRow[] = usersResult.rows
    .map((row): EntityRow | null => {
      const role = asString(row.role)?.toLowerCase() ?? null;
      const entityType = deriveUserEntityType(role);
      if (!entityType) return null;
      return {
        id: asString(row.id) ?? crypto.randomUUID(),
        type: entityType,
        name: asString(row.name) ?? asString(row.email) ?? "Unnamed user",
        city: asString(row.city) ?? asString(row.state) ?? "Unknown",
        status: normalizeStatus(row.kyc_status, "active"),
        revenue: 0,
        rating: null,
        joined: asString(row.created_at) ?? new Date(0).toISOString(),
        email: asString(row.email) ?? "",
      };
    })
    .filter((row): row is EntityRow => row !== null);

  const entities: EntityRow[] = [
    ...familiesResult.rows.map((row) => ({
      id: asString(row.id) ?? crypto.randomUUID(),
      type: "property" as const,
      name: asString(row.name) ?? "Untitled property",
      city: asString(row.village) ?? asString(row.city) ?? "Unknown",
      status: typeof row.is_active === "boolean" ? (row.is_active ? "active" : "inactive") : "unknown",
      revenue: asNumber(row.price_fullday) ?? 0,
      rating: null,
      joined: asString(row.created_at) ?? new Date(0).toISOString(),
      email: userEmailMap.get(asString(row.user_id) ?? "") ?? "",
    })),
    ...userEntities,
    ...roomsResult.rows.map((row) => ({
      id: asString(row.id) ?? crypto.randomUUID(),
      type: "room" as const,
      name: asString(row.name) ?? `Room ${String(asString(row.id) ?? "").slice(0, 8) || ""}`.trim(),
      city: asString(row.locality) ?? asString(row.city) ?? "Unknown",
      status: deriveRoomStatus(row),
      revenue:
        asNumber(row.price_fullday) ??
        asNumber(row.price_evening) ??
        asNumber(row.price_afternoon) ??
        asNumber(row.price_morning) ??
        0,
      rating: null,
      joined: asString(row.created_at) ?? new Date(0).toISOString(),
      email: "",
    })),
    ...bookingsResult.rows.map((row) => ({
      id: asString(row.id) ?? crypto.randomUUID(),
      type: "booking" as const,
      name: `Booking ${String(asString(row.id) ?? "").slice(0, 8)}`,
      city: "—",
      status: normalizeStatus(row.status, normalizeStatus(row.payment_status, "unknown")),
      revenue: asNumber(row.total_price) ?? 0,
      rating: null,
      joined: asString(row.created_at) ?? new Date(0).toISOString(),
      email: "",
    })),
  ];

  const filtered = entities
    .filter((entity) => (type === "all" ? true : entity.type === type))
    .filter((entity) => matchesStatus(entity, status))
    .filter((entity) => matchesSearch(entity, search))
    .sort((left, right) => new Date(right.joined).getTime() - new Date(left.joined).getTime());

  const rows = filtered.slice(offset, offset + limit);
  const hasMore = filtered.length > offset + limit;

  return NextResponse.json({
    rows,
    limit,
    offset,
    hasMore,
    total: filtered.length,
    diagnostics,
    supportedTypes: ["all", "property", "host", "guest", "booking", "room"],
  });
}
