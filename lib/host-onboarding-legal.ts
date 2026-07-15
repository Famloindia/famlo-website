import type { HostListingMeta } from "@/lib/host-listing-meta";

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, "").trim().toUpperCase() : "";
}

export function isValidGstin(value: unknown): boolean {
  const normalized = normalizeGstin(value);
  return normalized.length === 0 || GSTIN_REGEX.test(normalized);
}

export type AgreementSource = {
  platformAgreementAccepted?: unknown;
  platformAgreementAcceptedAt?: unknown;
  hostAgreementAccepted?: unknown;
  hostAgreementAcceptedAt?: unknown;
  termsPrivacyAccepted?: unknown;
  commissionAgreementAccepted?: unknown;
  codeOfConductAccepted?: unknown;
  cancellationPolicyAccepted?: unknown;
};

export type AgreementState = {
  accepted: boolean;
  acceptedAt: string;
};

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function derivePlatformAgreementState(source: AgreementSource): AgreementState {
  const accepted =
    asBoolean(source.platformAgreementAccepted) ||
    asBoolean(source.hostAgreementAccepted) ||
    (asBoolean(source.termsPrivacyAccepted) &&
      asBoolean(source.commissionAgreementAccepted) &&
      asBoolean(source.codeOfConductAccepted) &&
      asBoolean(source.cancellationPolicyAccepted));

  const acceptedAt = asString(source.platformAgreementAcceptedAt) || asString(source.hostAgreementAcceptedAt);

  return { accepted, acceptedAt };
}

export function buildPlatformAgreementCompatibilityPatch(accepted: boolean, acceptedAt: string) {
  const nextAcceptedAt = accepted ? acceptedAt : "";
  return {
    platformAgreementAccepted: accepted,
    platformAgreementAcceptedAt: nextAcceptedAt,
    hostAgreementAccepted: accepted,
    hostAgreementAcceptedAt: nextAcceptedAt,
    termsPrivacyAccepted: accepted,
    commissionAgreementAccepted: accepted,
    codeOfConductAccepted: accepted,
    cancellationPolicyAccepted: accepted,
  };
}

export function isPlatformAgreementAccepted(source: AgreementSource): boolean {
  return derivePlatformAgreementState(source).accepted;
}

export function getPlatformAgreementAcceptedAt(source: AgreementSource): string {
  return derivePlatformAgreementState(source).acceptedAt;
}

export type HostReelAsset = {
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
};

function asPositiveNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

export function getHostReelAsset(source: {
  meta?: HostListingMeta | null;
  payload?: Record<string, unknown> | null;
  row?: Record<string, unknown> | null;
}): HostReelAsset | null {
  const meta = source.meta ?? {};
  const payload = source.payload ?? {};
  const row = source.row ?? {};

  const storageKey =
    asString(row.host_reel_storage_key) ||
    asString(payload.hostReelStorageKey) ||
    asString(meta.hostReelStorageKey);
  const publicUrl =
    asString(row.host_reel_public_url) ||
    asString(payload.hostReelPublicUrl) ||
    asString(meta.hostReelPublicUrl);
  const mimeType =
    asString(row.host_reel_mime_type) ||
    asString(payload.hostReelMimeType) ||
    asString(meta.hostReelMimeType);
  const sizeBytes =
    asPositiveNumber(row.host_reel_size_bytes) ||
    asPositiveNumber(payload.hostReelSizeBytes) ||
    asPositiveNumber(meta.hostReelSizeBytes);
  const uploadedAt =
    asString(row.host_reel_uploaded_at) ||
    asString(payload.hostReelUploadedAt) ||
    asString(meta.hostReelUploadedAt);

  if (!publicUrl) {
    return null;
  }

  return {
    storageKey,
    publicUrl,
    mimeType,
    sizeBytes,
    uploadedAt,
  };
}
