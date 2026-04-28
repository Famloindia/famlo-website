import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_CHAT_KEYWORDS = [
  "pay me directly",
  "phone number",
  "whatsapp",
  "telegram",
  "bank transfer",
  "cash",
  "upi direct",
  "google pay",
  "call me",
  "message me on",
];

type ChatFlagStatus = "pending" | "reviewed" | "dismissed";

export type ChatSafetyMatch = {
  matched: boolean;
  trigger: string | null;
};

function normalizeKeywords(keywords: string[]): string[] {
  return [...new Set([...DEFAULT_CHAT_KEYWORDS, ...keywords].map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))];
}

export function detectChatSafetyIssue(text: string, keywords: string[]): ChatSafetyMatch {
  const normalized = text.toLowerCase();
  const combinedKeywords = normalizeKeywords(keywords);

  for (const keyword of combinedKeywords) {
    if (normalized.includes(keyword)) {
      return { matched: true, trigger: keyword };
    }
  }

  if (/\b\d{10,}\b/.test(text)) {
    return { matched: true, trigger: "phone number" };
  }

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    return { matched: true, trigger: "email" };
  }

  if (/[A-Za-z0-9.\-_]{2,}@[A-Za-z]{2,}/.test(text)) {
    return { matched: true, trigger: "upi" };
  }

  return { matched: false, trigger: null };
}

export async function fetchChatKeywords(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("chat_keywords").select("keyword");
  if (error) {
    console.error("Failed to load chat keywords:", error);
    return [];
  }

  return (data ?? [])
    .map((row) => (typeof row.keyword === "string" ? row.keyword.toLowerCase().trim() : ""))
    .filter(Boolean);
}

export async function ensurePendingChatFlag(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("chat_flags")
    .select("conversation_id,status")
    .eq("conversation_id", conversationId)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("Failed to inspect existing chat flag:", existingError);
    return;
  }

  const payload = {
    conversation_id: conversationId,
    status: "pending" as ChatFlagStatus,
    reviewed_by: null,
    reviewed_at: null,
  };

  if (existing?.conversation_id) {
    const { error } = await supabase.from("chat_flags").update(payload).eq("conversation_id", conversationId);
    if (error) {
      console.error("Failed to update chat flag:", error);
    }
    return;
  }

  const { error } = await supabase.from("chat_flags").insert(payload);
  if (error) {
    console.error("Failed to create chat flag:", error);
  }
}

