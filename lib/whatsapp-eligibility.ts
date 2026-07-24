import type { SupabaseClient } from "@supabase/supabase-js";

import { asString } from "@/lib/platform-utils";
import { getWhatsAppRuntimeConfig, normalizeMetaPhone } from "@/lib/whatsapp-config";

export type EligibleHostWhatsApp = {
  hostUserId: string;
  phoneE164: string;
  language: string;
};

export async function resolveEligibleHostWhatsApp(
  supabase: SupabaseClient,
  hostUserId: string
): Promise<EligibleHostWhatsApp | null> {
  const config = getWhatsAppRuntimeConfig();
  if (!config.enabled) return null;
  const { data, error } = await supabase
    .from("host_whatsapp_settings")
    .select("host_user_id,phone_e164,language,enabled,ownership_verified_at,opted_in_at")
    .eq("host_user_id", hostUserId)
    .maybeSingle();
  if (error) throw error;
  const phone = normalizeMetaPhone(asString(data?.phone_e164));
  if (!data?.enabled || !data.ownership_verified_at || !data.opted_in_at || !phone) return null;
  return {
    hostUserId,
    phoneE164: `+${phone}`,
    language: asString(data.language) ?? config.templateLanguage,
  };
}

export function absoluteFamloUrl(path: string): string | null {
  const siteUrl = getWhatsAppRuntimeConfig().siteUrl;
  if (!siteUrl) return null;
  try {
    return new URL(path, siteUrl).toString();
  } catch {
    return null;
  }
}
