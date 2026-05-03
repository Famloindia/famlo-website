import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { logAuditAction } from "@/lib/audit";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ActivationDuration = "1_month" | "3_months" | "1_year" | "custom";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addUtcMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function resolveEndDate(duration: ActivationDuration, customEndDate: string | null, now: Date): Date | null {
  if (duration === "1_month") return addUtcMonths(now, 1);
  if (duration === "3_months") return addUtcMonths(now, 3);
  if (duration === "1_year") return addUtcMonths(now, 12);

  if (duration === "custom" && customEndDate) {
    const parsed = new Date(`${customEndDate}T23:59:59.999Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      familyId?: string;
      duration?: ActivationDuration;
      customEndDate?: string;
    };

    const familyId = normalizeString(body.familyId);
    const duration = body.duration ?? "1_month";
    const customEndDate = normalizeString(body.customEndDate) || null;

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!["1_month", "3_months", "1_year", "custom"].includes(duration)) {
      return NextResponse.json({ error: "Invalid activation duration." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: family, error: familyError } = await supabase
      .from("families")
      .select("id,user_id,name,host_id")
      .eq("id", familyId)
      .maybeSingle();

    if (familyError) {
      throw familyError;
    }

    if (!family?.id) {
      return NextResponse.json({ error: "Family not found." }, { status: 404 });
    }

    const now = new Date();
    const endDate = resolveEndDate(duration, customEndDate, now);

    if (!endDate) {
      return NextResponse.json({ error: "A valid end date is required." }, { status: 400 });
    }

    if (endDate.getTime() <= now.getTime()) {
      return NextResponse.json({ error: "End date must be in the future." }, { status: 400 });
    }

    const graceUntil = addUtcDays(endDate, 4);
    const nowIso = now.toISOString();
    const endDateIso = endDate.toISOString();
    const graceUntilIso = graceUntil.toISOString();
    const actorId = "system-admin";

    const { data: latestRow, error: latestRowError } = await supabase
      .from("host_pro_subscriptions")
      .select("id,current_period_end,grace_until,status,metadata")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRowError) {
      throw latestRowError;
    }

    const metadata = {
      ...((latestRow?.metadata as Record<string, unknown> | null) ?? {}),
      activated_by: actorId,
      activation_source: "admin_manual",
      activation_duration: duration,
      custom_end_date: customEndDate,
      activated_at: nowIso,
    };

    const payload = {
      family_id: familyId,
      plan_code: "famlo_plus",
      status: "active",
      current_period_start: nowIso,
      current_period_end: endDateIso,
      grace_until: graceUntilIso,
      activated_at: nowIso,
      cancelled_at: null,
      provider: "manual",
      last_payment_at: null,
      metadata,
      updated_at: nowIso,
    };

    let subscriptionId: string | null = null;

    if (latestRow?.id) {
      const { data: updatedRow, error: updateError } = await supabase
        .from("host_pro_subscriptions")
        .update(payload as never)
        .eq("id", latestRow.id)
        .select("id")
        .single();

      if (updateError) {
        throw updateError;
      }

      subscriptionId = typeof updatedRow.id === "string" ? updatedRow.id : null;
    } else {
      const { data: insertedRow, error: insertError } = await supabase
        .from("host_pro_subscriptions")
        .insert(payload as never)
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }

      subscriptionId = typeof insertedRow.id === "string" ? insertedRow.id : null;
    }

    await logAuditAction({
      actorId,
      actorRole: "admin",
      actionType: "famlo_plus_manual_activate",
      targetUserId: typeof family.user_id === "string" ? family.user_id : undefined,
      resourceType: "host_pro_subscriptions",
      newValue: {
        family_id: familyId,
        subscription_id: subscriptionId,
        plan_code: "famlo_plus",
        status: "active",
        current_period_start: nowIso,
        current_period_end: endDateIso,
        grace_until: graceUntilIso,
        provider: "manual",
      },
      reason: "manual_admin_activation",
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscriptionId,
        family_id: familyId,
        status: "active",
        current_period_start: nowIso,
        current_period_end: endDateIso,
        grace_until: graceUntilIso,
        provider: "manual",
      },
    });
  } catch (error) {
    console.error("[admin.famlo-plus] activation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to activate Famlo+." },
      { status: 500 }
    );
  }
}
