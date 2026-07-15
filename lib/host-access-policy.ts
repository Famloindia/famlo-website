export type PropertyMarketplaceStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "not_listed"
  | "rejected";

export type ProAccessStatus =
  | "none"
  | "checkout_pending"
  | "active"
  | "grace"
  | "expired"
  | "admin_paused"
  | "blocked";

export type TrustStatus = "normal" | "review" | "blocked";

export type HostDashboardMode = "free" | "pro" | "renewal_required" | "pro_paused" | "blocked";
export type HostMarketplaceReviewMode =
  | "marketplace_approved"
  | "marketplace_under_review"
  | "pro_allowed_not_listed"
  | "marketplace_rejected"
  | "blocked";

export type HostAccessPolicySubject = Record<string, unknown> | null | undefined;

export type HostAccessPolicyResult = {
  allowed: boolean;
  reason: string;
};

function valueFrom(subjects: HostAccessPolicySubject[], keys: string[]): unknown {
  for (const subject of subjects) {
    if (!subject) continue;
    for (const key of keys) {
      const value = subject[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return null;
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasNonEmptyArray(value: unknown): boolean | null {
  if (!Array.isArray(value)) return null;
  return value.some((item) => typeof item === "string" ? item.trim().length > 0 : item != null);
}

export function normalizeTrustStatus(...subjects: HostAccessPolicySubject[]): TrustStatus {
  const raw = normalizeToken(valueFrom(subjects, ["trust_status", "host_trust_status", "property_trust_status"]));
  if (["blocked", "suspended", "fraud_blocked", "legal_blocked", "abuse_blocked"].includes(raw)) return "blocked";
  if (["review", "under_review", "trust_review", "manual_review"].includes(raw)) return "review";
  return "normal";
}

export function normalizeMarketplaceStatus(...subjects: HostAccessPolicySubject[]): PropertyMarketplaceStatus {
  const explicit = normalizeToken(
    valueFrom(subjects, [
      "property_marketplace_status",
      "marketplace_status",
      "listing_marketplace_status",
      "listing_status",
    ])
  );

  if (["draft"].includes(explicit)) return "draft";
  if (["submitted"].includes(explicit)) return "submitted";
  if (["under_review", "review", "pending", "pending_review"].includes(explicit)) return "under_review";
  if (["approved", "published", "live"].includes(explicit)) return "approved";
  if (["not_listed", "not-listed", "delisted", "unlisted", "paused"].includes(explicit)) return "not_listed";
  if (["rejected", "declined"].includes(explicit)) return "rejected";

  const legacyApproved = normalizeBoolean(valueFrom(subjects, ["is_approved", "approved"]));
  if (legacyApproved === true) return "approved";
  if (legacyApproved === false) return "under_review";

  const hostStatus = normalizeToken(valueFrom(subjects, ["status", "host_status"]));
  if (hostStatus === "published") return "approved";
  if (["draft", "paused", "inactive"].includes(hostStatus)) return hostStatus === "draft" ? "draft" : "not_listed";

  return "under_review";
}

export function normalizeProAccessStatus(...subjects: HostAccessPolicySubject[]): ProAccessStatus {
  const candidates = subjects.flatMap((subject) => {
    if (!subject) return [];
    return ["pro_access_status", "pro_status", "subscription_status", "status"]
      .map((key) => normalizeToken(subject[key]))
      .filter(Boolean);
  });

  for (const explicit of candidates) {
    if (["active"].includes(explicit)) return "active";
    if (["grace"].includes(explicit)) return "grace";
    if (["checkout_pending", "pending", "payment_pending"].includes(explicit)) return "checkout_pending";
    if (["expired", "cancelled", "inactive", "none", "no_subscription"].includes(explicit)) return explicit === "expired" ? "expired" : "none";
    if (["paused", "admin_paused", "halted", "payment_failed"].includes(explicit)) return "admin_paused";
    if (["blocked", "trust_blocked"].includes(explicit)) return "blocked";
  }

  const allowed = normalizeBoolean(valueFrom(subjects, ["allowed", "pro_allowed"]));
  return allowed === true ? "active" : "none";
}

function hasMinimumPublicContent(...subjects: HostAccessPolicySubject[]): boolean {
  const explicit = normalizeBoolean(valueFrom(subjects, ["has_minimum_public_content", "minimum_public_content_ready"]));
  if (explicit !== null) return explicit;

  const roomCount = normalizeNumber(valueFrom(subjects, ["room_count", "active_room_count", "rooms_count"]));
  const hasRooms = roomCount == null ? null : roomCount > 0;
  const imageArrayValue = valueFrom(subjects, ["image_urls", "images", "photo_urls", "photos"]);
  const imageUrlValue = valueFrom(subjects, ["host_photo_url", "primary_photo_url", "image_url"]);
  const hasImages =
    hasNonEmptyArray(imageArrayValue) ??
    (imageUrlValue === null ? null : Boolean(imageUrlValue));
  const startingPrice = normalizeNumber(valueFrom(subjects, ["starting_room_price", "price_fullday", "nightly_price"]));
  const hasPricing = startingPrice == null ? null : startingPrice > 0;

  const knownChecks = [hasRooms, hasImages, hasPricing].filter((value): value is boolean => value !== null);
  if (knownChecks.length === 0) return true;
  return knownChecks.every(Boolean);
}

export function canListOnMarketplace(...subjects: HostAccessPolicySubject[]): HostAccessPolicyResult {
  if (normalizeTrustStatus(...subjects) === "blocked") {
    return { allowed: false, reason: "trust_blocked" };
  }

  const marketplaceStatus = normalizeMarketplaceStatus(...subjects);
  if (marketplaceStatus !== "approved") {
    return { allowed: false, reason: `marketplace_${marketplaceStatus}` };
  }

  const isActive = normalizeBoolean(valueFrom(subjects, ["is_active", "active"]));
  if (isActive === false) return { allowed: false, reason: "property_inactive" };

  const isAccepting = normalizeBoolean(valueFrom(subjects, ["is_accepting", "accepting"]));
  if (isAccepting === false) return { allowed: false, reason: "property_not_accepting" };

  if (!hasMinimumPublicContent(...subjects)) {
    return { allowed: false, reason: "minimum_public_content_missing" };
  }

  return { allowed: true, reason: "marketplace_approved" };
}

export function canBuyFamloPro(...subjects: HostAccessPolicySubject[]): HostAccessPolicyResult {
  if (normalizeTrustStatus(...subjects) === "blocked") {
    return { allowed: false, reason: "trust_blocked" };
  }

  return { allowed: true, reason: "pro_checkout_allowed" };
}

export function canAccessFamloPro(...subjects: HostAccessPolicySubject[]): HostAccessPolicyResult {
  if (normalizeTrustStatus(...subjects) === "blocked") {
    return { allowed: false, reason: "trust_blocked" };
  }

  const status = normalizeProAccessStatus(...subjects);
  if (status === "active") {
    return { allowed: true, reason: `pro_${status}` };
  }

  return { allowed: false, reason: `pro_${status}` };
}

export function canUseChannelManager(input: {
  property?: HostAccessPolicySubject;
  subscription?: HostAccessPolicySubject;
  mappingExists?: boolean | null;
}): HostAccessPolicyResult {
  const proAccess = canAccessFamloPro(input.property, input.subscription);
  if (!proAccess.allowed) return proAccess;
  if (!input.mappingExists) return { allowed: false, reason: "channel_mapping_missing" };
  return { allowed: true, reason: "channel_manager_allowed" };
}

export function getHostDashboardMode(input: {
  property?: HostAccessPolicySubject;
  subscription?: HostAccessPolicySubject;
}): HostDashboardMode {
  if (normalizeTrustStatus(input.property, input.subscription) === "blocked") return "blocked";
  const status = normalizeProAccessStatus(input.subscription);
  if (status === "active") return "pro";
  if (status === "grace") return "renewal_required";
  if (status === "expired") return "renewal_required";
  if (status === "admin_paused" || status === "blocked") return "pro_paused";
  return "free";
}

export function getHostMarketplaceReviewMode(property?: HostAccessPolicySubject): HostMarketplaceReviewMode {
  if (normalizeTrustStatus(property) === "blocked") return "blocked";

  const marketplaceStatus = normalizeMarketplaceStatus(property);
  if (marketplaceStatus === "approved") return "marketplace_approved";
  if (marketplaceStatus === "not_listed") return "pro_allowed_not_listed";
  if (marketplaceStatus === "rejected") return "marketplace_rejected";
  return "marketplace_under_review";
}
