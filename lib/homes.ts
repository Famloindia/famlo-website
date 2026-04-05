import { createAdminSupabaseClient } from "./supabase";
import type { Home } from "./types";

export async function getApprovedHomes(): Promise<Home[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("homes")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (error) {
      return [];
    }

    return (data ?? []) as Home[];
  } catch {
    return [];
  }
}

export async function getApprovedHomeBySlug(slug: string): Promise<Home | null> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("homes")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("is_approved", true)
      .maybeSingle();

    if (error) {
      return null;
    }

    return (data as Home | null) ?? null;
  } catch {
    return null;
  }
}
