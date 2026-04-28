import { NextResponse } from "next/server";
import { uploadFileToR2 } from "@/lib/r2-upload";
import { MAX_DOCUMENT_UPLOAD_BYTES, MAX_GALLERY_IMAGE_UPLOAD_BYTES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rawFolder = formData.get("folder");
    const folder = typeof rawFolder === "string" && rawFolder.trim() ? rawFolder.trim() : "host-profiles";
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(lowerName);
    const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
    const isHostProfilePhoto = folder === "host-profiles";
    const largeImageFolders = new Set(["host-gallery", "room-photos", "galleries"]);
    const imageLimit = largeImageFolders.has(folder) ? MAX_GALLERY_IMAGE_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;

    if (!isImage && !isPdf) {
      return NextResponse.json({ error: "Please upload an image or PDF file." }, { status: 400 });
    }

    if (isImage && !isHostProfilePhoto && file.size > imageLimit) {
      const label = largeImageFolders.has(folder) ? "50MB" : "15MB";
      return NextResponse.json({ error: `Image must be ${label} or smaller.` }, { status: 400 });
    }

    if (isPdf && file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      return NextResponse.json({ error: "PDF must be 10MB or smaller." }, { status: 400 });
    }

    const publicUrl = await uploadFileToR2(file, folder);

    return NextResponse.json({ url: publicUrl });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
