import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueNotificationRecord } from "@/lib/notifications/enqueue";
import { asString } from "@/lib/platform-utils";
import { getWhatsAppRuntimeConfig } from "@/lib/whatsapp-config";
import { resolveEligibleHostWhatsApp } from "@/lib/whatsapp-eligibility";

export async function enqueueGuestMessageWhatsAppAlert(
  supabase: SupabaseClient,
  input: {
    messageId: string;
    hostUserId: string;
    conversationId: string;
    bookingId?: string | null;
    familyId?: string | null;
  }
): Promise<"inserted" | "deduped" | "ineligible"> {
  const config = getWhatsAppRuntimeConfig();
  if (!config.templates.guestMessageReceivedHost) return "ineligible";
  const eligible = await resolveEligibleHostWhatsApp(supabase, input.hostUserId);
  if (!eligible) return "ineligible";

  let propertyName = "your Famlo property";
  if (input.familyId) {
    const { data, error } = await supabase
      .from("families")
      .select("name")
      .eq("id", input.familyId)
      .maybeSingle();
    if (error) throw error;
    propertyName = asString(data?.name) ?? propertyName;
  }
  const bookingReference = input.bookingId
    ? `FAM-${input.bookingId.slice(0, 8).toUpperCase()}`
    : "Famlo conversation";
  return enqueueNotificationRecord(supabase, {
    eventType: "guest_message_sent",
    channel: "whatsapp",
    userId: input.hostUserId,
    bookingId: input.bookingId ?? null,
    dedupeKey: `guest_message_sent:${input.messageId}:${input.hostUserId}:whatsapp`,
    subject: "New Famlo guest message",
    recipientRole: "host",
    recipientPhone: eligible.phoneE164,
    templateName: config.templates.guestMessageReceivedHost,
    payload: {
      template_variables: [propertyName, bookingReference],
      chat_url: input.conversationId,
    },
  });
}
