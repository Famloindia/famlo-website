// lib/audit.ts
// Shared audit logging utilities for /admin and /teams portals
// All writes are to APPEND-ONLY tables — no updates or deletes permitted

import { createAdminSupabaseClient } from "@/lib/supabase";

export type AuditActionType =
  | "approve"
  | "reject"
  | "suspend"
  | "resume"
  | "commission_change"
  | "payout_freeze"
  | "payout_release"
  | "force_refund"
  | "custom_split"
  | "data_erasure"
  | "keyword_flag_review"
  | "keyword_flag_dismiss"
  | "document_review"
  | "document_approve"
  | "document_reject"
  | "shadow_start"
  | "shadow_end"
  | "whatsapp_nudge"
  | "renewal_request"
  | "grievance_assign"
  | "grievance_resolve"
  | "fraud_clear"
  | "fraud_confirm"
  | "id_verify_confirm"
  | "grievance_status_update"
  | "chat_flag_reviewed"
  | "chat_flag_dismissed"
  | "gst_export_generated"
  | "add_chat_keyword"
  | "remove_chat_keyword"
  | "fraud_confirmed"
  | "fraud_cleared"
  | "bulk_email_sent"
  | "kill_switch_on"
  | "kill_switch_off"
  | "page_view"
  | "login"
  | "logout";

export interface AuditParams {
  actorId: string;
  actorRole: "admin" | "team";
  actionType: AuditActionType;
  targetUserId?: string;
  resourceType?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
}

/**
 * Log an action to the audit_log table.
 * This table is APPEND-ONLY. Never call update/delete on it.
 */
export async function logAuditAction(params: AuditParams): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient();
    await supabase.from("audit_log").insert({
      actor_id: params.actorId,
      actor_role: params.actorRole,
      action_type: params.actionType,
      target_user_id: params.targetUserId ?? null,
      resource_type: params.resourceType ?? null,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      reason: params.reason ?? null,
      ip_address: params.ipAddress ?? null,
    });
  } catch (err) {
    // Never let audit failures break the primary action
    console.error("[AuditLog] Failed to write audit entry:", err);
  }
}

export interface SessionLogParams {
  actorId: string;
  role: "admin" | "team";
  action: string;
  page: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log a session event to session_audit_log.
 * Required for every login, page visit, and action in /admin or /teams.
 * Minimum retention: 180 days (enforced via Supabase RLS).
 */
export async function logSessionEvent(params: SessionLogParams): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient();
    await supabase.from("session_audit_log").insert({
      actor_id: params.actorId,
      role: params.role,
      action: params.action,
      page: params.page,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    });
  } catch (err) {
    console.error("[SessionLog] Failed to write session entry:", err);
  }
}

/**
 * Get IP address from Next.js request headers.
 */
export function getIpFromHeaders(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
