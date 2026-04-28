import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_COMMISSION_PCT, PLATFORM_DEFAULT_GST_PCT } from "@/lib/finance/constants";
import { toBpsFromPct } from "@/lib/finance/money";

export type FinanceResolvedRules = {
  ruleSetId: string | null;
  calculationMode: string;
  commissionRateBps: number;
  commissionRuleId: string | null;
  gstRateBps: number;
  taxRuleIds: string[];
  payoutRuleId: string | null;
  payoutGatewayFeeBurden: "platform" | "host";
  payoutReleaseAfterStatus: string;
  overrideIds: string[];
  warnings: string[];
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function withinEffectiveWindow(nowIso: string, row: { effective_from?: string | null; effective_to?: string | null }): boolean {
  const now = new Date(nowIso).getTime();
  const from = row.effective_from ? new Date(row.effective_from).getTime() : -Infinity;
  const to = row.effective_to ? new Date(row.effective_to).getTime() : Infinity;
  return now >= from && now <= to;
}

export async function resolveFinanceRules(
  supabase: SupabaseClient,
  input: {
    effectiveAt: string;
    productType: "host_stay" | "hommie_session" | "activity";
    hostUserId?: string | null;
    listingId?: string | null;
    partnerProfileId?: string | null;
  }
): Promise<FinanceResolvedRules> {
  const effectiveAt = input.effectiveAt;
  const warnings: string[] = [];
  const overrideIds: string[] = [];

  const { data: defaultRuleSet, error: ruleSetError } = await supabase
    .from("finance_rule_sets")
    .select("id,calculation_mode,effective_from,effective_to")
    .eq("status", "active")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (ruleSetError) throw ruleSetError;

  const ruleSetId = asString(defaultRuleSet?.id);
  const calculationMode = asString(defaultRuleSet?.calculation_mode) ?? "commission_gst_only";

  if (defaultRuleSet && !withinEffectiveWindow(effectiveAt, defaultRuleSet)) {
    warnings.push("Default finance ruleset is outside effective window; using it anyway as fallback.");
  }

  // 1) Finance overrides table (if populated) — supports future booking/host/listing overrides.
  // TODO: confirm canonical target_type values once overrides UI is live.
  const overrideTargets: { target_type: string; target_id: string }[] = [];
  if (input.hostUserId) overrideTargets.push({ target_type: "host_user", target_id: input.hostUserId });
  if (input.partnerProfileId) overrideTargets.push({ target_type: "partner_profile", target_id: input.partnerProfileId });
  if (input.listingId) overrideTargets.push({ target_type: "listing", target_id: input.listingId });

  const overrides: Array<{
    id: string;
    finance_rule_set_id: string | null;
    commission_rate_bps: number | null;
    tax_rule_id: string | null;
    payout_rule_id: string | null;
    effective_from: string | null;
    effective_to: string | null;
    is_active: boolean;
  }> = [];

  for (const target of overrideTargets) {
    const { data } = await supabase
      .from("finance_overrides")
      .select("id,finance_rule_set_id,commission_rate_bps,tax_rule_id,payout_rule_id,effective_from,effective_to,is_active")
      .eq("is_active", true)
      .eq("target_type", target.target_type)
      .eq("target_id", target.target_id)
      .order("effective_from", { ascending: false })
      .limit(1);

    const row = Array.isArray(data) ? data[0] : null;
    if (row && withinEffectiveWindow(effectiveAt, row)) {
      overrides.push(row as any);
    }
  }

  const bestOverride = overrides[0] ?? null;
  if (bestOverride?.id) overrideIds.push(String(bestOverride.id));

  const resolvedRuleSetId = asString(bestOverride?.finance_rule_set_id) ?? ruleSetId;

  // 2) Commission rule selection
  let commissionRateBps =
    typeof bestOverride?.commission_rate_bps === "number" && Number.isFinite(bestOverride.commission_rate_bps)
      ? Math.max(0, Math.trunc(bestOverride.commission_rate_bps))
      : 0;
  let commissionRuleId: string | null = null;

  if (!commissionRateBps) {
    const { data: commissionRules, error: commissionError } = await supabase
      .from("commission_rules")
      .select("id,rate_bps,priority,effective_from,effective_to,is_preview,product_type,target_type,target_id")
      .eq("rule_set_id", resolvedRuleSetId ?? "")
      .eq("product_type", input.productType)
      .eq("is_preview", false)
      .order("priority", { ascending: true })
      .limit(25);

    if (commissionError) {
      warnings.push("Failed to load commission rules; falling back to default commission pct.");
    } else {
      const candidates = (commissionRules ?? []).filter((row: any) => withinEffectiveWindow(effectiveAt, row));
      // Prefer specific target matches over product_type defaults, then by priority.
      const scored = candidates
        .map((row: any) => {
          const targetType = asString(row.target_type) ?? "product_type";
          const targetId = asString(row.target_id);
          const matchesListing = targetType === "listing" && targetId && input.listingId && targetId === input.listingId;
          const matchesPartner = targetType === "partner_profile" && targetId && input.partnerProfileId && targetId === input.partnerProfileId;
          const score = matchesListing || matchesPartner ? 0 : 1;
          return { row, score, priority: asNumber(row.priority, 100) };
        })
        .sort((a, b) => a.score - b.score || a.priority - b.priority);

      const best = scored[0]?.row ?? null;
      commissionRateBps = Math.max(0, Math.trunc(asNumber(best?.rate_bps, 0)));
      commissionRuleId = asString(best?.id);
    }
  }

  if (!commissionRateBps) {
    commissionRateBps = toBpsFromPct(DEFAULT_COMMISSION_PCT);
    warnings.push("Commission rule missing; used DEFAULT_COMMISSION_PCT fallback.");
  }

  // Admin override currently lives on users.commission_rate_override and is live today.
  // It should override default rules (but not override a finance_overrides commission_rate_bps if present).
  if (!bestOverride?.commission_rate_bps && input.hostUserId) {
    const { data: userRow } = await supabase.from("users").select("commission_rate_override").eq("id", input.hostUserId).maybeSingle();
    const overridePct = asNumber((userRow as any)?.commission_rate_override, 0);
    if (overridePct > 0) {
      commissionRateBps = toBpsFromPct(overridePct);
      warnings.push("Applied users.commission_rate_override for commission rate.");
    }
  }

  // 3) Tax rule selection (GST on platform_fee)
  let gstRateBps =
    typeof bestOverride?.tax_rule_id === "string" && bestOverride.tax_rule_id.length > 0 ? -1 : 0;
  const taxRuleIds: string[] = [];

  if (gstRateBps === -1) {
    const { data: taxRule, error: taxRuleError } = await supabase
      .from("tax_rules")
      .select("id,rate_bps,effective_from,effective_to,is_preview")
      .eq("id", bestOverride?.tax_rule_id ?? "")
      .maybeSingle();

    if (taxRuleError || !taxRule) {
      warnings.push("Finance override tax_rule_id missing; falling back to default GST.");
      gstRateBps = 0;
    } else if (!withinEffectiveWindow(effectiveAt, taxRule as any)) {
      warnings.push("Override tax rule outside effective window; falling back to default GST.");
      gstRateBps = 0;
    } else {
      gstRateBps = Math.max(0, Math.trunc(asNumber((taxRule as any)?.rate_bps, 0)));
      if (asString((taxRule as any)?.id)) taxRuleIds.push(String((taxRule as any).id));
    }
  }

  if (!gstRateBps) {
    const { data: taxRules, error: taxError } = await supabase
      .from("tax_rules")
      .select("id,rate_bps,priority,effective_from,effective_to,is_preview,product_type,calculation_target")
      .eq("rule_set_id", resolvedRuleSetId ?? "")
      .eq("product_type", input.productType)
      .eq("calculation_target", "platform_fee")
      .eq("is_preview", false)
      .order("priority", { ascending: true })
      .limit(25);

    if (taxError) {
      warnings.push("Failed to load tax rules; falling back to default GST pct.");
    } else {
      const candidates = (taxRules ?? []).filter((row: any) => withinEffectiveWindow(effectiveAt, row));
      const best = candidates[0] ?? null;
      gstRateBps = Math.max(0, Math.trunc(asNumber((best as any)?.rate_bps, 0)));
      if (asString((best as any)?.id)) taxRuleIds.push(String((best as any).id));
    }
  }

  if (!gstRateBps) {
    gstRateBps = toBpsFromPct(PLATFORM_DEFAULT_GST_PCT);
    warnings.push("GST rule missing; used PLATFORM_DEFAULT_GST_PCT fallback.");
  }

  // 4) Payout rules (gateway fee burden + release status)
  let payoutRuleId: string | null = null;
  let payoutGatewayFeeBurden: "platform" | "host" = "platform";
  let payoutReleaseAfterStatus = "completed";

  if (bestOverride?.payout_rule_id) {
    const { data: payoutRule } = await supabase
      .from("payout_rules")
      .select("id,gateway_fee_burden,release_after_status,effective_from,effective_to,is_preview")
      .eq("id", bestOverride.payout_rule_id)
      .maybeSingle();
    if (payoutRule && withinEffectiveWindow(effectiveAt, payoutRule as any)) {
      payoutRuleId = asString((payoutRule as any)?.id);
      payoutGatewayFeeBurden =
        (asString((payoutRule as any)?.gateway_fee_burden)?.toLowerCase() ?? "platform") === "host"
          ? "host"
          : "platform";
      payoutReleaseAfterStatus = asString((payoutRule as any)?.release_after_status) ?? payoutReleaseAfterStatus;
    }
  }

  if (!payoutRuleId) {
    const { data: payoutRules, error: payoutError } = await supabase
      .from("payout_rules")
      .select("id,gateway_fee_burden,release_after_status,priority,effective_from,effective_to,is_preview,product_type")
      .eq("rule_set_id", resolvedRuleSetId ?? "")
      .eq("is_preview", false)
      .order("priority", { ascending: true })
      .limit(25);

    if (payoutError) {
      warnings.push("Failed to load payout rules; using safe payout defaults.");
    } else {
      const candidates = (payoutRules ?? []).filter((row: any) => withinEffectiveWindow(effectiveAt, row));
      const best = candidates.find((row: any) => String(row.product_type ?? "") === input.productType) ?? candidates[0] ?? null;
      payoutRuleId = asString((best as any)?.id);
      payoutGatewayFeeBurden =
        (asString((best as any)?.gateway_fee_burden)?.toLowerCase() ?? "platform") === "host" ? "host" : "platform";
      payoutReleaseAfterStatus = asString((best as any)?.release_after_status) ?? payoutReleaseAfterStatus;
    }
  }

  return {
    ruleSetId: resolvedRuleSetId,
    calculationMode,
    commissionRateBps: commissionRateBps,
    commissionRuleId,
    gstRateBps,
    taxRuleIds,
    payoutRuleId,
    payoutGatewayFeeBurden,
    payoutReleaseAfterStatus,
    overrideIds,
    warnings,
  };
}

