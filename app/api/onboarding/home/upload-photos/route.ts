import { NextResponse } from "next/server";

import { uploadFileToR2 } from "@/lib/r2-upload";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const familyId = String(formData.get("familyId") ?? "").trim();
  const files = formData.getAll("photos").filter((item): item is File => item instanceof File);

  if (!familyId) {
    return NextResponse.json({ error: "Missing family id." }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: existingPhotos, error: existingError } = await supabase
    .from("family_photos")
    .select("id")
    .eq("family_id", familyId);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingCount = existingPhotos?.length ?? 0;
  if (existingCount + files.length > 5) {
    return NextResponse.json({ error: "You can keep up to 5 listing photos." }, { status: 400 });
  }

  for (const [index, file] of files.entries()) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Please upload image files only." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image must be 15MB or smaller." }, { status: 400 });
    }
    const publicUrl = await uploadFileToR2(file, `family-photos/${familyId}/${index}`);

    const { error: insertError } = await supabase.from("family_photos").insert({
      family_id: familyId,
      url: publicUrl,
      is_primary: existingCount === 0 && index === 0
    } as never);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const { data: photoRows, error: photoError } = await supabase
    .from("family_photos")
    .select("url,is_primary")
    .eq("family_id", familyId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (photoError) {
    return NextResponse.json({ error: photoError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    photoUrls: ((photoRows ?? []) as Array<{ url: string | null }>)
      .map((row) => row.url ?? "")
      .filter(Boolean)
  });
}
