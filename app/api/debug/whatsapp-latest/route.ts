import { NextRequest, NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const query = request.nextUrl.searchParams.get("secret");
  return Boolean(secret && query === secret);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();

    const [notificationRowsResult, actionRowsResult, bookingRowsResult] = await Promise.all([
      supabase
        .from("notification_queue")
        .select(
          "id,event_type,channel,status,user_id,booking_id,recipient_role,recipient_phone,template_name,payload,provider_message_id,processed_at,error_message,created_at"
        )
        .eq("channel", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("booking_whatsapp_actions")
        .select(
          "id,booking_id,host_phone,action_token,status,approve_payload,reject_payload,whatsapp_message_id,responded_whatsapp_message_id,expires_at,responded_at,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("bookings_v2")
        .select("id,host_id,legacy_booking_id,status,payment_status,updated_at,created_at")
        .eq("status", "pending_host_approval")
        .order("updated_at", { ascending: false })
        .limit(5),
    ]);

    if (notificationRowsResult.error) {
      throw notificationRowsResult.error;
    }
    if (actionRowsResult.error) {
      throw actionRowsResult.error;
    }
    if (bookingRowsResult.error) {
      throw bookingRowsResult.error;
    }

    return NextResponse.json({
      env: {
        whatsappEnabled: String(process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS ?? "").trim().toLowerCase() === "true",
        apiKeyPresent: Boolean(process.env.WHATSAPP_API_KEY?.trim()),
        apiUrlPresent: Boolean(process.env.WHATSAPP_API_URL?.trim()),
        phoneNumberIdPresent: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
        verifyTokenPresent: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()),
        cronSecretPresent: Boolean(process.env.CRON_SECRET?.trim()),
      },
      latestWhatsAppNotifications: notificationRowsResult.data ?? [],
      latestBookingWhatsAppActions: actionRowsResult.data ?? [],
      latestPendingHostApprovalBookings: bookingRowsResult.data ?? [],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load WhatsApp debug data." },
      { status: 500 }
    );
  }
}
