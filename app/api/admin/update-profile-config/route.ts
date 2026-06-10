import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getAdminCookieName,
  verifyAdminSessionToken
} from "../../../../lib/admin-auth";
import { createAdminSupabaseClient } from "../../../../lib/supabase";

type EntityType = "family" | "friend" | "hommie";

function parseStringList(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumberish(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(
    cookieStore.get(getAdminCookieName())?.value
  );

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    entityType?: EntityType;
    profileId?: string;
    updates?: Record<string, unknown>;
  };

  if (!body.entityType || !body.profileId || !body.updates) {
    return NextResponse.json({ error: "Missing profile update data." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  try {
    if (body.entityType === "family") {
      const payload = {
        is_active: Boolean(body.updates.is_active),
        is_accepting: Boolean(body.updates.is_accepting),
        price_morning: parseNumberish(body.updates.price_morning),
        price_afternoon: parseNumberish(body.updates.price_afternoon),
        price_evening: parseNumberish(body.updates.price_evening),
        price_fullday: parseNumberish(body.updates.price_fullday),
        platform_commission_pct: parseNumberish(body.updates.platform_commission_pct),
        host_discount_pct: parseNumberish(body.updates.host_discount_pct),
        active_quarters: parseStringList(body.updates.active_quarters),
        blocked_dates: parseStringList(body.updates.blocked_dates),
        admin_notes:
          typeof body.updates.admin_notes === "string" ? body.updates.admin_notes : null
      };

      const { data, error } = await supabase
        .from("families")
        .update(payload as never)
        .eq("id", body.profileId)
        .select("*")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Unable to update family profile." },
          { status: 500 }
        );
      }

      return NextResponse.json({ profile: data });
    }

    if (body.entityType === "friend") {
      const payload = {
        is_active: Boolean(body.updates.is_active),
        is_online: Boolean(body.updates.is_online),
        price_hour: parseNumberish(body.updates.price_hour),
        platform_commission_pct: parseNumberish(body.updates.platform_commission_pct),
        host_discount_pct: parseNumberish(body.updates.host_discount_pct),
        admin_notes:
          typeof body.updates.admin_notes === "string" ? body.updates.admin_notes : null
      };

      const { data, error } = await supabase
        .from("city_guides")
        .update(payload as never)
        .eq("id", body.profileId)
        .select("*")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Unable to update friend profile." },
          { status: 500 }
        );
      }

      return NextResponse.json({ profile: data });
    }

    const payload = {
      is_active: Boolean(body.updates.is_active),
      nightly_price: parseNumberish(body.updates.nightly_price),
      platform_commission_pct: parseNumberish(body.updates.platform_commission_pct),
      host_discount_pct: parseNumberish(body.updates.host_discount_pct),
      blocked_dates: parseStringList(body.updates.blocked_dates),
      admin_notes:
        typeof body.updates.admin_notes === "string" ? body.updates.admin_notes : null
    };

    const { data, error } = await supabase
      .from("hommies")
      .update(payload as never)
      .eq("id", body.profileId)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to update hommie profile." },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update profile." },
      { status: 500 }
    );
  }
}
