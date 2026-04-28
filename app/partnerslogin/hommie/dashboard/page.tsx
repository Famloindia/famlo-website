import Link from "next/link";

import { HommieDashboardEditor } from "@/components/partners/HommieDashboardEditor";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface HommieDashboardPageProps {
  searchParams?: Promise<{
    slug?: string;
  }>;
}

export const dynamic = "force-dynamic";

function mapV2HommieToEditorRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(row.id),
    host_name: typeof row.display_name === "string" ? row.display_name : "",
    email: typeof row.email === "string" ? row.email : "",
    phone: typeof row.phone === "string" ? row.phone : "",
    city: typeof row.city === "string" ? row.city : "",
    state: typeof row.state === "string" ? row.state : "",
    locality: typeof row.locality === "string" ? row.locality : "",
    is_active: typeof row.status === "string" ? row.status === "published" : true,
    property_name: typeof row.display_name === "string" ? row.display_name : "",
    description: typeof row.bio === "string" ? row.bio : "",
    amenities: Array.isArray(row.service_tags) ? row.service_tags : [],
    images: Array.isArray(row.hommie_media_v2)
      ? (row.hommie_media_v2 as Array<Record<string, unknown>>)
          .map((item) => (typeof item.media_url === "string" ? item.media_url : ""))
          .filter(Boolean)
      : [],
    nightly_price:
      typeof row.nightly_price === "number"
        ? row.nightly_price
        : typeof row.hourly_price === "number"
          ? row.hourly_price
          : 0,
    max_guests: typeof row.max_guests === "number" ? row.max_guests : 1,
    admin_notes: "",
  };
}

function mapV2BookingRow(row: Record<string, unknown>): Record<string, unknown> {
  const pricing = (row.pricing_snapshot as Record<string, unknown> | null) ?? {};
  return {
    id: row.id,
    status: row.status,
    date_from: row.start_date,
    date_to: row.end_date,
    guests_count: row.guests_count,
    total_price: row.total_price,
    base_price: pricing.base_price ?? pricing.unit_price ?? null,
    platform_fee: pricing.platform_fee ?? null,
    gst_amount: pricing.tax_amount ?? pricing.gst_amount ?? null,
    created_at: row.created_at,
    user_id: row.user_id,
    vibe: row.notes,
    quarter_type: row.quarter_type,
    quarter_time: row.quarter_time,
  };
}

export default async function HommieDashboardPage({
  searchParams
}: Readonly<HommieDashboardPageProps>): Promise<React.JSX.Element> {
  const params = await searchParams;
  const supabase = createAdminSupabaseClient();
  const slug = params?.slug ?? "";

  const { data: v2Hommie } = slug
    ? await supabase
        .from("hommie_profiles_v2")
        .select("*, hommie_media_v2(media_url, is_primary)")
        .or(`slug.eq.${slug},legacy_hommie_id.eq.${slug},id.eq.${slug}`)
        .eq("status", "published")
        .maybeSingle()
    : { data: null };

  const hommieRow = v2Hommie ? mapV2HommieToEditorRow(v2Hommie as Record<string, unknown>) : null;
  const v2HommieId =
    v2Hommie && typeof (v2Hommie as Record<string, unknown>).id === "string"
      ? String((v2Hommie as Record<string, unknown>).id)
      : null;

  const { data: bookingRowsV2 } =
    v2HommieId
      ? await supabase
          .from("bookings_v2")
          .select("id,status,start_date,end_date,guests_count,total_price,pricing_snapshot,created_at,user_id,notes,quarter_type,quarter_time")
          .eq("hommie_id", v2HommieId)
          .order("created_at", { ascending: false })
      : { data: [] };
  const bookingRows = (bookingRowsV2 ?? []) as Array<Record<string, unknown>>;
  const mappedBookingRows = bookingRows.map(mapV2BookingRow);

  return (
    <main className="shell">
      <section className="panel dashboard-shell">
        <div className="dashboard-header">
          <div>
            <span className="eyebrow">Hommie dashboard</span>
            <h1>Famlo hommie dashboard</h1>
            <p>
              This dashboard now loads the real v2 hommie profile first and reads shared bookings
              from <code>bookings_v2</code>.
            </p>
          </div>
          <div className="dashboard-links">
            <Link href="/">Public homepage</Link>
            <Link href="/partners/login">Back to login</Link>
          </div>
        </div>

        {!hommieRow ? (
          <div className="panel detail-box">
            <h2>No hommie listing found</h2>
            <p>Log in with an approved hommie partner email to load the connected dashboard.</p>
          </div>
        ) : (
          <HommieDashboardEditor
            bookingRows={mappedBookingRows}
            hommie={hommieRow}
          />
        )}
      </section>
    </main>
  );
}
