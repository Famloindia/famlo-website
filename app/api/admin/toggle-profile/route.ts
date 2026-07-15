//app/api/admin/toggle-profile/route.ts

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { ensureHostProfileForFamily } from "@/lib/family-approval";
import { createAdminSupabaseClient } from "@/lib/supabase";

type EntityType = "family" | "friend";

async function updateHommieStatusV2(params: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  profileId: string;
  isActive: boolean;
}): Promise<void> {
  const { supabase, profileId, isActive } = params;
  const clauses = [
    `id.eq.${profileId}`,
    `legacy_city_guide_id.eq.${profileId}`,
  ].filter(Boolean);

  if (clauses.length === 0) return;

  const { error } = await supabase
    .from("hommie_profiles_v2")
    .update({
      status: isActive ? "published" : "paused",
      updated_at: new Date().toISOString(),
    } as never)
    .or(clauses.join(","));

  if (error) {
    throw error;
  }
}

async function updateHostStatusV2(params: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  isActive: boolean;
}): Promise<void> {
  const { supabase, familyId, isActive } = params;
  const sync = await ensureHostProfileForFamily(supabase, familyId);

  if (!sync.hostId) {
    return;
  }

  const { error } = await supabase
    .from("hosts")
    .update({
      status: isActive ? "published" : "paused",
      is_accepting: isActive,
      published_at: isActive ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", sync.hostId);

  if (error) {
    throw error;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    entityType?: EntityType;
    profileId?: string;
    isActive?: boolean;
  };

  if (!body.entityType || !body.profileId || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "Missing profile toggle data." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  try {
    if (body.entityType === "family") {
      const { data, error } = await supabase
        .from("families")
        .update({
          is_active: body.isActive,
          is_accepting: body.isActive
        } as never)
        .eq("id", body.profileId)
        .select("id,is_active,is_accepting")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Unable to update Home listing." },
          { status: 500 }
        );
      }

      await updateHostStatusV2({
        supabase,
        familyId: body.profileId,
        isActive: body.isActive,
      });

      return NextResponse.json({ profile: data });
    }

    await updateHommieStatusV2({
      supabase,
      profileId: body.profileId,
      isActive: body.isActive,
    });

    const { data, error } = await supabase
      .from("hommie_profiles_v2")
      .select("id,legacy_city_guide_id,status")
      .or(`id.eq.${body.profileId},legacy_city_guide_id.eq.${body.profileId}`)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to update hommie profile." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      profile: {
        id: data.id,
        legacy_city_guide_id: data.legacy_city_guide_id ?? null,
        is_active: data.status === "published",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update profile." },
      { status: 500 }
    );
  }
}
