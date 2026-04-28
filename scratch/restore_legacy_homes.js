const { createClient } = require("@supabase/supabase-js");

const SITE_URL = "https://www.famlo.in";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function sanitizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function stableHostCode(userId) {
  return `FAM-${String(userId).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function stablePassword(userId) {
  return `famlo${String(userId).replace(/-/g, "").slice(-6)}`;
}

function extractBalancedJsonObject(source, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function extractHomesFromHtml(html) {
  const homes = [];
  const sources = Array.from(
    new Set([
      html,
      html.replace(/\\"/g, '"'),
      html.replace(/\\n/g, "\n").replace(/\\"/g, '"'),
    ])
  );

  for (const source of sources) {
    const marker = '"home":{';
    let offset = 0;

    while (offset < source.length) {
      const markerIndex = source.indexOf(marker, offset);
      if (markerIndex === -1) break;

      const objectStart = markerIndex + marker.length - 1;
      const objectText = extractBalancedJsonObject(source, objectStart);
      if (!objectText) break;

      try {
        const parsed = JSON.parse(objectText);
        if (parsed && typeof parsed === "object" && typeof parsed.id === "string") {
          homes.push(parsed);
        }
      } catch (error) {
        console.warn("[extract] failed to parse home object", {
          markerIndex,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      offset = objectStart + objectText.length;
    }
  }

  return Array.from(new Map(homes.map((home) => [home.id, home])).values());
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}: ${text}`);
  }
  return text;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${url} -> non-JSON response: ${text.slice(0, 400)}`);
  }
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function ensurePublicUser(home) {
  return fetchJson(`${SITE_URL}/api/user/verification`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: home.hostUserId,
      email: null,
      name: sanitizeText(home.hostName) || sanitizeText(home.listingTitle) || sanitizeText(home.name) || "Famlo host",
      city: sanitizeText(home.city) || "Unknown",
      state: sanitizeText(home.state) || "Unknown",
      about: sanitizeText(home.description) || "Restored host profile shell for dashboard recovery.",
      dob: "1990-01-01",
      gender: "unspecified",
      avatarUrl: sanitizeText(home.hostPhotoUrl),
      idDocumentUrl: null,
      idDocumentType: null,
    }),
  });
}

function buildFamilyPayload(home) {
  const userId = String(home.hostUserId || "");
  const images = sanitizeArray(home.imageUrls);

  return {
    id: home.id,
    user_id: userId,
    host_id: stableHostCode(userId),
    host_password: stablePassword(userId),
    password: stablePassword(userId),
    name: sanitizeText(home.name) || sanitizeText(home.listingTitle) || "Famlo Home",
    village: sanitizeText(home.village),
    city: sanitizeText(home.city),
    state: sanitizeText(home.state),
    description: sanitizeText(home.description),
    about: sanitizeText(home.description),
    max_guests: typeof home.maxGuests === "number" ? home.maxGuests : null,
    is_verified: true,
    is_active: Boolean(home.isActive),
    is_accepting: Boolean(home.isAccepting),
    family_type: "cultural",
    price_morning: typeof home.priceMorning === "number" ? home.priceMorning : 0,
    price_afternoon: typeof home.priceAfternoon === "number" ? home.priceAfternoon : 0,
    price_evening: typeof home.priceEvening === "number" ? home.priceEvening : 0,
    price_fullday: typeof home.priceFullday === "number" ? home.priceFullday : 0,
    active_quarters: sanitizeArray(home.activeQuarters),
    blocked_dates: sanitizeArray(home.blockedDates),
    images,
    host_photo_url: sanitizeText(home.hostPhotoUrl) || images[0] || null,
    languages: [],
    rating: typeof home.rating === "number" ? home.rating : 5,
    total_reviews: typeof home.totalReviews === "number" ? home.totalReviews : 0,
  };
}

async function restoreFamilyRecord(supabase, home) {
  const payload = buildFamilyPayload(home);
  const { error } = await supabase.from("families").upsert(payload, { onConflict: "id" });
  if (error) {
    throw error;
  }
  return payload;
}

async function syncHostProjection(home) {
  const unitPrice =
    (typeof home.priceMorning === "number" && home.priceMorning > 0 && home.priceMorning) ||
    (typeof home.priceAfternoon === "number" && home.priceAfternoon > 0 && home.priceAfternoon) ||
    (typeof home.priceEvening === "number" && home.priceEvening > 0 && home.priceEvening) ||
    (typeof home.priceFullday === "number" && home.priceFullday > 0 && home.priceFullday) ||
    100;

  return fetchJson(`${SITE_URL}/api/bookings/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: "00000000-0000-0000-0000-000000000001",
      bookingType: "host_stay",
      legacyFamilyId: home.id,
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      quarterType: "morning",
      guestsCount: 1,
      unitPrice,
      commissionPct: 18,
    }),
  });
}

async function fetchDashboardHtml(familyId) {
  return fetchText(`${SITE_URL}/partnerslogin/home/dashboard?family=${encodeURIComponent(familyId)}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const homestaysHtml = await fetchText(`${SITE_URL}/homestays`);
  const homes = extractHomesFromHtml(homestaysHtml).filter(
    (home) => typeof home.hostUserId === "string" && typeof home.id === "string"
  );

  if (homes.length === 0) {
    throw new Error("No legacy homes found in live /homestays page.");
  }

  const before = [];
  for (const home of homes) {
    const dashboardHtml = await fetchDashboardHtml(home.id);
    before.push({
      familyId: home.id,
      name: home.name,
      dashboardMissing: dashboardHtml.includes("No Home listing found"),
    });
  }

  const uniqueUsers = Array.from(
    new Map(homes.map((home) => [home.hostUserId, home])).values()
  );

  const userResults = [];
  for (const home of uniqueUsers) {
    userResults.push({
      userId: home.hostUserId,
      result: await ensurePublicUser(home),
    });
  }

  const familyResults = [];
  for (const home of homes) {
    const payload = await restoreFamilyRecord(supabase, home);
    const quote = await syncHostProjection(home);
    const dashboardHtml = await fetchDashboardHtml(home.id);
    familyResults.push({
      familyId: home.id,
      name: home.name,
      hostUserId: home.hostUserId,
      hostCode: payload.host_id,
      dashboardMissingAfter: dashboardHtml.includes("No Home listing found"),
      dashboardHasV2HostId: dashboardHtml.includes('"v2_host_id":"'),
      quoteTotal: quote.totalPrice,
    });
  }

  console.log(
    JSON.stringify(
      {
        homesFound: homes.length,
        before,
        userResults,
        familyResults,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
});
