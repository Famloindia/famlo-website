import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadApplicationPhoto(
  supabase: SupabaseClient,
  folder: "family-applications" | "friend-applications" | "hommie-applications",
  applicantName: string,
  file: File
): Promise<string> {
  const fileExtension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const sanitizedName = applicantName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const filePath = `${folder}/${Date.now()}-${sanitizedName || "applicant"}.${fileExtension}`;

  const { error: uploadError } = await supabase.storage.from("application-photos").upload(filePath, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from("application-photos").getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadApplicationPhotos(
  supabase: SupabaseClient,
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
