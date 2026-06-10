import { createAdminSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {};

  try {
    const supabase = createAdminSupabaseClient();

    // Check families - full error details
    const familiesAll = await supabase
      .from("families")
      .select("id, name, is_active, images")
      .limit(5);
    results.families = {
      count: familiesAll.data?.length ?? 0,
      rows: familiesAll.data,
      error: familiesAll.error ? { message: familiesAll.error.message, code: familiesAll.error.code, details: familiesAll.error.details } : null
    };

    // Check family_photos - do any rows exist at all?
    const photosAll = await supabase
      .from("family_photos")
      .select("family_id, url")
      .limit(5);
    results.family_photos = {
      count: photosAll.data?.length ?? 0,
      rows: photosAll.data,
      error: photosAll.error ? { message: photosAll.error.message, code: photosAll.error.code } : null
    };

    // Check drafts - look for images field
    const drafts = await supabase
      .from("host_onboarding_drafts")
      .select("id, primary_host_name, listing_status, family_id, images")
      .limit(5);
    results.host_onboarding_drafts = {
      count: drafts.data?.length ?? 0,
      rows: drafts.data,
      error: drafts.error ? { message: drafts.error.message, code: drafts.error.code } : null
    };

    const stayUnits = await supabase
      .from("stay_units_v2")
      .select("id, host_id, legacy_family_id, unit_key, name, unit_type, price_morning, price_afternoon, price_evening, price_fullday, is_active, photos")
      .limit(5);
    results.stay_units_v2 = {
      count: stayUnits.data?.length ?? 0,
      rows: stayUnits.data,
      error: stayUnits.error ? { message: stayUnits.error.message, code: stayUnits.error.code, details: stayUnits.error.details } : null
    };

  } catch (err) {
    results.fatal = String(err);
  }

  return NextResponse.json(results);
}
