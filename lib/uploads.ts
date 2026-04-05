import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

export async function uploadApplicationPhoto(
  supabase: SupabaseClient<Database>,
  folder:
    | "family-applications"
    | "friend-applications"
    | "hommie-applications",
  applicantName: string,
  file: File
): Promise<string> {
  try {
    const fileExtension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const sanitizedName = applicantName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const filePath = `${folder}/${Date.now()}-${sanitizedName || "applicant"}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("application-photos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from("application-photos")
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to upload photo.";
    throw new Error(message);
  }
}

export async function uploadApplicationPhotos(
  supabase: SupabaseClient<Database>,
  folder: "family-applications" | "friend-applications" | "hommie-applications",
  applicantName: string,
  files: File[]
): Promise<string[]> {
  const uploadedUrls: string[] = [];

  for (const file of files) {
    const url = await uploadApplicationPhoto(supabase, folder, applicantName, file);
    uploadedUrls.push(url);
  }

  return uploadedUrls;
}
