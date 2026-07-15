import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { logAuditAction } from "@/lib/audit";
import { PRO_BILLING_GRACE_PERIOD_DAYS } from "@/lib/pro-billing/config";
import {
  deactivateHostProAccess,
  isFamloProDevResetEnabled,
  resetHostProTestingState,
} from "@/lib/pro-billing/service";
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

function getSupabaseErrorSummary(error: unknown): { code: string | null; message: string; details: string | null } {
  if (!error || typeof error !== "object") {
    return { code: null, message: "Unknown Supabase error.", details: null };
  }

  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : null,
    message: typeof record.message === "string" && record.message.trim().length > 0 ? record.message : "Unknown Supabase error.",
    details: typeof record.details === "string" && record.details.trim().length > 0 ? record.details : null,
  };
}

function isProBillingSchemaError(error: unknown): boolean {
  const summary = getSupabaseErrorSummary(error);
  const message = summary.message.toLowerCase();
  const details = (summary.details ?? "").toLowerCase();
  return (
    summary.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("could not find the '") ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    details.includes("schema cache")
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: "activate" | "reset" | "deactivate";
      familyId?: string;
      duration?: ActivationDuration;
      customEndDate?: string;
    };

    const action = body.action === "reset" ? "reset" : body.action === "deactivate" ? "deactivate" : "activate";
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

    if (action === "reset") {
      if (!isFamloProDevResetEnabled()) {
        return NextResponse.json({ error: "Famlo Pro test reset is disabled in production." }, { status: 403 });
      }

      const result = await resetHostProTestingState(supabase, { familyId });
      await logAuditAction({
        actorId: "system-admin",
        actorRole: "admin",
        actionType: "famlo_plus_manual_activate",
        targetUserId: typeof family.user_id === "string" ? family.user_id : undefined,
        resourceType: "host_pro_subscriptions",
        newValue: {
          family_id: familyId,
          reset_result: result,
        },
        reason: "dev_test_reset",
      });

      return NextResponse.json({
        success: true,
        reset: result,
      });
    }

    if (action === "deactivate") {
      const result = await deactivateHostProAccess(supabase, { familyId, reason: "admin_stop" });
      await logAuditAction({
        actorId: "system-admin",
        actorRole: "admin",
        actionType: "famlo_plus_manual_activate",
        targetUserId: typeof family.user_id === "string" ? family.user_id : undefined,
        resourceType: "host_pro_subscriptions",
        newValue: {
          family_id: familyId,
          deactivate_result: result,
        },
        reason: "admin_stop",
      });

      return NextResponse.json({
        success: true,
        deactivated: result,
      });
    }

    const manualActivationEnabled =
      String(process.env.FAMLO_PRO_MANUAL_ACTIVATION_ENABLED ?? "")
        .trim()
        .toLowerCase() === "true";
    if (!manualActivationEnabled) {
      return NextResponse.json(
        {
          error:
            "Manual Famlo Pro activation is disabled. Use the captured-payment Pro billing flow instead.",
        },
        { status: 409 }
      );
    }

    const now = new Date();
    const endDate = resolveEndDate(duration, customEndDate, now);

    if (!endDate) {
      return NextResponse.json({ error: "A valid end date is required." }, { status: 400 });
    }

    if (endDate.getTime() <= now.getTime()) {
      return NextResponse.json({ error: "End date must be in the future." }, { status: 400 });
    }

    const graceUntil = addUtcDays(endDate, PRO_BILLING_GRACE_PERIOD_DAYS);
    const nowIso = now.toISOString();
    const endDateIso = endDate.toISOString();
    const graceUntilIso = graceUntil.toISOString();
    const actorId = "system-admin";
    const targetHostUserId = typeof family.user_id === "string" ? family.user_id : null;

    const latestRowQuery = targetHostUserId
      ? supabase
          .from("host_pro_subscriptions")
          .select("id,current_period_end,grace_until,status,metadata,primary_pro_property_id")
          .eq("host_user_id", targetHostUserId)
          .order("created_at", { ascending: false })
          .limit(1)
      : supabase
          .from("host_pro_subscriptions")
          .select("id,current_period_end,grace_until,status,metadata,primary_pro_property_id")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false })
          .limit(1);

    const { data: latestRow, error: latestRowError } = await latestRowQuery.maybeSingle();

    if (latestRowError) {
      throw latestRowError;
    }

    const primaryProPropertyId =
      typeof latestRow?.primary_pro_property_id === "string" && latestRow.primary_pro_property_id.trim().length > 0
        ? latestRow.primary_pro_property_id
        : familyId;

    const metadata = {
      ...((latestRow?.metadata as Record<string, unknown> | null) ?? {}),
      activated_by: actorId,
      activation_source: "admin_manual",
      activation_duration: duration,
      custom_end_date: customEndDate,
      activated_at: nowIso,
      primary_pro_property_id: primaryProPropertyId,
    };

    const payload = {
      family_id: familyId,
      host_user_id: targetHostUserId,
      primary_pro_property_id: primaryProPropertyId,
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

    if (latestRow?.id && targetHostUserId) {
      const { data: updatedRows, error: updateError } = await supabase
        .from("host_pro_subscriptions")
        .update(payload as never)
        .eq("host_user_id", targetHostUserId)
        .select("id");

      if (updateError) {
        throw updateError;
      }

      subscriptionId =
        Array.isArray(updatedRows) && typeof updatedRows[0]?.id === "string"
          ? updatedRows[0].id
          : typeof latestRow.id === "string"
            ? latestRow.id
            : null;
    } else if (latestRow?.id) {
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
        host_user_id: targetHostUserId,
        subscription_id: subscriptionId,
        primary_pro_property_id: primaryProPropertyId,
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
        host_user_id: targetHostUserId,
        primary_pro_property_id: primaryProPropertyId,
        status: "active",
        current_period_start: nowIso,
        current_period_end: endDateIso,
        grace_until: graceUntilIso,
        provider: "manual",
      },
    });
  } catch (error) {
    const summary = getSupabaseErrorSummary(error);
    console.error("[admin.famlo-plus] activation failed:", {
      code: summary.code,
      message: summary.message,
      details: summary.details,
    });
    return NextResponse.json(
      {
        error: isProBillingSchemaError(error)
          ? "Pro billing migration not applied"
          : error instanceof Error
            ? error.message
            : "Failed to activate Famlo Pro.",
      },
      { status: isProBillingSchemaError(error) ? 409 : 500 }
    );
  }
}
