import { NextRequest, NextResponse } from "next/server";

import { getErrorDiagnostics, getErrorMessage } from "@/lib/error-utils";
import { createPaymentIntentForBooking } from "@/lib/payment-intent";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { bookingId?: string; gateway?: string };
    const bookingId = String(body.bookingId ?? "").trim();
    const gateway = String(body.gateway ?? "razorpay").trim();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const result = await createPaymentIntentForBooking(supabase, { bookingId, gateway });

    return NextResponse.json({
      payment: result.payment,
      order: result.order,
      integrationStatus: result.integrationStatus,
      nextStep: result.nextStep,
    });
  } catch (error) {
    console.error("[api/payments/create-intent] failed", getErrorDiagnostics(error));
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to create payment intent.") },
      { status: 500 }
    );
  }
}
