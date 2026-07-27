import type { SupabaseClient } from "@supabase/supabase-js";

import { asString } from "@/lib/platform-utils";
import { loadUserProfileCompatibility } from "@/lib/user-profile";
import {
  getWhatsAppRuntimeConfig,
  isStagingExplicitWhatsAppDeliveryAllowed,
  normalizeMetaPhone,
} from "@/lib/whatsapp-config";

export type EligibleHostWhatsApp = {
  hostUserId: string;
  phoneE164: string;
  language: string;
};

export async function resolveEligibleHostWhatsApp(
  supabase: SupabaseClient,
  hostUserId: string,
  options: { allowStagingExplicitDelivery?: boolean } = {}
): Promise<EligibleHostWhatsApp | null> {
  const config = getWhatsAppRuntimeConfig();
  if (
    !config.enabled &&
    !(options.allowStagingExplicitDelivery && isStagingExplicitWhatsAppDeliveryAllowed())
  ) {
    return null;
  }
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

export async function resolveEligibleGuestWhatsApp(
  supabase: SupabaseClient,
  guestUserId: string
): Promise<{ guestUserId: string; phoneE164: string } | null> {
  const config = getWhatsAppRuntimeConfig();
  if (!config.enabled) return null;
  const profile = await loadUserProfileCompatibility(supabase, guestUserId);
  const phone = normalizeMetaPhone(profile?.phone);
  if (!profile?.phone_verified_at || !phone) return null;
  return { guestUserId, phoneE164: `+${phone}` };
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
