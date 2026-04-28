import Link from "next/link";
import { notFound } from "next/navigation";

import { loadFamilyStories, loadLikedGuestCounts } from "@/lib/home-social-proof";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface HostPreviewPageProps {
  params: Promise<{ id: string }>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default async function HostListingPreviewPage({
  params,
}: Readonly<HostPreviewPageProps>): Promise<React.JSX.Element> {
  const { id } = await params;
  const supabase = createAdminSupabaseClient();

  const { data: family, error } = await supabase
    .from("families")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="shell">
        <section className="panel detail-box">
          <h1>Preview unavailable</h1>
          <p>{error.message}</p>
        </section>
      </main>
    );
  }

  if (!family) {
    notFound();
  }

  const { data: photos } = await supabase
    .from("family_photos")
    .select("url,is_primary,created_at")
    .eq("family_id", id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const imageUrls = (photos ?? []).map((photo) => asString(photo.url)).filter(Boolean);
  const [stories, likedCountMap] = await Promise.all([loadFamilyStories(id, 4), loadLikedGuestCounts([id])]);
  const meta = parseHostListingMeta(asString(family.admin_notes) || null);

  const hostName =
    meta.hostDisplayName ||
    asString(family.primary_host_name) ||
    asString(family.host_name) ||
    asString(family.name) ||
    "Famlo host";
  const title = meta.listingTitle || asString(family.name) || "Famlo Home";
  const publicLocation = [asString(family.city), asString(family.state)].filter(Boolean).join(", ");
  const hostPhotoUrl = asString(family.host_photo_url) || meta.hostSelfieUrl || "";
  const foodType = meta.foodType || asString(family.food_type) || "";
  const statusText = family.is_active
    ? family.is_accepting
      ? "Open to guests"
      : "Visible but closed"
    : "Hidden from guests";
  const likedCount = likedCountMap.get(id) ?? 0;

  return (
    <main className="shell" style={{ maxWidth: 1320 }}>
      <section className="panel detail-page" style={{ padding: 0, overflow: "hidden" }}>
        <div className="detail-topbar home-detail-topbar" style={{ padding: "20px 24px 0", justifyContent: "space-between" }}>
          <Link className="button-like secondary home-detail-back-btn" href="/partnerslogin/home/dashboard">
            Back to dashboard
          </Link>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 999,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              fontWeight: 800,
            }}
          >
            Preview only
          </div>
        </div>

        <div
          className="home-detail-hero"
          style={{
            position: "relative",
            minHeight: 420,
            background: imageUrls[0]
              ? `linear-gradient(180deg, rgba(15,23,42,0.18), rgba(15,23,42,0.76)), url(${imageUrls[0]}) center/cover`
              : "linear-gradient(135deg, #dbeafe, #eff6ff)"
          }}
        >
          <div style={{ position: "absolute", inset: 0, padding: "32px 24px", display: "flex", alignItems: "end" }}>
            <div style={{ maxWidth: 760 }}>
              <div className="home-detail-kicker-row">
                <span className="home-detail-kicker">{asString(family.city) || "Famlo home"} stay</span>
                <span className="home-detail-kicker home-detail-kicker-soft">{statusText}</span>
              </div>
              <h1 style={{ color: "white", fontSize: "56px", lineHeight: 1.04, margin: "18px 0 12px" }}>{title}</h1>
              <p style={{ color: "rgba(255,255,255,0.88)", fontSize: "18px", margin: 0, maxWidth: 640 }}>
                This is the host preview page. Guests cannot book from here, but you can review exactly how your listing content reads right now.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.85fr)", gap: 28, padding: "28px 24px 32px" }}>
          <div style={{ display: "grid", gap: 24 }}>
            <section className="panel detail-box">
              <div className="home-detail-host-strip">
                {hostPhotoUrl ? (
                  <img src={hostPhotoUrl} alt={hostName} className="home-detail-host-avatar" />
                ) : (
                  <div className="home-detail-host-avatar home-detail-host-avatar-fallback">{hostName.charAt(0)}</div>
                )}
                <div>
                  <h2 style={{ margin: 0 }}>{hostName}</h2>
                  <p style={{ margin: "4px 0 0", color: "#475569", fontWeight: 600 }}>{publicLocation || "Location hidden"}</p>
                </div>
              </div>

              <div className="detail-highlight-row" style={{ marginTop: 24 }}>
                <div className="detail-highlight">
                  <strong>{likedCount}</strong>
                  <span>Liked by guests</span>
                </div>
                <div className="detail-highlight">
                  <strong>{asNumber(family.max_guests) || 1}</strong>
                  <span>Guests allowed</span>
                </div>
                <div className="detail-highlight">
                  <strong>{stories.length}</strong>
                  <span>Stories shared</span>
                </div>
              </div>
            </section>

            <section className="panel detail-box">
              <h2>Host bio</h2>
              <p style={{ marginBottom: 0 }}>{asString(family.about) || asString(family.description) || "Add your story from the dashboard profile tab."}</p>
            </section>

            <section className="panel detail-box">
              <h2>Host profile cards</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {[
                  { title: "Tagline", body: meta.hostCatchphrase || "A warm host profile and local stay experience." },
                  { title: "Hobbies & interests", body: meta.hostHobbies || "Shared by the host in the partner dashboard." },
                  { title: "Food offering", body: foodType || "Veg, non-veg, and protein+ options appear here." },
                ].map((card) => (
                  <div key={card.title} style={{ padding: "16px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <strong style={{ display: "block", marginBottom: 6 }}>{card.title}</strong>
                    <p style={{ margin: 0, color: "#475569" }}>{card.body}</p>
                  </div>
                ))}
              </div>
            </section>

            {imageUrls.length > 0 ? (
              <section className="panel detail-box">
                <h2>Listing gallery</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                  {imageUrls.map((url, index) => (
                    <div key={`${url}-${index}`} style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #dbeafe", background: "#eff6ff" }}>
                      <img src={url} alt={`Preview ${index + 1}`} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="detail-columns">
              <section className="panel detail-box">
                <h2>Amenities</h2>
                <ul>{(meta.amenities?.length ? meta.amenities : ["Add amenities from Profile"]).map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
              <section className="panel detail-box">
                <h2>Home setup</h2>
                <ul>
                  <li>Bathroom type: {meta.bathroomType || asString(family.bathroom_type) || "Not added yet"}</li>
                  <li>Common area access: {(meta.commonAreas?.length ? meta.commonAreas : asArray(family.common_areas)).join(", ") || "Not added yet"}</li>
                </ul>
              </section>
            </div>
          </div>

          <aside style={{ display: "grid", gap: 20, alignContent: "start" }}>
            <section className="panel detail-box">
              <span className="eyebrow">Host preview</span>
              <h2 style={{ marginTop: 8 }}>Booking disabled here</h2>
              <p style={{ color: "#475569", marginBottom: 0 }}>
                This page is for the home host only. Review the listing, then go back to your dashboard profile to change photos, bio, pricing, or status.
              </p>
            </section>

            <section className="panel detail-box">
              <h2>Current listing state</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <div className="booking-summary-row"><span>Visibility</span><strong>{family.is_active ? "Visible" : "Hidden"}</strong></div>
                <div className="booking-summary-row"><span>Guest access</span><strong>{family.is_accepting ? "Open" : "Closed"}</strong></div>
                <div className="booking-summary-row"><span>Location shown</span><strong>{publicLocation || "Pending"}</strong></div>
              </div>
            </section>

            <section className="panel detail-box">
              <h2>Pricing snapshot</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <div className="booking-summary-row"><span>Morning</span><strong>{asNumber(family.price_morning) ? `₹${asNumber(family.price_morning)}` : "Not set"}</strong></div>
                <div className="booking-summary-row"><span>Afternoon</span><strong>{asNumber(family.price_afternoon) ? `₹${asNumber(family.price_afternoon)}` : "Not set"}</strong></div>
                <div className="booking-summary-row"><span>Evening</span><strong>{asNumber(family.price_evening) ? `₹${asNumber(family.price_evening)}` : "Not set"}</strong></div>
                <div className="booking-summary-row"><span>Full day</span><strong>{asNumber(family.price_fullday) ? `₹${asNumber(family.price_fullday)}` : "Not set"}</strong></div>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
