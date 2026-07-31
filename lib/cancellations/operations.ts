import type { SupabaseClient } from "@supabase/supabase-js";

export async function listCancellationCases(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("cancellation_requests_v2").select(
    "id,booking_id,payment_id,requested_by,request_reason,status,gross_paid_amount_minor,suggested_refund_amount_minor,approved_refund_amount_minor,assigned_service_executive_id,service_executive_notes,service_executive_recommendation,contact_status,admin_notes,requested_at,updated_at,bookings_v2(status,payment_status,start_date,end_date,total_price,host_response_status,host_response_due_at),payments_v2(gateway,status,refund_status)"
  ).order("requested_at", { ascending: true }).limit(250);
  if (error) throw error;
  return data ?? [];
}

export async function listOpenHostSlaIncidents(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("host_approval_sla_incidents").select(
    "id,booking_id,host_id,requested_at,reminder_due_at,warning_due_at,response_due_at,reminder_sent_at,warning_raised_at,overdue_at,response_status,bookings_v2(status,payment_status,start_date,end_date)"
  ).eq("response_status", "pending").order("response_due_at", { ascending: true }).limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function updateCancellationByServiceExecutive(supabase: SupabaseClient, input: {
  requestId: string;
  actorId: string;
  action: "assign" | "guest_contacted" | "guest_unreachable" | "host_contacted" | "host_unreachable" | "recommend_approve" | "recommend_reject";
  notes?: string | null;
}) {
  const actionMap = {
    assign: { status: "under_review", assigned_service_executive_id: input.actorId },
    guest_contacted: { status: "guest_contacted", contact_status: "guest_contacted", guest_contacted_at: new Date().toISOString() },
    guest_unreachable: { status: "guest_contact_pending", contact_status: "guest_unreachable" },
    host_contacted: { status: "host_contacted", contact_status: "host_contacted" },
    host_unreachable: { status: "recommended_approve", contact_status: "host_unreachable", service_executive_recommendation: "approve", recommended_at: new Date().toISOString() },
    recommend_approve: { status: "recommended_approve", service_executive_recommendation: "approve", recommended_at: new Date().toISOString() },
    recommend_reject: { status: "recommended_reject", service_executive_recommendation: "reject", recommended_at: new Date().toISOString() },
  } as const;
  const { data: current, error: currentError } = await supabase.from("cancellation_requests_v2")
    .select("id,booking_id,status").eq("id", input.requestId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Cancellation request not found.");
  if (["approved", "rejected", "withdrawn", "refund_pending", "refund_processing", "completed"].includes(current.status)) {
    throw new Error("This cancellation request is already final.");
  }
  const update = { ...actionMap[input.action], service_executive_notes: input.notes?.trim().slice(0, 4_000) || undefined, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("cancellation_requests_v2").update(update as never).eq("id", input.requestId).select("id,status").single();
  if (error) throw error;
  await supabase.from("cancellation_request_events_v2").insert({
    cancellation_request_id: input.requestId,
    booking_id: current.booking_id,
    actor_id: input.actorId,
    actor_role: "service_executive",
    action: `service_executive_${input.action}`,
    idempotency_key: `service:${input.requestId}:${input.action}:${Date.now()}`,
  });
  return data;
}
