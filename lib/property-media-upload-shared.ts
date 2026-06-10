import { MAX_GALLERY_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

export const PROPERTY_MEDIA_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function validatePropertyMediaDirectUpload(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  if (!input.fileName.trim()) {
    return "Choose a valid gallery image before uploading.";
  }

  const supported =
    PROPERTY_MEDIA_ALLOWED_MIME_TYPES.has(input.mimeType) ||
    /\.(jpe?g|png|webp|heic|heif)$/i.test(input.fileName);
  if (!supported) {
    return "Upload a JPG, PNG, WEBP, HEIC, or HEIF gallery image.";
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "Choose a valid gallery image before uploading.";
  }

  if (input.sizeBytes > MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
    return "Gallery images must be 50MB or smaller.";
  }

  return null;
}
