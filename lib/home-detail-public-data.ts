import { unstable_cache } from "next/cache";

import { addIndiaDays, getTodayInIndia } from "@/lib/booking-time";
import { loadHostStayBookingRecordsCompatibility } from "@/lib/booking-compat";
import { getCalendarEventStayUnitId, loadCanonicalCalendar } from "@/lib/calendar";
import { loadHostGuestNetworkSummary, type HostGuestNetworkSummary } from "@/lib/host-guest-network";
import { loadFamilyStories, loadLikedGuestCounts, type FamilyStory } from "@/lib/home-social-proof";
import { loadStayUnitRatingSummaries, type StayUnitRatingSummary } from "@/lib/stay-unit-ratings";
import { loadStayUnitsForHome, type StayUnitHomeInput, type StayUnitRecord } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type PublicStayBookingRow = Awaited<
  ReturnType<typeof loadHostStayBookingRecordsCompatibility>
>[number];

export type PublicHomeSideData = {
  stories: FamilyStory[];
  likedCount: number;
  stayBookingRows: PublicStayBookingRow[];
  guestNetwork: HostGuestNetworkSummary;
};

export type PublicHomeStayData = {
  stayUnits: StayUnitRecord[];
  roomRatingSummaryEntries: Array<[string, StayUnitRatingSummary]>;
};

function enumerateDateStrings(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function tokeniseRoomCalendarBlock(event: {
  startDate: string;
  endDate: string;
  slotKey?: string | null;
  isBlocking: boolean;
  status: string;
}): string[] {
  if (!event.isBlocking || event.status === "released" || event.status === "cancelled") {
    return [];
  }

  const tokens: string[] = [];
  for (const date of enumerateDateStrings(event.startDate, event.endDate)) {
    if (event.slotKey && event.slotKey !== "fullday") {
      tokens.push(`${date}::${event.slotKey}`);
      continue;
    }

    tokens.push(date, `${date}::fullday`);
  }

  return tokens;
}

async function hydrateStayUnitsWithBlockedDates(stayUnits: StayUnitRecord[]): Promise<StayUnitRecord[]> {
  const supabase = createAdminSupabaseClient();
  const from = getTodayInIndia();
  const to = addIndiaDays(from, 120);
  const uniqueHostIds = Array.from(
    new Set(
      stayUnits
        .map((unit) => unit.hostId)
        .filter((hostId): hostId is string => typeof hostId === "string" && hostId.length > 0)
    )
  );

  const hostEventsByHostId = new Map<string, Awaited<ReturnType<typeof loadCanonicalCalendar>>>();

  await Promise.all(
    uniqueHostIds.map(async (hostId) => {
      try {
        const hostEvents = await loadCanonicalCalendar(supabase, {
          ownerType: "host",
          ownerId: hostId,
          from,
          to,
        });
        hostEventsByHostId.set(hostId, hostEvents);
      } catch (error) {
        console.warn("[home-detail-public-data] failed to hydrate host calendar", hostId, error);
        hostEventsByHostId.set(hostId, []);
      }
    })
  );

  return Promise.all(
    stayUnits.map(async (unit) => {
      try {
        const [stayUnitEvents] = await Promise.all([
          loadCanonicalCalendar(supabase, {
            ownerType: "stay_unit",
            ownerId: unit.id,
            from,
            to,
          }),
        ]);
        const hostEvents = unit.hostId ? (hostEventsByHostId.get(unit.hostId) ?? []) : [];
        const applicableHostEvents = hostEvents.filter((event) => {
          const eventStayUnitId = getCalendarEventStayUnitId(event);
          return !eventStayUnitId || eventStayUnitId === unit.id;
        });

        return {
          ...unit,
          blockedDates: Array.from(
            new Set([...applicableHostEvents, ...stayUnitEvents].flatMap(tokeniseRoomCalendarBlock))
          ),
        };
      } catch (error) {
        console.warn("[home-detail-public-data] failed to hydrate room calendar", unit.id, error);
        return unit;
      }
    })
  );
}

const getCachedPublicHomeSideDataInternal = unstable_cache(
  async (input: {
    routeId: string;
    hostId: string | null;
    familyId: string | null;
  }): Promise<PublicHomeSideData> => {
    const supabase = createAdminSupabaseClient();
    const [stories, likedCountMap, stayBookingRows, guestNetwork] = await Promise.all([
      loadFamilyStories(input.routeId, 24, { includeUnpublished: true }),
      loadLikedGuestCounts([input.routeId]),
      loadHostStayBookingRecordsCompatibility(supabase, {
        hostId: input.hostId,
        legacyFamilyId: input.familyId,
      }),
      input.familyId
        ? loadHostGuestNetworkSummary(supabase, {
            familyId: input.familyId,
            viewerUserId: null,
            limit: 6,
          })
        : Promise.resolve({
            familyId: "",
            hostUserId: null,
            guestCount: 0,
            viewerCanAccessPeerChat: false,
            guests: [],
          }),
    ]);

    return {
      stories,
      likedCount: likedCountMap.get(input.routeId) ?? 0,
      stayBookingRows,
      guestNetwork,
    };
  },
  ["public-home-side-data"],
  { revalidate: 300, tags: ["public-home-side-data", "home-detail-public-data"] }
);

const getCachedPublicHomeStayDataInternal = unstable_cache(
  async (home: StayUnitHomeInput): Promise<PublicHomeStayData> => {
    const supabase = createAdminSupabaseClient();
    const stayUnitsRaw = await loadStayUnitsForHome(supabase, home);
    const activeStayUnitsRaw = stayUnitsRaw.filter((unit) => unit.isActive);
    const hydratedActiveStayUnits = await hydrateStayUnitsWithBlockedDates(activeStayUnitsRaw);
    const hydratedActiveStayUnitMap = new Map(hydratedActiveStayUnits.map((unit) => [unit.id, unit]));
    const stayUnits = stayUnitsRaw.map((unit) => hydratedActiveStayUnitMap.get(unit.id) ?? unit);
    const visibleStayUnits = hydratedActiveStayUnits;
    const roomRatingSummaryEntries = Array.from(
      (
        await loadStayUnitRatingSummaries(
          supabase,
          visibleStayUnits.map((unit) => unit.id)
        )
      ).entries()
    );

    return {
      stayUnits,
      roomRatingSummaryEntries,
    };
  },
  ["public-home-stay-data"],
  { revalidate: 300, tags: ["public-home-stay-data", "home-detail-public-data"] }
);

export async function getCachedPublicHomeSideData(input: {
  routeId: string;
  hostId: string | null;
  familyId: string | null;
}): Promise<PublicHomeSideData> {
  return getCachedPublicHomeSideDataInternal(input);
}

export async function getCachedPublicHomeStayData(
  home: StayUnitHomeInput
): Promise<PublicHomeStayData> {
  return getCachedPublicHomeStayDataInternal(home);
}
