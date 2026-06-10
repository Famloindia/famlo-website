import { NextRequest, NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

function getReferenceValue(message: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = message.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ ticketId: string }> }
) {
  if (!(await hasAdminPermission("support"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketId } = await context.params;
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select("id,host_id,host_name,subject,message,status,admin_reply,created_at,updated_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (error) {
      console.error("[AdminSupportDetail] support_tickets read failed", {
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return NextResponse.json({ error: "Support ticket data unavailable." }, { status: 503 });
    }

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const hostId = typeof ticket.host_id === "string" ? ticket.host_id : "";
    const { data: profile, error: profileError } = hostId
      ? await supabase
          .from("user_profiles_v2")
          .select("user_id,last_lat,last_lng,last_location_label,updated_at")
          .eq("user_id", hostId)
          .maybeSingle()
      : { data: null, error: null };

    if (profileError) {
      console.error("[AdminSupportDetail] user_profiles_v2 read failed", {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
      });
    }

    const message = typeof ticket.message === "string" ? ticket.message : "";

    return NextResponse.json({
      ticket: {
        id: String(ticket.id),
        hostId,
        hostName: typeof ticket.host_name === "string" && ticket.host_name.length > 0 ? ticket.host_name : "Support requester",
        subject: typeof ticket.subject === "string" ? ticket.subject : "Support request",
        message,
        status: ticket.status === "resolved" || ticket.status === "in_progress" ? ticket.status : "open",
        adminReply: typeof ticket.admin_reply === "string" ? ticket.admin_reply : null,
        createdAt: typeof ticket.created_at === "string" ? ticket.created_at : null,
        updatedAt: typeof ticket.updated_at === "string" ? ticket.updated_at : null,
        references: {
          requesterId: hostId || null,
          bookingId: getReferenceValue(message, ["Booking ID"]),
          propertyId: getReferenceValue(message, ["Property ID", "Family ID"]),
        },
        emergencyProfile:
          profile && typeof profile === "object"
            ? {
                userId: typeof profile.user_id === "string" ? profile.user_id : hostId,
                lastLat: typeof profile.last_lat === "number" ? profile.last_lat : null,
                lastLng: typeof profile.last_lng === "number" ? profile.last_lng : null,
                lastLocationLabel: typeof profile.last_location_label === "string" ? profile.last_location_label : null,
                updatedAt: typeof profile.updated_at === "string" ? profile.updated_at : null,
              }
            : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to load support ticket." }, { status: 500 });
  }
}
