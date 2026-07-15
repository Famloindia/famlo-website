import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isPayoutAccountCreationEnabled,
  isPayoutAccountValidationEnabled,
  isRazorpayXEnabled,
} from "@/lib/finance/feature-flags";
import type { HostPayoutAccountValidationStatus } from "@/lib/finance/provider-contracts";
import {
  createRazorpayXContact,
  createRazorpayXFundAccount,
  isRazorpayXConfigured,
  type RazorpayXContact,
  type RazorpayXFundAccount,
} from "@/lib/razorpay";

type JsonRecord = Record<string, unknown>;

type HostTaxDetailsRecord = {
  user_id: string;
  pan_holder_name?: string | null;
  verification_status?: string | null;
  is_verified?: boolean | null;
};

type HostPayoutAccountRow = {
  id: string;
  host_id: string;
  provider: string;
  provider_contact_id?: string | null;
  provider_fund_account_id?: string | null;
  account_holder_name?: string | null;
  account_number_masked?: string | null;
  ifsc?: string | null;
  vpa?: string | null;
  validation_status?: string | null;
  validation_reference?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PayoutAccountOnboardingInput = {
  hostId: string;
  hostUserId?: string | null;
  legalName?: string | null;
  bankAccountNumber?: string | null;
  ifsc?: string | null;
  vpa?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  provider?: "RAZORPAYX";
};

export type PayoutAccountOnboardingResult = {
  accountId: string;
  provider: "RAZORPAYX";
  isActive: boolean;
  validationStatus: HostPayoutAccountValidationStatus;
  providerContactId: string | null;
  providerFundAccountId: string | null;
  accountNumberMasked: string | null;
  payoutBlockedReason: string | null;
  providerCallsAttempted: boolean;
  providerCreated: {
    contactCreated: boolean;
    fundAccountCreated: boolean;
  };
  reusedExisting: boolean;
};

export type PayoutAccountEngineDependencies = {
  isRazorpayXEnabled?: () => boolean;
  isPayoutAccountCreationEnabled?: () => boolean;
  isPayoutAccountValidationEnabled?: () => boolean;
  isRazorpayXConfigured?: () => boolean;
  createContact?: (input: {
    name: string;
    email?: string;
    contact?: string;
    referenceId?: string;
  }) => Promise<RazorpayXContact>;
  createFundAccount?: (input: {
    contactId: string;
    accountHolderName: string;
    accountNumber?: string;
    ifsc?: string;
    vpa?: string;
  }) => Promise<RazorpayXFundAccount>;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeProvider(value: string | null | undefined): "RAZORPAYX" {
  return "RAZORPAYX";
}

function normalizeIfsc(value: string | null | undefined): string | null {
  const normalized = asNonEmptyString(value)?.replace(/\s+/g, "").toUpperCase() ?? null;
  return normalized;
}

function normalizeVpa(value: string | null | undefined): string | null {
  return asNonEmptyString(value)?.toLowerCase() ?? null;
}

function normalizeAccountNumber(value: string | null | undefined): string | null {
  const normalized = asNonEmptyString(value)?.replace(/\s+/g, "") ?? null;
  return normalized && /^[0-9]{6,20}$/.test(normalized) ? normalized : normalized;
}

function maskAccountNumber(accountNumber: string | null): string | null {
  if (!accountNumber) return null;
  const digits = accountNumber.replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

function isPanVerified(record: HostTaxDetailsRecord | null): boolean {
  if (!record) return false;
  if (record.is_verified === true) return true;
  const status = String(record.verification_status ?? "").trim().toLowerCase();
  return status === "verified" || status === "approved";
}

function resolveValidationStatus(params: {
  providerEnabled: boolean;
  creationEnabled: boolean;
  validationEnabled: boolean;
  providerReady: boolean;
  providerFailed?: boolean;
}): HostPayoutAccountValidationStatus {
  if (params.providerFailed) return "failed";
  if (!params.providerEnabled || !params.creationEnabled || !params.providerReady) return "disabled";
  if (!params.validationEnabled) return "validation_unavailable";
  return "pending";
}

function hasBankDetails(accountNumber: string | null, ifsc: string | null, vpa: string | null): boolean {
  if (vpa) return true;
  return Boolean(accountNumber && ifsc);
}

function sameDestination(
  account: HostPayoutAccountRow,
  accountNumberMasked: string | null,
  ifsc: string | null,
  vpa: string | null
): boolean {
  return (
    asNonEmptyString(account.account_number_masked) === accountNumberMasked &&
    normalizeIfsc(account.ifsc) === ifsc &&
    normalizeVpa(account.vpa) === vpa
  );
}

async function loadHostTaxDetails(supabase: SupabaseClient, hostUserId: string | null | undefined): Promise<HostTaxDetailsRecord | null> {
  if (!hostUserId) return null;

  const { data, error } = await supabase
    .from("host_tax_details")
    .select("user_id,pan_holder_name,verification_status,is_verified")
    .eq("user_id", hostUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as HostTaxDetailsRecord | null) ?? null;
}

async function loadExistingAccounts(
  supabase: SupabaseClient,
  hostId: string,
  provider: "RAZORPAYX"
): Promise<HostPayoutAccountRow[]> {
  const { data, error } = await supabase
    .from("host_payout_accounts")
    .select("*")
    .eq("host_id", hostId)
    .eq("provider", provider)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as HostPayoutAccountRow[] | null) ?? [];
}

async function insertAccountRow(
  supabase: SupabaseClient,
  payload: JsonRecord
): Promise<HostPayoutAccountRow> {
  const { data, error } = await supabase.from("host_payout_accounts").insert(payload).select("*").single();
  if (error) throw error;
  return data as HostPayoutAccountRow;
}

async function updateAccountRow(
  supabase: SupabaseClient,
  accountId: string,
  payload: JsonRecord
): Promise<HostPayoutAccountRow> {
  const { data, error } = await supabase
    .from("host_payout_accounts")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", accountId)
    .select("*")
    .single();
  if (error) throw error;
  return data as HostPayoutAccountRow;
}

async function deactivateOtherActiveAccounts(
  supabase: SupabaseClient,
  hostId: string,
  provider: "RAZORPAYX",
  exceptAccountId: string
): Promise<void> {
  const { error } = await supabase
    .from("host_payout_accounts")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("host_id", hostId)
    .eq("provider", provider)
    .eq("is_active", true)
    .neq("id", exceptAccountId);
  if (error) throw error;
}

export async function onboardHostPayoutAccount(
  supabase: SupabaseClient,
  input: PayoutAccountOnboardingInput,
  dependencies: PayoutAccountEngineDependencies = {}
): Promise<PayoutAccountOnboardingResult> {
  const provider = normalizeProvider(input.provider);
  const providerEnabled = (dependencies.isRazorpayXEnabled ?? isRazorpayXEnabled)();
  const creationEnabled = (dependencies.isPayoutAccountCreationEnabled ?? isPayoutAccountCreationEnabled)();
  const validationEnabled = (dependencies.isPayoutAccountValidationEnabled ?? isPayoutAccountValidationEnabled)();
  const providerReady = (dependencies.isRazorpayXConfigured ?? isRazorpayXConfigured)();
  const normalizedAccountNumber = normalizeAccountNumber(input.bankAccountNumber);
  const normalizedIfsc = normalizeIfsc(input.ifsc);
  const normalizedVpa = normalizeVpa(input.vpa);
  const maskedAccountNumber = maskAccountNumber(normalizedAccountNumber);
  const existingAccounts = await loadExistingAccounts(supabase, input.hostId, provider);
  const activeAccount = existingAccounts.find((account) => account.is_active === true) ?? null;
  const targetAccount = activeAccount ?? existingAccounts[0] ?? null;

  const hostTaxDetails = await loadHostTaxDetails(supabase, input.hostUserId);
  const resolvedLegalName =
    asNonEmptyString(input.legalName) ??
    asNonEmptyString(hostTaxDetails?.pan_holder_name) ??
    asNonEmptyString(targetAccount?.account_holder_name);
  const payoutBlockedReasons: string[] = [];

  if (!resolvedLegalName) {
    payoutBlockedReasons.push("Legal name is required before payout account onboarding.");
  }
  if (!hasBankDetails(normalizedAccountNumber, normalizedIfsc, normalizedVpa)) {
    payoutBlockedReasons.push("A valid bank account + IFSC or UPI ID is required.");
  }
  if (!hostTaxDetails || !isPanVerified(hostTaxDetails)) {
    payoutBlockedReasons.push("A verified or approved PAN is required before activation.");
  }

  const payoutBlockedReason = payoutBlockedReasons.length > 0 ? payoutBlockedReasons.join(" ") : null;
  const canAttemptProviderCreation =
    !payoutBlockedReason && providerEnabled && creationEnabled && providerReady;

  if (
    activeAccount &&
    sameDestination(activeAccount, maskedAccountNumber, normalizedIfsc, normalizedVpa) &&
    asNonEmptyString(activeAccount.account_holder_name) === resolvedLegalName
  ) {
    return {
      accountId: activeAccount.id,
      provider,
      isActive: Boolean(activeAccount.is_active),
      validationStatus: (activeAccount.validation_status as HostPayoutAccountValidationStatus | null) ?? "disabled",
      providerContactId: asNonEmptyString(activeAccount.provider_contact_id),
      providerFundAccountId: asNonEmptyString(activeAccount.provider_fund_account_id),
      accountNumberMasked: asNonEmptyString(activeAccount.account_number_masked),
      payoutBlockedReason,
      providerCallsAttempted: false,
      providerCreated: {
        contactCreated: false,
        fundAccountCreated: false,
      },
      reusedExisting: true,
    };
  }

  let account =
    targetAccount ??
    (await insertAccountRow(supabase, {
      host_id: input.hostId,
      provider,
      account_holder_name: resolvedLegalName,
      account_number_masked: maskedAccountNumber,
      ifsc: normalizedIfsc,
      vpa: normalizedVpa,
      validation_status: resolveValidationStatus({
        providerEnabled,
        creationEnabled,
        validationEnabled,
        providerReady,
      }),
      validation_reference: null,
      is_active: false,
    }));

  if (targetAccount) {
    account = await updateAccountRow(supabase, targetAccount.id, {
      account_holder_name: resolvedLegalName,
      account_number_masked: maskedAccountNumber,
      ifsc: normalizedIfsc,
      vpa: normalizedVpa,
      validation_status: resolveValidationStatus({
        providerEnabled,
        creationEnabled,
        validationEnabled,
        providerReady,
      }),
      validation_reference: null,
      is_active: false,
    });
  }

  if (!canAttemptProviderCreation) {
    return {
      accountId: account.id,
      provider,
      isActive: false,
      validationStatus: (account.validation_status as HostPayoutAccountValidationStatus | null) ?? "disabled",
      providerContactId: asNonEmptyString(account.provider_contact_id),
      providerFundAccountId: asNonEmptyString(account.provider_fund_account_id),
      accountNumberMasked: asNonEmptyString(account.account_number_masked),
      payoutBlockedReason,
      providerCallsAttempted: false,
      providerCreated: {
        contactCreated: false,
        fundAccountCreated: false,
      },
      reusedExisting: Boolean(targetAccount),
    };
  }

  let providerCallsAttempted = false;
  let contactCreated = false;
  let fundAccountCreated = false;

  try {
    providerCallsAttempted = true;
    let providerContactId = asNonEmptyString(account.provider_contact_id);
    let providerFundAccountId = asNonEmptyString(account.provider_fund_account_id);

    if (!providerContactId) {
      const contact = await (dependencies.createContact ?? createRazorpayXContact)({
        name: resolvedLegalName!,
        email: asNonEmptyString(input.contactEmail) ?? undefined,
        contact: asNonEmptyString(input.contactPhone) ?? undefined,
        referenceId: input.hostId,
      });
      providerContactId = contact.id;
      contactCreated = true;
      account = await updateAccountRow(supabase, account.id, {
        provider_contact_id: providerContactId,
      });
    }

    if (!providerFundAccountId) {
      const fundAccount = await (dependencies.createFundAccount ?? createRazorpayXFundAccount)({
        contactId: providerContactId!,
        accountHolderName: resolvedLegalName!,
        accountNumber: normalizedAccountNumber ?? undefined,
        ifsc: normalizedIfsc ?? undefined,
        vpa: normalizedVpa ?? undefined,
      });
      providerFundAccountId = fundAccount.id;
      fundAccountCreated = true;
      account = await updateAccountRow(supabase, account.id, {
        provider_fund_account_id: providerFundAccountId,
      });
    }

    const finalValidationStatus = resolveValidationStatus({
      providerEnabled,
      creationEnabled,
      validationEnabled,
      providerReady,
    });
    account = await updateAccountRow(supabase, account.id, {
      validation_status: finalValidationStatus,
      validation_reference: null,
      is_active: true,
    });
    await deactivateOtherActiveAccounts(supabase, input.hostId, provider, account.id);

    return {
      accountId: account.id,
      provider,
      isActive: true,
      validationStatus: finalValidationStatus,
      providerContactId: providerContactId,
      providerFundAccountId: providerFundAccountId,
      accountNumberMasked: asNonEmptyString(account.account_number_masked),
      payoutBlockedReason: null,
      providerCallsAttempted,
      providerCreated: {
        contactCreated,
        fundAccountCreated,
      },
      reusedExisting: Boolean(targetAccount),
    };
  } catch (error) {
    account = await updateAccountRow(supabase, account.id, {
      validation_status: "failed",
      is_active: false,
    });

    return {
      accountId: account.id,
      provider,
      isActive: false,
      validationStatus: "failed",
      providerContactId: asNonEmptyString(account.provider_contact_id),
      providerFundAccountId: asNonEmptyString(account.provider_fund_account_id),
      accountNumberMasked: asNonEmptyString(account.account_number_masked),
      payoutBlockedReason: error instanceof Error ? error.message : "Provider onboarding failed.",
      providerCallsAttempted,
      providerCreated: {
        contactCreated,
        fundAccountCreated,
      },
      reusedExisting: Boolean(targetAccount),
    };
  }
}
