import { createAdminSupabaseClient } from "./supabase";
import type { Hommie } from "./types";

export async function getApprovedHommies(): Promise<Hommie[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("hommies")
      .select("*")
      .eq("is_active", true)
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (error) {
      return [];
    }

    return (data ?? []) as Hommie[];
  } catch {
    return [];
  }
}

export async function getApprovedHommieBySlug(slug: string): Promise<Hommie | null> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("hommies")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("is_approved", true)
      .maybeSingle();

    if (error) {
      return null;
    }

    return (data as Hommie | null) ?? null;
  } catch {
    return null;
  }
}
