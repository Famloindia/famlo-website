import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

function parseStringList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumberish(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(value ?? 0);
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    hommieId?: string;
    updates?: Record<string, unknown>;
    bookingId?: string;
    bookingStatus?: "pending" | "confirmed" | "rejected";
  };

  const supabase = createAdminSupabaseClient();

  try {
    if (body.bookingId && body.bookingStatus) {
      const { error } = await supabase
        .from("hommie_booking_requests")
        .update({ status: body.bookingStatus } as never)
        .eq("id", body.bookingId);

      if (error) throw error;
    }

    if (body.hommieId && body.updates) {
      const payload = {
        host_name: typeof body.updates.host_name === "string" ? body.updates.host_name : undefined,
        email: typeof body.updates.email === "string" ? body.updates.email : undefined,
        phone: typeof body.updates.phone === "string" ? body.updates.phone : undefined,
        property_name: typeof body.updates.property_name === "string" ? body.updates.property_name : undefined,
        city: typeof body.updates.city === "string" ? body.updates.city : undefined,
        state: typeof body.updates.state === "string" ? body.updates.state : undefined,
        locality: typeof body.updates.locality === "string" ? body.updates.locality : undefined,
        address: typeof body.updates.address === "string" ? body.updates.address : undefined,
        google_maps_link:
          typeof body.updates.google_maps_link === "string" ? body.updates.google_maps_link : undefined,
        description: typeof body.updates.description === "string" ? body.updates.description : undefined,
        amenities: parseStringList(body.updates.amenities),
        images: parseStringList(body.updates.images),
        nightly_price: parseNumberish(body.updates.nightly_price),
        max_guests: parseNumberish(body.updates.max_guests),
        is_active: typeof body.updates.is_active === "boolean" ? body.updates.is_active : undefined,
        admin_notes: typeof body.updates.admin_notes === "string" ? body.updates.admin_notes : undefined
      };

      const { error } = await supabase
        .from("hommies")
        .update(payload as never)
        .eq("id", body.hommieId);

      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save hommie dashboard." },
      { status: 500 }
    );
  }
}
