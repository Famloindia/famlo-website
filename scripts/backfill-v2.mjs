import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

async function fetchAll(table, select = "*") {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select(select).range(from, to);
    if (error) throw error;
    const rows = data ?? [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function isMissingRelationError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "PGRST205" || message.includes("could not find the table");
}

async function upsertChunk(table, rows, onConflict, chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
}

async function verifyV2() {
  const requiredTables = [
    "user_profiles_v2",
    "hosts",
    "host_media",
    "hommie_profiles_v2",
    "hommie_media_v2",
    "gallery_posts_v2",
    "activities_v2",
    "recent_views_v2",
    "stories_v2",
    "ads_v2",
  ];

  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      throw new Error(`Missing or inaccessible v2 table: ${table}`);
    }
  }
}

async function backfillUserProfiles() {
  const users = await fetchAll("users");
  const rows = users.map((u) => ({
    user_id: u.id,
    display_name: u.name ?? null,
    avatar_url: u.avatar_url ?? null,
    phone: u.phone ?? null,
    email: u.email ?? null,
    date_of_birth: u.date_of_birth ?? null,
    gender: u.gender ?? null,
    bio: u.about ?? null,
    home_city: u.city ?? null,
    home_state: u.state ?? null,
    created_at: u.created_at ?? new Date().toISOString(),
    updated_at: u.updated_at ?? new Date().toISOString(),
  }));
  await upsertChunk("user_profiles_v2", rows, "user_id");
  console.log(`Backfilled user_profiles_v2: ${rows.length}`);
}

async function backfillHosts() {
  const families = await fetchAll("families");
  const rows = families
    .filter((f) => f.user_id)
    .map((f) => ({
      user_id: f.user_id,
      legacy_family_id: f.id,
      status: f.is_active ? "published" : "draft",
      display_name: f.name || "Famlo Host",
      city: f.city ?? null,
      state: f.state ?? null,
      locality: f.village ?? null,
      address_private: f.street_address ?? null,
      lat: f.lat ?? null,
      lng: f.lng ?? null,
      about: f.about ?? f.description ?? null,
      family_story: f.about_story ?? null,
      family_composition: f.family_composition ?? null,
      languages: f.languages_spoken ?? f.languages ?? [],
      amenities: f.amenities ?? [],
      house_rules: f.house_rules ?? [],
      bathroom_type: f.bathroom_type ?? null,
      common_areas: f.common_areas ?? [],
      max_guests: f.max_guests ?? 1,
      price_morning: f.price_morning ?? 0,
      price_afternoon: f.price_afternoon ?? 0,
      price_evening: f.price_evening ?? 0,
      price_fullday: f.price_fullday ?? 0,
      blocked_dates: f.blocked_dates ?? [],
      active_quarters: f.active_quarters ?? [],
      platform_commission_pct: f.platform_commission_pct ?? 18,
      host_discount_pct: f.host_discount_pct ?? 0,
      upi_id: f.upi_id ?? null,
      bank_account_holder_name: f.bank_account_holder_name ?? null,
      bank_account_number: f.bank_account_number ?? null,
      ifsc_code: f.ifsc_code ?? null,
      bank_name: f.bank_name ?? null,
      compliance_status: f.compliance_status ?? "pending",
      is_featured: Boolean(f.superhost),
      is_accepting: Boolean(f.is_accepting),
      published_at: f.is_active ? f.updated_at ?? f.created_at ?? new Date().toISOString() : null,
      created_at: f.created_at ?? new Date().toISOString(),
      updated_at: f.updated_at ?? new Date().toISOString(),
    }));
  await upsertChunk("hosts", rows, "legacy_family_id");
  console.log(`Backfilled hosts: ${rows.length}`);
}

async function backfillHostMedia() {
  const hosts = await fetchAll("hosts", "id,legacy_family_id");
  const hostByLegacy = new Map(hosts.filter((h) => h.legacy_family_id).map((h) => [h.legacy_family_id, h.id]));
  const photos = await fetchAll("family_photos");
  const rows = photos
    .filter((p) => p.family_id && hostByLegacy.has(p.family_id))
    .map((p) => ({
      host_id: hostByLegacy.get(p.family_id),
      storage_provider: "legacy",
      media_url: p.url,
      media_type: "image",
      is_primary: Boolean(p.is_primary),
      sort_order: 0,
      created_at: p.created_at ?? new Date().toISOString(),
    }));
  await upsertChunk("host_media", rows, "host_id,media_url");
  console.log(`Backfilled host_media: ${rows.length}`);
}

async function backfillHommiesFromCityGuides() {
  const guides = await fetchAll("city_guides");
  const rows = guides
    .filter((g) => g.user_id)
    .map((g) => ({
      user_id: g.user_id,
      legacy_city_guide_id: g.id,
      status: g.is_active ? "published" : "draft",
      display_name: g.name || "Famlo Hommie",
      city: g.city ?? null,
      state: g.state ?? null,
      locality: g.neighbourhood ?? null,
      bio: g.bio ?? null,
      languages: g.languages ?? [],
      interests: g.activities ?? [],
      service_tags: g.activities ?? [],
      vehicle_type: g.vehicle_type ?? null,
      vehicle_rate: g.vehicle_rate ?? 0,
      hourly_price: g.price_hour ?? 0,
      nightly_price: g.price_half_day ?? 0,
      max_guests: 1,
      is_available: g.is_available ?? true,
      platform_commission_pct: g.platform_commission_pct ?? 18,
      host_discount_pct: g.host_discount_pct ?? 0,
      published_at: g.is_active ? g.updated_at ?? g.created_at ?? new Date().toISOString() : null,
      created_at: g.created_at ?? new Date().toISOString(),
      updated_at: g.updated_at ?? new Date().toISOString(),
    }));
  await upsertChunk("hommie_profiles_v2", rows, "legacy_city_guide_id");
  console.log(`Backfilled hommie_profiles_v2 from city_guides: ${rows.length}`);
}

async function backfillHommiesFromLegacyHommies() {
  const hommies = await fetchAll("hommies");
  const rows = hommies
    .filter((h) => h.host_user_id)
    .map((h) => ({
      user_id: h.host_user_id,
      legacy_hommie_id: h.id,
      status: h.is_active && h.is_approved ? "published" : "draft",
      display_name: h.host_name || h.property_name || "Famlo Hommie",
      slug: h.slug ?? null,
      city: h.city ?? null,
      state: h.state ?? null,
      locality: h.locality ?? null,
      address_private: h.address ?? null,
      lat: h.latitude ?? null,
      lng: h.longitude ?? null,
      bio: h.description ?? null,
      service_tags: h.amenities ?? [],
      hourly_price: 0,
      nightly_price: h.nightly_price ?? 0,
      max_guests: h.max_guests ?? 1,
      is_available: h.is_active ?? true,
      platform_commission_pct: h.platform_commission_pct ?? 18,
      host_discount_pct: h.host_discount_pct ?? 0,
      published_at: h.is_active && h.is_approved ? h.updated_at ?? h.created_at ?? new Date().toISOString() : null,
      created_at: h.created_at ?? new Date().toISOString(),
      updated_at: h.updated_at ?? new Date().toISOString(),
    }));
  await upsertChunk("hommie_profiles_v2", rows, "legacy_hommie_id");
  console.log(`Backfilled hommie_profiles_v2 from hommies: ${rows.length}`);
}

async function backfillHommieMedia() {
  const profiles = await fetchAll("hommie_profiles_v2", "id,legacy_city_guide_id");
  const profileByGuide = new Map(profiles.filter((p) => p.legacy_city_guide_id).map((p) => [p.legacy_city_guide_id, p.id]));
  const guides = await fetchAll("city_guides", "id,avatar_url");
  const rows = guides
    .filter((g) => g.avatar_url && profileByGuide.has(g.id))
    .map((g) => ({
      hommie_id: profileByGuide.get(g.id),
      storage_provider: "legacy",
      media_url: g.avatar_url,
      media_type: "image",
      is_primary: true,
      sort_order: 0,
      created_at: new Date().toISOString(),
    }));
  await upsertChunk("hommie_media_v2", rows, "hommie_id,media_url");
  console.log(`Backfilled hommie_media_v2: ${rows.length}`);
}

async function backfillGalleryPosts() {
  const profiles = await fetchAll("hommie_profiles_v2", "id,user_id,legacy_city_guide_id");
  const profileByGuide = new Map(profiles.filter((p) => p.legacy_city_guide_id).map((p) => [p.legacy_city_guide_id, p]));
  const guides = await fetchAll("city_guides", "id,guide_id");
  const guideUuidByCode = new Map(guides.filter((g) => g.guide_id).map((g) => [g.guide_id, g.id]));
  const posts = await fetchAll("guide_posts");
  const rows = posts
    .map((p) => {
      const guideUuid = guideUuidByCode.get(p.guide_id);
      const profile = guideUuid ? profileByGuide.get(guideUuid) : null;
      if (!profile) return null;
      return {
        owner_type: "hommie",
        owner_profile_id: profile.id,
        owner_user_id: profile.user_id,
        storage_provider: "legacy",
        media_url: p.url,
        caption: p.caption ?? null,
        visibility: "public",
        created_at: p.created_at ?? new Date().toISOString(),
      };
    })
    .filter(Boolean);
  await upsertChunk("gallery_posts_v2", rows, "owner_type,owner_profile_id,media_url");
  console.log(`Backfilled gallery_posts_v2: ${rows.length}`);
}

async function backfillActivities() {
  const profiles = await fetchAll("hommie_profiles_v2", "id,legacy_city_guide_id");
  const profileByGuide = new Map(profiles.filter((p) => p.legacy_city_guide_id).map((p) => [p.legacy_city_guide_id, p.id]));
  const guides = await fetchAll("city_guides", "id,guide_id");
  const guideUuidByCode = new Map(guides.filter((g) => g.guide_id).map((g) => [g.guide_id, g.id]));
  const activities = await fetchAll("activities");
  const rows = activities
    .map((a) => {
      const guideUuid = guideUuidByCode.get(a.friend_id);
      const hommieId = guideUuid ? profileByGuide.get(guideUuid) : null;
      if (!hommieId) return null;
      return {
        hommie_id: hommieId,
        legacy_activity_id: a.id,
        title: a.title,
        activity_type: a.type ?? "custom",
        description: a.description ?? null,
        city: a.city ?? null,
        price: asNumber(a.price, 0),
        duration_minutes: a.duration_minutes ?? 60,
        available_time: a.available_time ?? null,
        image_url: a.image_url ?? null,
        capacity: a.capacity ?? a.max_guests ?? 1,
        status: a.is_published ? "published" : a.status ?? "draft",
        starts_at: a.starts_at ?? null,
        ends_at: a.ends_at ?? null,
        created_at: a.created_at ?? new Date().toISOString(),
        updated_at: a.created_at ?? new Date().toISOString(),
      };
    })
    .filter(Boolean);
  await upsertChunk("activities_v2", rows, "legacy_activity_id");
  console.log(`Backfilled activities_v2: ${rows.length}`);
}

async function backfillRecentViews() {
  const hosts = await fetchAll("hosts", "id,legacy_family_id");
  const hostByLegacy = new Map(hosts.filter((h) => h.legacy_family_id).map((h) => [h.legacy_family_id, h.id]));
  const activities = await fetchAll("activities_v2", "id,legacy_activity_id");
  const activityByLegacy = new Map(activities.filter((a) => a.legacy_activity_id).map((a) => [a.legacy_activity_id, a.id]));
  const recent = await fetchAll("recently_viewed");
  const rows = recent
    .map((r) => {
      const hostId = r.family_id ? hostByLegacy.get(r.family_id) : null;
      const activityId = r.activity_id ? activityByLegacy.get(r.activity_id) : null;
      const entityType = hostId ? "host" : activityId ? "activity" : null;
      const entityId = hostId ?? activityId;
      if (!entityType || !entityId) return null;
      return {
        user_id: r.user_id,
        entity_type: entityType,
        entity_id: entityId,
        viewed_at: r.viewed_at ?? new Date().toISOString(),
      };
    })
    .filter(Boolean);
  await upsertChunk("recent_views_v2", rows, "user_id,entity_type,entity_id");
  console.log(`Backfilled recent_views_v2: ${rows.length}`);
}

async function backfillStories() {
  let stories;
  try {
    stories = await fetchAll("trip_stories");
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.log("Skipped stories_v2 backfill: legacy trip_stories table is unavailable via REST.");
      return;
    }
    throw error;
  }
  const rows = stories.map((s) => ({
    author_name: s.author_name ?? null,
    city: s.from_city ?? null,
    title: s.author_name || "Famlo Story",
    body: s.story_text ?? null,
    cover_image_url: null,
    is_published: Boolean(s.is_published),
    created_at: s.created_at ?? new Date().toISOString(),
    updated_at: s.created_at ?? new Date().toISOString(),
  }));
  await upsertChunk("stories_v2", rows, "author_name,title,created_at");
  console.log(`Backfilled stories_v2: ${rows.length}`);
}

async function backfillAds() {
  let ads;
  try {
    ads = await fetchAll("famlo_ads");
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.log("Skipped ads_v2 backfill: legacy famlo_ads table is unavailable via REST.");
      return;
    }
    throw error;
  }
  const rows = ads.map((a) => ({
    label: a.label ?? null,
    title: a.title,
    description: a.description ?? null,
    image_url: a.image_url ?? null,
    cta_text: a.cta_text ?? null,
    cta_url: a.cta_url ?? null,
    priority: a.priority ?? 0,
    is_active: Boolean(a.is_active),
    created_at: new Date().toISOString(),
  }));
  await upsertChunk("ads_v2", rows, "title,cta_url");
  console.log(`Backfilled ads_v2: ${rows.length}`);
}

async function backfillBookings() {
  const hosts = await fetchAll("hosts", "id,legacy_family_id");
  const hostByLegacyFamily = new Map(
    hosts.filter((h) => h.legacy_family_id).map((h) => [h.legacy_family_id, h.id])
  );

  const hommies = await fetchAll("hommie_profiles_v2", "id,legacy_city_guide_id,legacy_hommie_id");
  const hommieByGuideId = new Map(
    hommies.filter((h) => h.legacy_city_guide_id).map((h) => [h.legacy_city_guide_id, h.id])
  );

  const activities = await fetchAll("activities_v2", "id,legacy_activity_id");
  const activityByLegacy = new Map(
    activities.filter((a) => a.legacy_activity_id).map((a) => [a.legacy_activity_id, a.id])
  );

  const bookings = await fetchAll("bookings");
  const rows = bookings
    .map((b) => {
      const hostId = b.family_id ? hostByLegacyFamily.get(b.family_id) : null;
      const hommieId = b.guide_id ? hommieByGuideId.get(b.guide_id) : null;
      const activityId = b.activity_id ? activityByLegacy.get(b.activity_id) : null;

      const bookingType = hostId ? "host_stay" : hommieId ? "hommie_session" : null;
      const recipientType = hostId ? "host" : hommieId ? "hommie" : null;
      const recipientId = hostId ?? hommieId ?? null;
      const productType = activityId ? "activity" : hostId ? "host_listing" : hommieId ? "hommie_listing" : null;
      const productId = activityId ?? hostId ?? hommieId ?? null;

      if (!bookingType || !recipientType || !recipientId || !productType || !productId) {
        return null;
      }

      const paymentStatus =
        b.status === "confirmed" || b.status === "completed"
          ? "paid"
          : b.status === "cancelled"
            ? "refunded"
            : "pending";

      return {
        legacy_booking_id: b.id,
        user_id: b.user_id,
        booking_type: bookingType,
        recipient_type: recipientType,
        recipient_id: recipientId,
        product_type: productType,
        product_id: productId,
        host_id: hostId,
        hommie_id: hommieId,
        activity_id: activityId,
        status: b.status ?? "pending",
        start_date: b.date_from ?? null,
        end_date: b.date_to ?? null,
        quarter_type: b.quarter_type ?? null,
        quarter_time: b.quarter_time ?? null,
        guests_count: b.guests_count ?? 1,
        extra_guests: b.extra_guests ?? null,
        notes: b.vibe ?? null,
        pricing_snapshot: {
          base_price: b.base_price ?? null,
          gst_amount: b.gst_amount ?? null,
          platform_fee: b.platform_fee ?? null,
          family_payout: b.family_payout ?? null,
          total_price: b.total_price ?? null,
        },
        total_price: b.total_price ?? 0,
        partner_payout_amount: b.family_payout ?? 0,
        payment_status: paymentStatus,
        conversation_id: b.conversation_id ?? null,
        created_at: b.created_at ?? new Date().toISOString(),
        updated_at: b.updated_at ?? b.created_at ?? new Date().toISOString(),
      };
    })
    .filter(Boolean);

  await upsertChunk("bookings_v2", rows, "legacy_booking_id");
  console.log(`Backfilled bookings_v2: ${rows.length}`);
}

async function main() {
  await verifyV2();
  await backfillUserProfiles();
  await backfillHosts();
  await backfillHostMedia();
  await backfillHommiesFromCityGuides();
  await backfillHommiesFromLegacyHommies();
  await backfillHommieMedia();
  await backfillGalleryPosts();
  await backfillActivities();
  await backfillRecentViews();
  await backfillStories();
  await backfillAds();
  await backfillBookings();
  console.log("Backfill complete.");
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
