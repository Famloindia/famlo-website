import { NextRequest, NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

type SupportFilter = "all" | "open" | "resolved" | "emergency" | "user-problems";

function getPriority(subject: string): string | null {
  if (subject.startsWith("[EMERGENCY]")) return "emergency";
  if (subject.startsWith("[USER PROBLEM]")) return "high";
  return null;
}

function getReferenceValue(message: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = message.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function buildSnippet(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177)}...`;
}

export async function GET(request: NextRequest) {
  if (!(await hasAdminPermission("support"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const filter = (request.nextUrl.searchParams.get("filter") ?? "open") as SupportFilter;
    const parsedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const parsedOffset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
    const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    let query = createAdminSupabaseClient()
      .from("support_tickets")
      .select("id,host_id,host_name,subject,message,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter === "open") {
      query = query.in("status", ["open", "in_progress"]);
    } else if (filter === "resolved") {
      query = query.eq("status", "resolved");
    } else if (filter === "emergency") {
      query = query.ilike("subject", "[EMERGENCY]%");
    } else if (filter === "user-problems") {
      query = query.ilike("subject", "[USER PROBLEM]%");
    }

    const { data, error } = await query;
    if (error) {
      console.error("[AdminSupportList] support_tickets read failed", {
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return NextResponse.json({ error: "Support ticket data unavailable." }, { status: 503 });
    }

    const tickets = (data ?? []).map((ticket) => {
      const message = typeof ticket.message === "string" ? ticket.message : "";
      return {
        id: String(ticket.id),
        hostId: typeof ticket.host_id === "string" ? ticket.host_id : "",
        hostName: typeof ticket.host_name === "string" && ticket.host_name.length > 0 ? ticket.host_name : "Support requester",
        subject: typeof ticket.subject === "string" ? ticket.subject : "Support request",
        status: ticket.status === "resolved" || ticket.status === "in_progress" ? ticket.status : "open",
        priority: getPriority(typeof ticket.subject === "string" ? ticket.subject : ""),
        createdAt: typeof ticket.created_at === "string" ? ticket.created_at : null,
        updatedAt: typeof ticket.updated_at === "string" ? ticket.updated_at : null,
        references: {
          requesterId: typeof ticket.host_id === "string" ? ticket.host_id : null,
          bookingId: getReferenceValue(message, ["Booking ID"]),
          propertyId: getReferenceValue(message, ["Property ID", "Family ID"]),
        },
        lastSnippet: buildSnippet(message),
      };
    });

    return NextResponse.json({ tickets, limit, offset });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load support tickets." }, { status: 500 });
  }
}
