import { createAdminSupabaseClient } from "./supabase";
import type { CityGuideProfile, FamilyProfile, Home, Hommie } from "./types";

export async function getFeaturedFamilies(limit = 6): Promise<FamilyProfile[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("families")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return [];
    }

    return (data ?? []) as FamilyProfile[];
  } catch {
    return [];
  }
}

export async function getFeaturedFriends(limit = 6): Promise<CityGuideProfile[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("city_guides")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return [];
    }

    return (data ?? []) as CityGuideProfile[];
  } catch {
    return [];
  }
}

export async function getFeaturedHommies(limit = 6): Promise<Hommie[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("hommies")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return [];
    }

    return (data ?? []) as Hommie[];
  } catch {
    return [];
  }
}

export async function getFeaturedHomes(limit = 6): Promise<Home[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("homes")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return [];
    }

    return (data ?? []) as Home[];
  } catch {
    return [];
  }
}
