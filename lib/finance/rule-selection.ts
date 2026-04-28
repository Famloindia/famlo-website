import { FINANCE_RULE_PRECEDENCE } from "@/lib/finance/constants";
import type { FinanceRuleSelectionContext } from "@/lib/finance/types";

export interface SelectedFinanceRuleSet {
  ruleSetId: string | null;
  precedenceMatched: (typeof FINANCE_RULE_PRECEDENCE)[number];
  warnings: string[];
}

export function describeFinanceRulePrecedence(): readonly string[] {
  return FINANCE_RULE_PRECEDENCE;
}

export function selectFinanceRuleSet(context: FinanceRuleSelectionContext): SelectedFinanceRuleSet {
  if (context.bookingOverrideId) {
    return {
      ruleSetId: context.bookingOverrideId,
      precedenceMatched: "booking_override",
      warnings: [],
    };
  }

  if (context.hostUserId) {
    return {
      ruleSetId: null,
      precedenceMatched: "host_override",
      warnings: ["Host-level finance overrides are scaffolded and should be hydrated from finance_overrides."],
    };
  }

  if (context.listingId) {
    return {
      ruleSetId: null,
      precedenceMatched: "listing_override",
      warnings: ["Listing-level finance overrides are scaffolded and should be hydrated from finance_overrides."],
    };
  }

  if (context.countryCode) {
    return {
      ruleSetId: null,
      precedenceMatched: "country_default",
      warnings: [],
    };
  }

  return {
    ruleSetId: null,
    precedenceMatched: "global_default",
    warnings: [],
  };
}
