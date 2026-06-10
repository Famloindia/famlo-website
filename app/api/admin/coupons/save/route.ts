import { NextRequest, NextResponse } from "next/server";
import { hasValidBackofficeSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    if (!(await hasValidBackofficeSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      code,
      discount_type,
      discount_value,
      max_discount_amount,
      min_booking_amount,
      applies_to_type,
      starts_at,
      ends_at,
      usage_limit,
      per_user_limit,
      city,
      state,
      locality,
    } = body;

    if (!code || !discount_type || discount_value == null) {
      return NextResponse.json({ error: "Code, discount type, and discount value are required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    let { error } = await supabase.from("coupons_v2").insert({
      code: String(code).trim().toUpperCase(),
      discount_type,
      discount_value: Number(discount_value),
      max_discount_amount: max_discount_amount == null ? null : Number(max_discount_amount),
      min_booking_amount: min_booking_amount == null ? 0 : Number(min_booking_amount),
      applies_to_type: applies_to_type || "all",
      starts_at: toIso(starts_at),
      ends_at: toIso(ends_at),
      usage_limit: usage_limit == null ? null : Number(usage_limit),
      per_user_limit: per_user_limit == null ? 1 : Number(per_user_limit),
      city: typeof city === "string" && city.trim().length > 0 ? city.trim() : null,
      state: typeof state === "string" && state.trim().length > 0 ? state.trim() : null,
      locality: typeof locality === "string" && locality.trim().length > 0 ? locality.trim() : null,
      is_active: true,
    });

    if (error && error.message.toLowerCase().includes("column")) {
      ({ error } = await supabase.from("coupons_v2").insert({
        code: String(code).trim().toUpperCase(),
        discount_type,
        discount_value: Number(discount_value),
        max_discount_amount: max_discount_amount == null ? null : Number(max_discount_amount),
        min_booking_amount: min_booking_amount == null ? 0 : Number(min_booking_amount),
        applies_to_type: applies_to_type || "all",
        starts_at: toIso(starts_at),
        ends_at: toIso(ends_at),
        usage_limit: usage_limit == null ? null : Number(usage_limit),
        per_user_limit: per_user_limit == null ? 1 : Number(per_user_limit),
        is_active: true,
      }));
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
