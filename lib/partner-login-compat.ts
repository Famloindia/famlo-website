import type { SupabaseClient } from "@supabase/supabase-js";

type MaybeQueryError = {
  code?: string | null;
  message?: string | null;
} | null | undefined;

const OPTIONAL_FAMILY_FIELDS = ["host_password", "password", "host_phone"] as const;

export type OptionalFamilyField = (typeof OPTIONAL_FAMILY_FIELDS)[number];

export function isMissingColumnError(error: MaybeQueryError): boolean {
  if (!error) return false;

  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return error.code === "42703" || (message.includes("column") && message.includes("does not exist"));
}

export async function safeSelectFamilyOptionalField(
  supabase: SupabaseClient,
  familyId: string,
  fieldName: OptionalFamilyField
): Promise<string | null> {
  const { data, error } = await supabase
    .from("families")
    .select(fieldName)
    .eq("id", familyId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) return null;
    throw error;
  }

  const value = (data as Record<string, unknown> | null)?.[fieldName];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
