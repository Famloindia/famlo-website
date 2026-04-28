import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the table") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("column")
  );
}

function normalizeImageUrls(row: Record<string, unknown>): string[] {
  if (typeof row.cover_image_url === "string" && row.cover_image_url.trim().length > 0) {
    return [row.cover_image_url.trim()];
  }
  return [];
}

function mapStoryV2(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    authorName: asString(row.author_name) ?? "Famlo guest",
    city: asString(row.city),
    title: asString(row.title),
    body: asString(row.body) ?? "",
    rating: typeof row.rating === "number" ? row.rating : null,
    isPublished: row.is_published === true,
    reviewStatus: asString(row.review_status) ?? "pending",
    featuredRank: typeof row.featured_rank === "number" ? row.featured_rank : null,
    guestConsentToFeature: row.guest_consent_to_feature === true,
    stayHighlight: asString(row.stay_highlight),
    experienceTags: Array.isArray(row.experience_tags) ? row.experience_tags.filter((tag: unknown): tag is string => typeof tag === "string") : [],
    createdAt: asString(row.created_at) ?? new Date().toISOString(),
    hostName: asString(row.host_name),
    hostCity: asString(row.host_city),
    hostState: asString(row.host_state),
    imageUrls: normalizeImageUrls(row),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    let stories: any[] = [];

    const loadStoriesV2 = async (): Promise<Record<string, unknown>[]> => {
      const result = await supabase
        .from("stories_v2")
        .select("id,author_name,city,title,body,rating,is_published,review_status,featured_rank,guest_consent_to_feature,stay_highlight,experience_tags,created_at,cover_image_url,host_id")
        .order("featured_rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(120);

      if (!result.error) {
        const rows = (result.data ?? []) as Record<string, unknown>[];
        const hostIds = [...new Set(rows.map((row) => asString(row.host_id)).filter(Boolean))];
        if (hostIds.length === 0) {
          return rows;
        }

        const hostLookup = await supabase
          .from("hosts")
          .select("id,display_name,city,state")
          .in("id", hostIds);

        if (hostLookup.error) {
          console.warn("[admin.testimonials] host lookup failed, continuing without host labels", {
            message: hostLookup.error.message,
          });
          return rows;
        }

        const hostMap = new Map<string, Record<string, unknown>>();
        for (const host of (hostLookup.data ?? []) as Record<string, unknown>[]) {
          const hostId = asString(host.id);
          if (hostId) hostMap.set(hostId, host);
        }

          return rows.map((row) => {
            const host = asString(row.host_id) ? hostMap.get(asString(row.host_id) ?? "") : null;
            return {
              ...row,
              host_name: host ? host.display_name ?? null : null,
            host_city: host ? host.city ?? null : null,
            host_state: host ? host.state ?? null : null,
            };
          });
        }

      if (!isSchemaCompatibilityError(result.error.message)) {
        throw result.error;
      }

      return [];
    };

    try {
      stories = (await loadStoriesV2()).map(mapStoryV2);
      console.info("[admin.testimonials] loaded stories_v2 rows", {
        count: stories.length,
        approved: stories.filter((story) => story.reviewStatus === "approved").length,
        featured: stories.filter((story) => story.featuredRank != null).length,
      });
    } catch (storiesError) {
      console.warn("[admin.testimonials] stories_v2 load failed", {
        message: storiesError instanceof Error ? storiesError.message : String(storiesError),
      });
      stories = [];
    }

    return NextResponse.json({
      counts: {
        pending: stories.filter((story) => story.reviewStatus === "pending").length,
        approved: stories.filter((story) => story.reviewStatus === "approved").length,
        featured: stories.filter((story) => story.featuredRank != null).length,
        hidden: stories.filter((story) => story.reviewStatus === "hidden").length,
      },
      stories,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load testimonials desk." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storyId, action } = (await request.json()) as { storyId?: string; action?: string };
    if (!storyId || !action) {
      return NextResponse.json({ error: "storyId and action are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from("stories_v2")
      .select("id,featured_rank,guest_consent_to_feature")
      .eq("id", storyId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: "Story not found." }, { status: 404 });
    }

    let patch: Record<string, unknown> = {
      reviewed_at: new Date().toISOString(),
      reviewed_by: "system-admin",
    };

    if (action === "approve") {
      patch = { ...patch, review_status: "approved", is_published: true };
    } else if (action === "reject") {
      patch = { ...patch, review_status: "rejected", is_published: false, featured_rank: null };
    } else if (action === "hide") {
      patch = { ...patch, review_status: "hidden", is_published: false, featured_rank: null };
    } else if (action === "feature") {
      const { data: featuredRows, error: featuredError } = await supabase
        .from("stories_v2")
        .select("id,featured_rank")
        .not("featured_rank", "is", null)
        .order("featured_rank", { ascending: true });

      if (featuredError) throw featuredError;
      const nextRank =
        (featuredRows ?? [])
          .map((row: any) => (typeof row.featured_rank === "number" ? row.featured_rank : 0))
          .reduce((max: number, value: number) => Math.max(max, value), 0) + 1;

      patch = { ...patch, review_status: "approved", is_published: true, featured_rank: existing.featured_rank ?? nextRank };
    } else if (action === "unfeature") {
      patch = { ...patch, featured_rank: null };
    } else {
      return NextResponse.json({ error: "Unsupported testimonial action." }, { status: 400 });
    }

    console.info("[admin.testimonials] applying story patch", {
      storyId,
      action,
      patch,
    });

    const { error: updateError } = await supabase.from("stories_v2").update(patch as never).eq("id", storyId);
    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update testimonial." },
      { status: 500 }
    );
  }
}
