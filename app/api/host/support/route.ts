import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { resolveHostMobileSession } from "@/lib/host-mobile-session";
import { createAdminSupabaseClient } from "@/lib/supabase";

type SupportTicketRow = {
  id: string;
  host_id: string | null;
  host_name: string | null;
  subject: string | null;
  message: string | null;
  status: string | null;
  admin_reply: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const hostSupportFaqs = [
  {
    key: "listing_active",
    question: "How does Listing active for guest work?",
    answer: "When Listing active is on, guests can see your property card and booking page. Turn it off if you want the listing hidden without deleting the property setup.",
  },
  {
    key: "booking_approval",
    question: "How does Booking approval work?",
    answer: "When Booking approval is enabled, new Famlo bookings stay pending until you approve them from dashboard notifications or the booking page. Famlo keeps the same host approval flow for guest updates.",
  },
  {
    key: "documents",
    question: "Why do I still see optional documents?",
    answer: "Core onboarding documents like ID proof, live selfie, and ownership proof stay attached from host onboarding. Optional items such as NOC, police verification, or FSSAI are only needed in specific cases.",
  },
  {
    key: "join_pro",
    question: "What do I get with Famlo Pro?",
    answer: "Famlo Pro adds PMS, OTA channel manager, rate and inventory tools, WhatsApp booking help, reporting, and guided support. Plans start from Rs 499 and then follow the current property and room pricing rules.",
  },
] as const;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const familyId = asString(url.searchParams.get("familyId"));
    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await resolveHostMobileSession(supabase, request);
    const requesterId = asString(session.host?.hostUserId) ?? familyId;
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id,host_id,host_name,subject,message,status,admin_reply,created_at,updated_at")
      .eq("host_id", requesterId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;

    return NextResponse.json({
      tickets: ((data ?? []) as SupportTicketRow[]).map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject ?? "Support request",
        message: ticket.message ?? "",
        status: ticket.status ?? "open",
        adminReply: ticket.admin_reply ?? null,
        createdAt: ticket.created_at ?? null,
        updatedAt: ticket.updated_at ?? null,
      })),
      faqs: hostSupportFaqs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load support tickets." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const familyId = asString(body.familyId);
    const category = asString(body.category) ?? "Host query";
    const message = asString(body.message);
    const bookingId = asString(body.bookingId);
    const roomId = asString(body.roomId);

    if (!familyId || !message) {
      return NextResponse.json({ error: "familyId and message are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await resolveHostMobileSession(supabase, request);
    const requesterId = asString(session.host?.hostUserId) ?? familyId;
    const hostName = asString(session.host?.displayName) ?? asString(body.hostName) ?? "Famlo host";
    const propertyName = asString(session.workspace?.selectedFamilyName) ?? "Selected property";
    const composedMessage = [
      message,
      `Family ID: ${familyId}`,
      `Property: ${propertyName}`,
      bookingId ? `Booking ID: ${bookingId}` : null,
      roomId ? `Room ID: ${roomId}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { error } = await supabase.from("support_tickets").insert({
      host_id: requesterId,
      host_name: hostName,
      subject: `[HOST] ${category}`,
      message: composedMessage,
      status: "open",
    } as never);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create support request." },
      { status: 500 }
    );
  }
}
