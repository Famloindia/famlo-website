import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

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

  const uploadedUrls: string[] = [];

  for (const [index, file] of files.entries()) {
    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `family_${familyId}_${Date.now()}_${index}.${extension}`;
    const buffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(filePath, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from("photos").getPublicUrl(filePath);

    const { error: insertError } = await supabase.from("family_photos").insert({
      family_id: familyId,
      url: publicUrl,
      is_primary: existingCount === 0 && index === 0
    } as never);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    uploadedUrls.push(publicUrl);
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
    photoUrls: ((photoRows ?? []) as Array<{ url: string | null }>).map((row) => row.url ?? "").filter(Boolean)
  });
}
