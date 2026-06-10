import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeGstin } from "@/lib/host-onboarding-legal";

export const HOST_GST_STATUS_VALUES = [
  "not_provided",
  "pending_review",
  "verified",
  "rejected",
] as const;

export type HostGstVerificationStatus = (typeof HOST_GST_STATUS_VALUES)[number];

type JsonRecord = Record<string, unknown>;

export type HostGstProfile = {
  id: string | null;
  hostId: string | null;
  userId: string | null;
  familyId: string | null;
  gstin: string;
  verificationStatus: HostGstVerificationStatus;
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStatus(value: unknown, gstin: string): HostGstVerificationStatus {
  const candidate = asString(value);
  if (candidate && HOST_GST_STATUS_VALUES.includes(candidate as HostGstVerificationStatus)) {
    return candidate as HostGstVerificationStatus;
  }
  return gstin ? "pending_review" : "not_provided";
}

export function mapHostGstProfileRow(row: JsonRecord | null | undefined): HostGstProfile {
  const gstin = normalizeGstin(row?.gstin);
  return {
    id: asString(row?.id),
    hostId: asString(row?.host_id),
    userId: asString(row?.user_id),
    familyId: asString(row?.family_id),
    gstin,
    verificationStatus: normalizeStatus(row?.verification_status, gstin),
    rejectionReason: asString(row?.rejection_reason),
    verifiedAt: asString(row?.verified_at),
    createdAt: asString(row?.created_at),
    updatedAt: asString(row?.updated_at),
  };
}

export async function upsertHostGstProfile(
  supabase: SupabaseClient,
  input: {
    hostId: string;
    userId: string;
    familyId?: string | null;
    gstin?: string | null;
    verificationStatus?: HostGstVerificationStatus | null;
    rejectionReason?: string | null;
  }
): Promise<HostGstProfile> {
  const gstin = normalizeGstin(input.gstin);
  const verificationStatus = input.verificationStatus ?? (gstin ? "pending_review" : "not_provided");
  const verifiedAt = verificationStatus === "verified" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("host_gst_profiles")
    .upsert(
      {
        host_id: input.hostId,
        user_id: input.userId,
        family_id: input.familyId ?? null,
        gstin: gstin || null,
        verification_status: verificationStatus,
        rejection_reason: input.rejectionReason ?? null,
        verified_at: verifiedAt,
        updated_at: new Date().toISOString(),
      } as never,
      {
        onConflict: "host_id",
      }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapHostGstProfileRow((data ?? null) as JsonRecord | null);
}
