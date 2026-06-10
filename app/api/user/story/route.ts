import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { isCompletedStayStatus } from "@/lib/chat-access";
import { resolveAuthenticatedUser } from "@/lib/request-user";
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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get("bookingId")?.trim() ?? "";
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const { data: bookingV2 } = await supabase
      .from("bookings_v2")
      .select("id,legacy_booking_id,user_id")
      .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
      .maybeSingle();
    const { data: legacyBooking } = await supabase
      .from("bookings")
      .select("id,user_id")
      .eq("id", bookingId)
      .maybeSingle();

    const resolvedBookingId = asString(bookingV2?.id) ?? bookingId;

    const bookingOwnerId = asString(bookingV2?.user_id) ?? asString(legacyBooking?.user_id);
    if (bookingOwnerId && bookingOwnerId !== authUser.id) {
      return NextResponse.json({ error: "You can only view your own story." }, { status: 403 });
    }

    const { data: storyRows, error } = await supabase
      .from("stories_v2")
      .select("id,title,body,rating,liked_host,guest_consent_to_feature,cover_image_url,created_at,updated_at")
      .eq("booking_id", resolvedBookingId)
      .eq("author_user_id", authUser.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    const story = (storyRows?.[0] ?? null) as Record<string, unknown> | null;

    return NextResponse.json({
      story: story
        ? {
            id: asString(story.id),
            title: asString(story.title),
            body: asString(story.body),
            rating: typeof story.rating === "number" ? story.rating : null,
            liked: typeof story.liked_host === "boolean" ? story.liked_host : null,
            guestConsentToFeature: story.guest_consent_to_feature === true,
            imageUrls: asString(story.cover_image_url) ? [asString(story.cover_image_url)] : [],
            createdAt: asString(story.created_at),
            updatedAt: asString(story.updated_at),
          }
        : null,
    });
  } catch (error) {
    console.error("Story load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load story." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const {
      userId,
      bookingId,
      familyId,
      authorName,
      fromCity,
      title,
      stayHighlight,
      experienceTags,
      guestConsentToFeature,
      storyText,
      rating,
      liked,
      notRecommendReason,
      imageUrls,
    } = (await request.json()) as Record<string, unknown>;

    if (
      typeof bookingId !== "string" ||
      typeof storyText !== "string" ||
      storyText.trim().length < 8
    ) {
      return NextResponse.json({ error: "Please add a short story description." }, { status: 400 });
    }

    const normalizedRating =
      typeof rating === "number"
        ? rating
        : typeof rating === "string" && rating.trim().length > 0
          ? Number(rating)
          : null;

    const normalizedImageUrls = Array.isArray(imageUrls)
      ? Array.from(
          new Set(
            imageUrls
              .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              .map((item) => item.trim().slice(0, 500))
          )
        ).slice(0, 3)
      : [];
    const primaryImageUrl = normalizedImageUrls[0] ?? null;

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (typeof userId === "string" && userId !== authUser.id) {
      return NextResponse.json({ error: "You can only submit your own story." }, { status: 403 });
    }
    const now = new Date().toISOString();
    const { data: bookingV2 } = await supabase
      .from("bookings_v2")
      .select("id,host_id,legacy_booking_id,user_id,status")
      .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
      .maybeSingle();

    const { data: legacyBooking } = await supabase
      .from("bookings")
      .select("id,family_id,guide_id,user_id,status")
      .eq("id", bookingId)
      .maybeSingle();

    const bookingOwnerId =
      asString(bookingV2?.user_id) ??
      asString(legacyBooking?.user_id);

    if (!bookingOwnerId || bookingOwnerId !== authUser.id) {
      return NextResponse.json({ error: "You can only review your own completed stay." }, { status: 403 });
    }

    const bookingStatus = asString(bookingV2?.status) ?? asString(legacyBooking?.status);
    if (!isCompletedStayStatus(bookingStatus)) {
      return NextResponse.json({ error: "Stories unlock after checkout is completed." }, { status: 409 });
    }

    const bookingHostId = asString(bookingV2?.host_id);
    const providedFamilyId = asString(familyId);
    const resolvedFamilyHint = providedFamilyId ?? asString(legacyBooking?.family_id);

    const { data: host } = bookingHostId
      ? await supabase
          .from("hosts")
          .select("id,legacy_family_id")
          .eq("id", bookingHostId)
          .maybeSingle()
      : { data: null };

    const resolvedHostId = asString(host?.id) ?? bookingHostId ?? null;
    const resolvedFamilyId = asString(host?.legacy_family_id) ?? resolvedFamilyHint;

    if (!resolvedFamilyId) {
      return NextResponse.json({ error: "Unable to resolve booking family." }, { status: 400 });
    }

    console.info("[story.submit] resolved booking context", {
      bookingId,
      resolvedHostId,
      resolvedFamilyId,
      hasCoverImage: Boolean(primaryImageUrl),
      liked: typeof liked === "boolean" ? liked : null,
    });

    const storyV2Payload = {
      booking_id: bookingV2?.id ?? bookingId,
      host_id: resolvedHostId,
      author_user_id: authUser.id,
      author_name: typeof authorName === "string" ? authorName.trim() : null,
      city: typeof fromCity === "string" ? fromCity.trim() : null,
      title:
        typeof title === "string" && title.trim().length > 0
          ? title.trim().slice(0, 120)
          : typeof authorName === "string" && authorName.trim().length > 0
            ? `${authorName.trim()}'s Famlo story`
            : "Famlo Story",
      body: storyText.trim(),
      rating: Number.isFinite(normalizedRating) ? normalizedRating : null,
      liked_host: typeof liked === "boolean" ? liked : null,
      guest_consent_to_feature: guestConsentToFeature === true,
      stay_highlight: typeof stayHighlight === "string" && stayHighlight.trim().length > 0 ? stayHighlight.trim().slice(0, 140) : null,
      experience_tags: Array.isArray(experienceTags)
        ? experienceTags
            .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
            .map((tag) => tag.trim().slice(0, 32))
            .slice(0, 5)
        : [],
      review_status: "pending",
      is_published: false,
      cover_image_url: primaryImageUrl,
      created_at: now,
      updated_at: now,
    };
    const { data: existingStoryRows, error: existingStoryError } = await supabase
      .from("stories_v2")
      .select("id")
      .eq("booking_id", bookingV2?.id ?? bookingId)
      .eq("author_user_id", authUser.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (existingStoryError) throw existingStoryError;
    const existingStoryId = asString((existingStoryRows?.[0] as Record<string, unknown> | undefined)?.id);

    let storedStoryId: string | null = null;
    if (existingStoryId) {
      const { data: updatedStory, error: updateStoryError } = await supabase
        .from("stories_v2")
        .update(storyV2Payload as never)
        .eq("id", existingStoryId)
        .select("id")
        .single();
      if (updateStoryError) {
        console.error("[story.submit] stories_v2 update failed", {
          message: updateStoryError.message,
          code: updateStoryError.code,
          details: updateStoryError.details,
        });
        return NextResponse.json(
          { error: "Guest story could not be updated right now." },
          { status: 503 }
        );
      }
      storedStoryId = asString(updatedStory?.id);
    } else {
      const { data: insertedStory, error: storyV2Error } = await supabase
        .from("stories_v2")
        .insert(storyV2Payload as never)
        .select("id")
        .single();
      if (storyV2Error) {
        console.error("[story.submit] stories_v2 insert failed", {
          message: storyV2Error.message,
          code: storyV2Error.code,
          details: storyV2Error.details,
        });
        return NextResponse.json(
          { error: "Guest story storage is not set up correctly for the live schema." },
          { status: 503 }
        );
      }
      storedStoryId = asString(insertedStory?.id);
    }

    const bookingPatch: Record<string, unknown> = {
      feedback_submitted_at: now,
    };

    const { error: bookingV2Error } = await supabase
      .from("bookings_v2")
      .update(bookingPatch as never)
      .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`);

    if (bookingV2Error) {
      console.error("Booking v2 feedback update warning:", bookingV2Error);
    }

    const legacyBookingPatch: Record<string, unknown> = {
      feedback_submitted_at: now,
    };
    if (typeof liked === "boolean") {
      legacyBookingPatch.liked_host = liked;
    }

    const { error: legacyBookingPatchError } = await supabase
      .from("bookings")
      .update(legacyBookingPatch as never)
      .eq("id", bookingId);

    if (legacyBookingPatchError) {
      console.error("Legacy booking feedback update warning:", legacyBookingPatchError);
    }

    if (liked === false) {
      const reasonText =
        typeof notRecommendReason === "string" && notRecommendReason.trim().length > 0
          ? notRecommendReason.trim()
          : "No additional reason provided.";

      const { error: userProblemError } = await supabase.from("support_tickets").insert({
        host_id: authUser.id,
        host_name: typeof authorName === "string" && authorName.trim().length > 0 ? authorName.trim() : "Famlo guest",
        subject: `[USER PROBLEM] Stay feedback for booking ${bookingId.slice(0, 8)}`,
        message: [
          `Guest said they would not recommend this stay.`,
          `Booking ID: ${bookingId}`,
          `Family ID: ${resolvedFamilyId}`,
          `Headline: ${typeof title === "string" && title.trim().length > 0 ? title.trim() : "N/A"}`,
          `Reason: ${reasonText}`,
          `Story: ${storyText.trim()}`,
        ].join("\n"),
        status: "open",
      } as never);

      if (userProblemError) {
        console.error("User problem ticket warning:", userProblemError);
      }
    }

    console.info("[story.submit] stored stories_v2 row", {
      storyId: storedStoryId,
      resolvedHostId,
      resolvedFamilyId,
      liked: typeof liked === "boolean" ? liked : null,
      featureConsent: guestConsentToFeature === true,
    });
    revalidateTag("public-home-side-data", "max");
    revalidateTag("home-detail-public-data", "max");

    return NextResponse.json({ success: true, storedIn: "stories_v2", status: "pending_review", storyId: storedStoryId });
  } catch (error) {
    console.error("Story submission failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit story." },
      { status: 500 }
    );
  }
}
