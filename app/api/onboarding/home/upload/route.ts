import { NextResponse } from "next/server";
import { UploadPathError, uploadFileToR2 } from "@/lib/r2-upload";
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
    const largeImageFolders = new Set(["host-gallery", "room-photos", "galleries"]);
    const imageLimit = largeImageFolders.has(folder) ? MAX_GALLERY_IMAGE_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
    const imageLimitLabel = largeImageFolders.has(folder) ? "50MB" : "15MB";

    if (!isImage && !isPdf) {
      return NextResponse.json(
        { error: "Please upload an image or PDF file.", errorCode: "FILE_TOO_LARGE_OR_UNSUPPORTED" },
        { status: 400 }
      );
    }

    console.info("[upload][route]", {
      appEnv: String(process.env.APP_ENV ?? "").trim() || "(unset)",
      nextPublicAppEnv: String(process.env.NEXT_PUBLIC_APP_ENV ?? "").trim() || "(unset)",
      bucketName: String(process.env.R2_BUCKET_NAME ?? "").trim() || "(unset)",
      hasAccountId: Boolean(process.env.R2_ACCOUNT_ID),
      hasAccessKeyId: Boolean(process.env.R2_ACCESS_KEY_ID),
      hasSecretAccessKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
      uploadFolder: folder,
      keyPrefix: `${folder}/`,
      fileMimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    });

    if (isImage && file.size > imageLimit) {
      return NextResponse.json(
        { error: `Image must be ${imageLimitLabel} or smaller.`, errorCode: "FILE_TOO_LARGE_OR_UNSUPPORTED" },
        { status: 400 }
      );
    }

    if (isPdf && file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "PDF must be 10MB or smaller.", errorCode: "FILE_TOO_LARGE_OR_UNSUPPORTED" },
        { status: 400 }
      );
    }

    const publicUrl = await uploadFileToR2(file, folder);

    return NextResponse.json({ url: publicUrl });

  } catch (err: unknown) {
    if (err instanceof UploadPathError) {
      return NextResponse.json(
        {
          error: err.message,
          errorCode: err.code,
          errorDetails: {
            name: err.details.name,
            code: err.details.code,
            status: err.details.status,
          },
        },
        { status: err.status }
      );
    }

    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      {
        error: message,
        errorCode: "UNKNOWN_UPLOAD_ERROR",
      },
      { status: 500 }
    );
  }
}
