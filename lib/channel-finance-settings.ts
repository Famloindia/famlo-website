import type { SupabaseClient } from "@supabase/supabase-js";

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export type ChannelCommissionType = "percentage" | "flat";
export type ChannelTaxMode = "inclusive" | "exclusive";

export type ChannelCommissionRule = {
  id: string | null;
  channelKey: string;
  channelName: string;
  commissionType: ChannelCommissionType;
  commissionValue: number;
  taxOnCommission: boolean;
  gstPercent: number;
  taxMode: ChannelTaxMode;
  effectiveFrom: string | null;
  notes: string | null;
  isActive: boolean;
  source: "saved" | "default";
};

export type ChannelFinanceGstSettings = {
  gstEnabled: boolean;
  gstin: string | null;
  legalBusinessName: string | null;
  tradeName: string | null;
  state: string | null;
  stateCode: string | null;
  accommodationGstApplicable: boolean;
  defaultAccommodationGstPercent: number;
  platformFeeGstPercent: number;
  servicesExtrasGstPercent: number;
  taxPricingMode: ChannelTaxMode;
  invoicePrefix: string;
  receiptPrefix: string;
};

export type ReceiptTemplateSettings = {
  logoUrl: string | null;
  receiptHeaderTitle: string;
  footerNote: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  address: string | null;
  showGstin: boolean;
  showGuestContact: boolean;
  showOtaSource: boolean;
  showPaymentMode: boolean;
  showHostSignatureBlock: boolean;
  showGeneratedByFamlo: boolean;
  termsConditions: string | null;
};

export type HostBusinessDetailsSettings = {
  businessName: string | null;
  ownerFullName: string | null;
  phone: string | null;
  email: string | null;
  alternatePhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  country: string;
  gstin: string | null;
  pan: string | null;
  bankAccountHolderName: string | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  ifsc: string | null;
  upiId: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
  businessLogoUrl: string | null;
};

export type ChannelFinanceSettings = {
  familyId: string;
  exists: boolean;
  gstSettings: ChannelFinanceGstSettings;
  commissionRules: ChannelCommissionRule[];
  receiptTemplate: ReceiptTemplateSettings;
  hostBusinessDetails: HostBusinessDetailsSettings;
  updatedAt: string | null;
};

export type ChannelCommissionEstimate = {
  amount: number | null;
  gstAmount: number | null;
  totalCommissionAmount: number | null;
  source: "actual" | "estimated" | "not_available";
  ruleName: string | null;
};

type JsonRecord = Record<string, unknown>;

export const DEFAULT_CHANNEL_COMMISSION_RULES: ChannelCommissionRule[] = [
  createDefaultRule("booking_com", "Booking.com"),
  createDefaultRule("airbnb", "Airbnb"),
  createDefaultRule("agoda", "Agoda"),
  createDefaultRule("expedia", "Expedia"),
  createDefaultRule("goibibo_mmt", "Goibibo / MMT"),
  createDefaultRule("direct", "Direct Booking", 0),
  createDefaultRule("custom", "Custom channel"),
];

function createDefaultRule(channelKey: string, channelName: string, commissionValue = 0): ChannelCommissionRule {
  return {
    id: null,
    channelKey,
    channelName,
    commissionType: "percentage",
    commissionValue,
    taxOnCommission: false,
    gstPercent: 18,
    taxMode: "exclusive",
    effectiveFrom: null,
    notes: "Used when actual OTA commission is not available from booking data.",
    isActive: channelKey !== "custom",
    source: "default",
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asTaxMode(value: unknown): ChannelTaxMode {
  return value === "inclusive" ? "inclusive" : "exclusive";
}

function asCommissionType(value: unknown): ChannelCommissionType {
  return value === "flat" ? "flat" : "percentage";
}

function nonNegative(value: unknown): number {
  return Math.max(0, asNumber(value, 0));
}

function percentage(value: unknown): number {
  return Math.min(100, nonNegative(value));
}

function mapCommissionRule(row: JsonRecord): ChannelCommissionRule {
  const commissionType = asCommissionType(row.commission_type);
  return {
    id: asString(row.id),
    channelKey: asString(row.channel_key) ?? "custom",
    channelName: asString(row.channel_name) ?? "Custom channel",
    commissionType,
    commissionValue: commissionType === "percentage" ? percentage(row.commission_value) : nonNegative(row.commission_value),
    taxOnCommission: asBoolean(row.tax_on_commission),
    gstPercent: nonNegative(row.gst_percent),
    taxMode: asTaxMode(row.tax_mode),
    effectiveFrom: asString(row.effective_from),
    notes: asString(row.notes),
    isActive: row.is_active !== false,
    source: "saved",
  };
}

function createDefaultGstSettings(): ChannelFinanceGstSettings {
  return {
    gstEnabled: false,
    gstin: null,
    legalBusinessName: null,
    tradeName: null,
    state: null,
    stateCode: null,
    accommodationGstApplicable: false,
    defaultAccommodationGstPercent: 0,
    platformFeeGstPercent: 18,
    servicesExtrasGstPercent: 0,
    taxPricingMode: "exclusive",
    invoicePrefix: "INV",
    receiptPrefix: "FMR",
  };
}

function createDefaultReceiptTemplate(): ReceiptTemplateSettings {
  return {
    logoUrl: null,
    receiptHeaderTitle: "Famlo Pro Booking Receipt",
    footerNote: "This is a booking receipt generated by Famlo Pro.",
    supportPhone: null,
    supportEmail: null,
    address: null,
    showGstin: true,
    showGuestContact: true,
    showOtaSource: true,
    showPaymentMode: true,
    showHostSignatureBlock: false,
    showGeneratedByFamlo: true,
    termsConditions: null,
  };
}

function createDefaultHostBusinessDetails(): HostBusinessDetailsSettings {
  return {
    businessName: null,
    ownerFullName: null,
    phone: null,
    email: null,
    alternatePhone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    pinCode: null,
    country: "India",
    gstin: null,
    pan: null,
    bankAccountHolderName: null,
    bankName: null,
    accountNumberMasked: null,
    ifsc: null,
    upiId: null,
    signatureUrl: null,
    stampUrl: null,
    businessLogoUrl: null,
  };
}

export function createDefaultChannelFinanceSettings(familyId: string): ChannelFinanceSettings {
  return {
    familyId,
    exists: false,
    gstSettings: createDefaultGstSettings(),
    commissionRules: DEFAULT_CHANNEL_COMMISSION_RULES.map((rule) => ({ ...rule })),
    receiptTemplate: createDefaultReceiptTemplate(),
    hostBusinessDetails: createDefaultHostBusinessDetails(),
    updatedAt: null,
  };
}

function isMissingTableError(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  return /relation|does not exist|schema cache|column .* does not exist/i.test(message);
}

function mergeRules(savedRules: ChannelCommissionRule[]): ChannelCommissionRule[] {
  const savedByKey = new Map(savedRules.map((rule) => [rule.channelKey, rule]));
  const defaults = DEFAULT_CHANNEL_COMMISSION_RULES.map((rule) => savedByKey.get(rule.channelKey) ?? { ...rule });
  const extraSaved = savedRules.filter((rule) => !DEFAULT_CHANNEL_COMMISSION_RULES.some((item) => item.channelKey === rule.channelKey));
  return [...defaults, ...extraSaved];
}

export async function loadChannelFinanceSettings(
  supabase: SupabaseClient,
  familyId: string
): Promise<ChannelFinanceSettings> {
  const normalizedFamilyId = familyId.trim();
  const fallback = createDefaultChannelFinanceSettings(normalizedFamilyId);
  if (!normalizedFamilyId) return fallback;

  const [settingsResult, rulesResult, receiptResult, businessResult] = await Promise.all([
    supabase
      .from("channel_finance_settings")
      .select("*")
      .eq("family_id", normalizedFamilyId)
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase
      .from("channel_commission_rules")
      .select("*")
      .eq("family_id", normalizedFamilyId)
      .order("channel_name", { ascending: true }),
    supabase
      .from("receipt_templates")
      .select("*")
      .eq("family_id", normalizedFamilyId)
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase
      .from("host_business_details")
      .select("*")
      .eq("family_id", normalizedFamilyId)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  const errors = [settingsResult.error, rulesResult.error, receiptResult.error, businessResult.error].filter(Boolean);
  if (errors.some(isMissingTableError)) {
    return fallback;
  }
  const firstError = errors[0];
  if (firstError) throw firstError;

  const settingsRow = ((settingsResult.data ?? []) as JsonRecord[])[0] ?? null;
  const receiptRow = ((receiptResult.data ?? []) as JsonRecord[])[0] ?? null;
  const businessRow = ((businessResult.data ?? []) as JsonRecord[])[0] ?? null;
  const savedRules = ((rulesResult.data ?? []) as JsonRecord[]).map(mapCommissionRule);
  const defaultGst = createDefaultGstSettings();
  const defaultReceipt = createDefaultReceiptTemplate();
  const defaultBusiness = createDefaultHostBusinessDetails();

  return {
    familyId: normalizedFamilyId,
    exists: Boolean(settingsRow || receiptRow || businessRow || savedRules.length > 0),
    gstSettings: settingsRow
      ? {
          gstEnabled: asBoolean(settingsRow.gst_enabled),
          gstin: asString(settingsRow.gstin),
          legalBusinessName: asString(settingsRow.legal_business_name),
          tradeName: asString(settingsRow.trade_name),
          state: asString(settingsRow.state),
          stateCode: asString(settingsRow.state_code),
          accommodationGstApplicable: asBoolean(settingsRow.accommodation_gst_applicable),
          defaultAccommodationGstPercent: nonNegative(settingsRow.default_accommodation_gst_percent),
          platformFeeGstPercent: nonNegative(settingsRow.platform_fee_gst_percent),
          servicesExtrasGstPercent: nonNegative(settingsRow.services_extras_gst_percent),
          taxPricingMode: asTaxMode(settingsRow.tax_pricing_mode),
          invoicePrefix: asString(settingsRow.invoice_prefix) ?? defaultGst.invoicePrefix,
          receiptPrefix: asString(settingsRow.receipt_prefix) ?? defaultGst.receiptPrefix,
        }
      : defaultGst,
    commissionRules: mergeRules(savedRules),
    receiptTemplate: receiptRow
      ? {
          logoUrl: asString(receiptRow.logo_url),
          receiptHeaderTitle: asString(receiptRow.receipt_header_title) ?? defaultReceipt.receiptHeaderTitle,
          footerNote: asString(receiptRow.footer_note),
          supportPhone: asString(receiptRow.support_phone),
          supportEmail: asString(receiptRow.support_email),
          address: asString(receiptRow.address),
          showGstin: receiptRow.show_gstin !== false,
          showGuestContact: receiptRow.show_guest_contact !== false,
          showOtaSource: receiptRow.show_ota_source !== false,
          showPaymentMode: receiptRow.show_payment_mode !== false,
          showHostSignatureBlock: asBoolean(receiptRow.show_host_signature_block),
          showGeneratedByFamlo: receiptRow.show_generated_by_famlo !== false,
          termsConditions: asString(receiptRow.terms_conditions),
        }
      : defaultReceipt,
    hostBusinessDetails: businessRow
      ? {
          businessName: asString(businessRow.business_name),
          ownerFullName: asString(businessRow.owner_full_name),
          phone: asString(businessRow.phone),
          email: asString(businessRow.email),
          alternatePhone: asString(businessRow.alternate_phone),
          addressLine1: asString(businessRow.address_line1),
          addressLine2: asString(businessRow.address_line2),
          city: asString(businessRow.city),
          state: asString(businessRow.state),
          pinCode: asString(businessRow.pin_code),
          country: asString(businessRow.country) ?? defaultBusiness.country,
          gstin: asString(businessRow.gstin),
          pan: asString(businessRow.pan),
          bankAccountHolderName: asString(businessRow.bank_account_holder_name),
          bankName: asString(businessRow.bank_name),
          accountNumberMasked: maskAccountNumber(asString(businessRow.account_number_masked)),
          ifsc: asString(businessRow.ifsc),
          upiId: asString(businessRow.upi_id),
          signatureUrl: asString(businessRow.signature_url),
          stampUrl: asString(businessRow.stamp_url),
          businessLogoUrl: asString(businessRow.business_logo_url),
        }
      : defaultBusiness,
    updatedAt:
      asString(settingsRow?.updated_at) ??
      asString(receiptRow?.updated_at) ??
      asString(businessRow?.updated_at),
  };
}

export function maskAccountNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\s+/g, "");
  if (digits.includes("*") || digits.length <= 4) return trimmed;
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function validateChannelFinanceSettings(input: ChannelFinanceSettings): string[] {
  const errors: string[] = [];
  const gst = input.gstSettings;

  if (gst.gstEnabled) {
    if (!gst.gstin || !GSTIN_REGEX.test(gst.gstin.toUpperCase())) {
      errors.push("Enter a valid GSTIN when GST is enabled.");
    }
    if (!gst.legalBusinessName?.trim()) {
      errors.push("Legal business name is required when GST is enabled.");
    }
    if (!gst.state?.trim()) {
      errors.push("State is required when GST is enabled.");
    }
  }

  input.commissionRules.forEach((rule) => {
    if (rule.commissionValue < 0) {
      errors.push(`${rule.channelName} commission cannot be negative.`);
    }
    if (rule.commissionType === "percentage" && rule.commissionValue > 100) {
      errors.push(`${rule.channelName} percentage commission cannot exceed 100%.`);
    }
    if (rule.gstPercent < 0) {
      errors.push(`${rule.channelName} GST on commission cannot be negative.`);
    }
  });

  [gst.defaultAccommodationGstPercent, gst.platformFeeGstPercent, gst.servicesExtrasGstPercent].forEach((value) => {
    if (value < 0) {
      errors.push("GST percentage values cannot be negative.");
    }
  });

  return errors;
}

function normalizeForSave(input: ChannelFinanceSettings, familyId: string): ChannelFinanceSettings {
  const defaults = createDefaultChannelFinanceSettings(familyId);
  return {
    familyId,
    exists: input.exists,
    gstSettings: {
      ...defaults.gstSettings,
      ...input.gstSettings,
      gstin: input.gstSettings.gstin?.trim().toUpperCase() || null,
      legalBusinessName: input.gstSettings.legalBusinessName?.trim() || null,
      tradeName: input.gstSettings.tradeName?.trim() || null,
      state: input.gstSettings.state?.trim() || null,
      stateCode: input.gstSettings.stateCode?.trim() || null,
      defaultAccommodationGstPercent: nonNegative(input.gstSettings.defaultAccommodationGstPercent),
      platformFeeGstPercent: nonNegative(input.gstSettings.platformFeeGstPercent),
      servicesExtrasGstPercent: nonNegative(input.gstSettings.servicesExtrasGstPercent),
      taxPricingMode: asTaxMode(input.gstSettings.taxPricingMode),
      invoicePrefix: input.gstSettings.invoicePrefix?.trim() || defaults.gstSettings.invoicePrefix,
      receiptPrefix: input.gstSettings.receiptPrefix?.trim() || defaults.gstSettings.receiptPrefix,
    },
    commissionRules: input.commissionRules.map((rule) => {
      const commissionType = asCommissionType(rule.commissionType);
      return {
        ...rule,
        channelKey: rule.channelKey.trim() || "custom",
        channelName: rule.channelName.trim() || "Custom channel",
        commissionType,
        commissionValue: commissionType === "percentage" ? percentage(rule.commissionValue) : nonNegative(rule.commissionValue),
        gstPercent: nonNegative(rule.gstPercent),
        taxMode: asTaxMode(rule.taxMode),
        effectiveFrom: rule.effectiveFrom?.trim() || null,
        notes: rule.notes?.trim() || null,
      };
    }),
    receiptTemplate: {
      ...defaults.receiptTemplate,
      ...input.receiptTemplate,
      logoUrl: input.receiptTemplate.logoUrl?.trim() || null,
      receiptHeaderTitle: input.receiptTemplate.receiptHeaderTitle?.trim() || defaults.receiptTemplate.receiptHeaderTitle,
      footerNote: input.receiptTemplate.footerNote?.trim() || null,
      supportPhone: input.receiptTemplate.supportPhone?.trim() || null,
      supportEmail: input.receiptTemplate.supportEmail?.trim() || null,
      address: input.receiptTemplate.address?.trim() || null,
      termsConditions: input.receiptTemplate.termsConditions?.trim() || null,
    },
    hostBusinessDetails: {
      ...defaults.hostBusinessDetails,
      ...input.hostBusinessDetails,
      businessName: input.hostBusinessDetails.businessName?.trim() || null,
      ownerFullName: input.hostBusinessDetails.ownerFullName?.trim() || null,
      phone: input.hostBusinessDetails.phone?.trim() || null,
      email: input.hostBusinessDetails.email?.trim() || null,
      alternatePhone: input.hostBusinessDetails.alternatePhone?.trim() || null,
      addressLine1: input.hostBusinessDetails.addressLine1?.trim() || null,
      addressLine2: input.hostBusinessDetails.addressLine2?.trim() || null,
      city: input.hostBusinessDetails.city?.trim() || null,
      state: input.hostBusinessDetails.state?.trim() || null,
      pinCode: input.hostBusinessDetails.pinCode?.trim() || null,
      country: input.hostBusinessDetails.country?.trim() || defaults.hostBusinessDetails.country,
      gstin: input.hostBusinessDetails.gstin?.trim().toUpperCase() || null,
      pan: input.hostBusinessDetails.pan?.trim().toUpperCase() || null,
      bankAccountHolderName: input.hostBusinessDetails.bankAccountHolderName?.trim() || null,
      bankName: input.hostBusinessDetails.bankName?.trim() || null,
      accountNumberMasked: maskAccountNumber(input.hostBusinessDetails.accountNumberMasked),
      ifsc: input.hostBusinessDetails.ifsc?.trim().toUpperCase() || null,
      upiId: input.hostBusinessDetails.upiId?.trim() || null,
      signatureUrl: input.hostBusinessDetails.signatureUrl?.trim() || null,
      stampUrl: input.hostBusinessDetails.stampUrl?.trim() || null,
      businessLogoUrl: input.hostBusinessDetails.businessLogoUrl?.trim() || null,
    },
    updatedAt: input.updatedAt,
  };
}

export async function saveChannelFinanceSettings(
  supabase: SupabaseClient,
  familyId: string,
  input: ChannelFinanceSettings
): Promise<ChannelFinanceSettings> {
  const normalizedFamilyId = familyId.trim();
  if (!normalizedFamilyId) {
    throw new Error("familyId is required to save Channel Finance settings.");
  }

  const normalized = normalizeForSave(input, normalizedFamilyId);
  const validationErrors = validateChannelFinanceSettings(normalized);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0]);
  }

  const nowIso = new Date().toISOString();
  const gst = normalized.gstSettings;
  const receipt = normalized.receiptTemplate;
  const business = normalized.hostBusinessDetails;

  const settingsPayload = {
    family_id: normalizedFamilyId,
    gst_enabled: gst.gstEnabled,
    gstin: gst.gstin,
    legal_business_name: gst.legalBusinessName,
    trade_name: gst.tradeName,
    state: gst.state,
    state_code: gst.stateCode,
    accommodation_gst_applicable: gst.accommodationGstApplicable,
    default_accommodation_gst_percent: gst.defaultAccommodationGstPercent,
    platform_fee_gst_percent: gst.platformFeeGstPercent,
    services_extras_gst_percent: gst.servicesExtrasGstPercent,
    tax_pricing_mode: gst.taxPricingMode,
    invoice_prefix: gst.invoicePrefix,
    receipt_prefix: gst.receiptPrefix,
    updated_at: nowIso,
  };

  const receiptPayload = {
    family_id: normalizedFamilyId,
    logo_url: receipt.logoUrl,
    receipt_header_title: receipt.receiptHeaderTitle,
    footer_note: receipt.footerNote,
    support_phone: receipt.supportPhone,
    support_email: receipt.supportEmail,
    address: receipt.address,
    show_gstin: receipt.showGstin,
    show_guest_contact: receipt.showGuestContact,
    show_ota_source: receipt.showOtaSource,
    show_payment_mode: receipt.showPaymentMode,
    show_host_signature_block: receipt.showHostSignatureBlock,
    show_generated_by_famlo: receipt.showGeneratedByFamlo,
    terms_conditions: receipt.termsConditions,
    updated_at: nowIso,
  };

  const businessPayload = {
    family_id: normalizedFamilyId,
    business_name: business.businessName,
    owner_full_name: business.ownerFullName,
    phone: business.phone,
    email: business.email,
    alternate_phone: business.alternatePhone,
    address_line1: business.addressLine1,
    address_line2: business.addressLine2,
    city: business.city,
    state: business.state,
    pin_code: business.pinCode,
    country: business.country,
    gstin: business.gstin,
    pan: business.pan,
    bank_account_holder_name: business.bankAccountHolderName,
    bank_name: business.bankName,
    account_number_masked: business.accountNumberMasked,
    ifsc: business.ifsc,
    upi_id: business.upiId,
    signature_url: business.signatureUrl,
    stamp_url: business.stampUrl,
    business_logo_url: business.businessLogoUrl,
    updated_at: nowIso,
  };

  const [settingsResult, receiptResult, businessResult, rulesResult] = await Promise.all([
    supabase.from("channel_finance_settings").upsert(settingsPayload as never, { onConflict: "family_id" }),
    supabase.from("receipt_templates").upsert(receiptPayload as never, { onConflict: "family_id" }),
    supabase.from("host_business_details").upsert(businessPayload as never, { onConflict: "family_id" }),
    supabase.from("channel_commission_rules").upsert(
      normalized.commissionRules.map((rule) => ({
        family_id: normalizedFamilyId,
        channel_key: rule.channelKey,
        channel_name: rule.channelName,
        commission_type: rule.commissionType,
        commission_value: rule.commissionValue,
        tax_on_commission: rule.taxOnCommission,
        gst_percent: rule.gstPercent,
        tax_mode: rule.taxMode,
        effective_from: rule.effectiveFrom,
        notes: rule.notes,
        is_active: rule.isActive,
        updated_at: nowIso,
      })) as never,
      { onConflict: "family_id,channel_key" }
    ),
  ]);

  const error = settingsResult.error ?? receiptResult.error ?? businessResult.error ?? rulesResult.error;
  if (error) throw error;

  return loadChannelFinanceSettings(supabase, normalizedFamilyId);
}

export function resolveCommissionRuleForChannel(
  rules: ChannelCommissionRule[],
  sourceChannel: string | null | undefined
): ChannelCommissionRule | null {
  const normalized = (sourceChannel ?? "").toLowerCase();
  const candidates = rules.filter((rule) => rule.isActive && rule.source === "saved");
  if (normalized.includes("booking")) return candidates.find((rule) => rule.channelKey === "booking_com") ?? null;
  if (normalized.includes("airbnb")) return candidates.find((rule) => rule.channelKey === "airbnb") ?? null;
  if (normalized.includes("agoda")) return candidates.find((rule) => rule.channelKey === "agoda") ?? null;
  if (normalized.includes("expedia")) return candidates.find((rule) => rule.channelKey === "expedia") ?? null;
  if (normalized.includes("goibibo") || normalized.includes("mmt") || normalized.includes("makemytrip")) {
    return candidates.find((rule) => rule.channelKey === "goibibo_mmt") ?? null;
  }
  if (normalized.includes("direct") || normalized.includes("famlo")) return candidates.find((rule) => rule.channelKey === "direct") ?? null;
  return candidates.find((rule) => rule.channelKey === "custom") ?? null;
}

export function estimateChannelCommission(input: {
  grossAmount: number | null | undefined;
  actualCommissionAmount?: number | null;
  rules: ChannelCommissionRule[];
  sourceChannel: string | null | undefined;
}): ChannelCommissionEstimate {
  const actual = input.actualCommissionAmount;
  if (typeof actual === "number" && Number.isFinite(actual) && actual > 0) {
    return {
      amount: actual,
      gstAmount: null,
      totalCommissionAmount: actual,
      source: "actual",
      ruleName: "Booking data",
    };
  }

  const grossAmount = typeof input.grossAmount === "number" && Number.isFinite(input.grossAmount) ? input.grossAmount : null;
  const rule = resolveCommissionRuleForChannel(input.rules, input.sourceChannel);
  if (!rule || grossAmount == null) {
    return {
      amount: null,
      gstAmount: null,
      totalCommissionAmount: null,
      source: "not_available",
      ruleName: null,
    };
  }

  const amount =
    rule.commissionType === "percentage"
      ? Math.max(0, grossAmount * (rule.commissionValue / 100))
      : Math.max(0, rule.commissionValue);
  const gstAmount = rule.taxOnCommission ? amount * (Math.max(0, rule.gstPercent) / 100) : 0;

  return {
    amount,
    gstAmount,
    totalCommissionAmount: rule.taxMode === "inclusive" ? amount : amount + gstAmount,
    source: "estimated",
    ruleName: rule.channelName,
  };
}
