import { NextRequest, NextResponse } from "next/server";
import { hasValidBackofficeSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
}

export async function POST(req: NextRequest) {
  try {
    if (!(await hasValidBackofficeSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      label,
      title,
      description,
      image_url,
      city,
      state,
      locality,
      lat,
      lng,
      radius_km,
      cta_text,
      cta_url,
      priority,
      starts_at,
      ends_at,
      weekdays,
      daily_start_time,
      daily_end_time,
      timezone,
      team_owner,
      audience,
      placement,
    } = body;
    if (!title || !image_url) return NextResponse.json({ error: "Title and image URL required" }, { status: 400 });
    const supabase = createAdminSupabaseClient();
    const payload = {
      label,
      title,
      description,
      image_url,
      city: city || null,
      state: state || null,
      locality: locality || null,
      lat: toOptionalNumber(lat),
      lng: toOptionalNumber(lng),
      radius_km: toOptionalNumber(radius_km),
      cta_text,
      cta_url,
      priority: Number(priority) || 1,
      is_active: true,
      starts_at: toIso(starts_at),
      ends_at: toIso(ends_at),
      weekdays: parseWeekdays(weekdays),
      daily_start_time: daily_start_time || null,
      daily_end_time: daily_end_time || null,
      timezone: timezone || "Asia/Kolkata",
      team_owner: team_owner || null,
      audience: audience || "all",
      placement: placement || "discover",
    };

    let { error } = await supabase.from("ads_v2").insert(payload);

    if (error && error.message.toLowerCase().includes("column")) {
      const fallbackPayload = {
        label,
        title,
        description,
        image_url,
        city: city || null,
        state: state || null,
        lat: toOptionalNumber(lat),
        lng: toOptionalNumber(lng),
        radius_km: toOptionalNumber(radius_km),
        cta_text,
        cta_url,
        priority: Number(priority) || 1,
        is_active: true,
        starts_at: toIso(starts_at),
        ends_at: toIso(ends_at),
      };

      ({ error } = await supabase.from("ads_v2").insert(fallbackPayload));
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
