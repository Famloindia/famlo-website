import { NextResponse } from "next/server";

import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { uploadFileToR2 } from "@/lib/r2-upload";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are supported." }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image must be 15MB or smaller." }, { status: 400 });
    }

    const publicUrl = await uploadFileToR2(file, `story-images/${authUser.id}`);

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("[guest.story.upload] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload image." },
      { status: 500 }
    );
  }
}
