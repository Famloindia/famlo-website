import { NextResponse } from "next/server";

import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const {
      userId,
      userName,
      userEmail,
      userPhone,
      userGender,
      bookingId,
      subject,
      message,
      emergency,
      location,
      policeStationUrl,
      hospitalUrl,
      liveLocationEndsAt,
    } = (await request.json()) as Record<string, unknown>;

    if (typeof subject !== "string" || typeof message !== "string") {
      return NextResponse.json({ error: "Missing support request details." }, { status: 400 });
    }

    const locationText =
      location && typeof location === "object"
        ? (() => {
            const row = location as Record<string, unknown>;
            const lat = typeof row.lat === "number" ? row.lat : null;
            const lng = typeof row.lng === "number" ? row.lng : null;
            if (lat === null || lng === null) return "";
            return `\n\nLocation shared by guest:\nLatitude: ${lat}\nLongitude: ${lng}\nMaps: https://maps.google.com/?q=${lat},${lng}`;
          })()
        : "";

    const bookingText = typeof bookingId === "string" && bookingId.length > 0 ? `\nBooking ID: ${bookingId}` : "";
    const phoneText = typeof userPhone === "string" && userPhone.length > 0 ? `\nPhone: ${userPhone}` : "";
    const genderText = typeof userGender === "string" && userGender.length > 0 ? `\nGender: ${userGender}` : "";
    const severityPrefix = emergency === true ? "[EMERGENCY]" : "[SUPPORT]";
    const liveLocationText =
      typeof liveLocationEndsAt === "string" && liveLocationEndsAt.length > 0
        ? `\nLive location active until: ${liveLocationEndsAt}`
        : "";
    const policeText = typeof policeStationUrl === "string" && policeStationUrl.length > 0 ? `\nNearest police station: ${policeStationUrl}` : "";
    const hospitalText = typeof hospitalUrl === "string" && hospitalUrl.length > 0 ? `\nNearest hospital: ${hospitalUrl}` : "";

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (typeof userId === "string" && userId.trim().length > 0 && userId !== authUser.id) {
      return NextResponse.json({ error: "You can only create support requests for your own account." }, { status: 403 });
    }

    const cleanBookingId = typeof bookingId === "string" && bookingId.trim().length > 0 ? bookingId.trim() : null;
    if (cleanBookingId) {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings_v2")
        .select("id,user_id")
        .or(`id.eq.${cleanBookingId},legacy_booking_id.eq.${cleanBookingId}`)
        .maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking || booking.user_id !== authUser.id) {
        return NextResponse.json({ error: "You can only create support requests for your own booking." }, { status: 403 });
      }
    }

    const effectiveUserName =
      typeof userName === "string" && userName.trim().length > 0
        ? userName.trim()
        : authUser.email ?? "Famlo guest";
    const effectiveUserEmail =
      typeof userEmail === "string" && userEmail.trim().length > 0 ? userEmail.trim() : authUser.email ?? "";
    const emailText = effectiveUserEmail.length > 0 ? `\nEmail: ${effectiveUserEmail}` : "";
    const { error } = await supabase.from("support_tickets").insert({
      host_id: authUser.id,
      host_name: effectiveUserName,
      subject: `${severityPrefix} ${subject.trim()}`,
      message: `${message.trim()}${bookingText}${emailText}${phoneText}${genderText}${locationText}${liveLocationText}${policeText}${hospitalText}`,
      status: "open",
    } as never);

    if (error) throw error;

    if (emergency === true) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 24px; line-height: 1.7; color: #0f172a;">
          <h2 style="margin: 0 0 12px; color: #b91c1c;">Famlo Emergency Alert</h2>
          <p><strong>Guest:</strong> ${effectiveUserName}</p>
          ${effectiveUserEmail.length > 0 ? `<p><strong>Email:</strong> ${effectiveUserEmail}</p>` : ""}
          ${typeof userPhone === "string" && userPhone.length > 0 ? `<p><strong>Phone:</strong> ${userPhone}</p>` : ""}
          ${typeof userGender === "string" && userGender.length > 0 ? `<p><strong>Gender:</strong> ${userGender}</p>` : ""}
          <p><strong>Subject:</strong> ${subject.trim()}</p>
          <p><strong>Booking:</strong> ${typeof bookingId === "string" ? bookingId : "N/A"}</p>
          <p><strong>Message:</strong><br />${message.trim()}</p>
          ${locationText ? `<pre style="padding: 16px; background: #f8fafc; border-radius: 12px; white-space: pre-wrap;">${locationText}</pre>` : ""}
          ${typeof liveLocationEndsAt === "string" && liveLocationEndsAt.length > 0 ? `<p><strong>Live location active until:</strong> ${liveLocationEndsAt}</p>` : ""}
          ${typeof policeStationUrl === "string" && policeStationUrl.length > 0 ? `<p><strong>Nearest police station:</strong> <a href="${policeStationUrl}">${policeStationUrl}</a></p>` : ""}
          ${typeof hospitalUrl === "string" && hospitalUrl.length > 0 ? `<p><strong>Nearest hospital:</strong> <a href="${hospitalUrl}">${hospitalUrl}</a></p>` : ""}
          <p style="margin-top: 20px; color: #64748b;">This alert was created from the guest message screen and should be handled immediately.</p>
        </div>
      `;

      const recipients = ["support@famlo.in", "admin@famlo.in", "aryan@famlo.in"];
      await Promise.allSettled(
        recipients.map((to) =>
          sendEmail({
            to,
            subject: `Famlo Emergency Alert - ${effectiveUserName}`,
            html: emailHtml,
          })
        )
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Guest support request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create support request." },
      { status: 500 }
    );
  }
}
