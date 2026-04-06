import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getAdminCookieName,
  verifyAdminSessionToken
} from "../../../../lib/admin-auth";
import { createAdminSupabaseClient } from "../../../../lib/supabase";
import type { CityGuideProfile, FamilyProfile } from "../../../../lib/types";

type EntityType = "family" | "friend";

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = cookies();
  const isAuthenticated = verifyAdminSessionToken(
    cookieStore.get(getAdminCookieName())?.value
  );

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    entityType?: EntityType;
    profileId?: string;
    isActive?: boolean;
  };

  if (
    !body.entityType ||
    !body.profileId ||
    typeof body.isActive !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Missing profile toggle data." },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();

  try {
    if (body.entityType === "family") {
      const { data, error } = await supabase
        .from("families")
        .update({ is_active: body.isActive } as never)
        .eq("id", body.profileId)
        .select("*")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Unable to update family." },
          { status: 500 }
        );
      }

      return NextResponse.json({ profile: data as FamilyProfile });
    }

    const { data, error } = await supabase
      .from("city_guides")
      .update({ is_active: body.isActive } as never)
      .eq("id", body.profileId)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to update friend." },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: data as CityGuideProfile });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update profile."
      },
      { status: 500 }
    );
  }
}
