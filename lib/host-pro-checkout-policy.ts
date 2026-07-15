import { canBuyFamloPro, type HostAccessPolicyResult } from "@/lib/host-access-policy";
import { createAdminSupabaseClient } from "@/lib/supabase";

function isPolicySchemaCompatibilityError(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message.toLowerCase()
      : "";

  return message.includes("schema cache") || (message.includes("column") && message.includes("does not exist"));
}

async function loadFamilyPolicySubject(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("families")
    .select("id,property_marketplace_status,trust_status")
    .eq("id", familyId)
    .maybeSingle();

  if (error) {
    if (isPolicySchemaCompatibilityError(error)) {
      return { id: familyId, trust_status: "normal" };
    }
    throw error;
  }

  return (data as Record<string, unknown> | null) ?? { id: familyId, trust_status: "normal" };
}

export async function loadFamloProCheckoutAccess(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string
): Promise<HostAccessPolicyResult> {
  const familyPolicy = await loadFamilyPolicySubject(supabase, familyId);
  return canBuyFamloPro(familyPolicy);
}
