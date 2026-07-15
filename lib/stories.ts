import { createAdminSupabaseClient } from "./supabase";

export interface StoryPreview {
  id: string;
  author_name: string | null;
  from_city: string | null;
  rating: number | null;
  story_text: string | null;
  created_at: string;
}

export async function getFeaturedStories(): Promise<StoryPreview[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("trip_stories")
      .select("id, author_name, from_city, rating, story_text, created_at")
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      return [];
    }

    return (data as StoryPreview[] | null) ?? [];
  } catch {
    return [];
  }
}
