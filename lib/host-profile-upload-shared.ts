import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

export const HOST_PROFILE_DIRECT_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function canDirectUploadHostProfileImage(input: {
  fileName: string;
  mimeType: string;
}): boolean {
  if (HOST_PROFILE_DIRECT_UPLOAD_ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return true;
  }

  return /\.(jpe?g|png|webp)$/i.test(input.fileName);
}

export function validateHostProfileDirectUpload(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  if (!input.fileName.trim()) {
    return "Choose a valid profile photo before uploading.";
  }

  if (!canDirectUploadHostProfileImage(input)) {
    return "Upload a JPG, PNG, or WEBP profile photo.";
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "Choose a valid profile photo before uploading.";
  }

  if (input.sizeBytes > MAX_IMAGE_UPLOAD_BYTES) {
    return "Profile photos must be 15MB or smaller.";
  }

  return null;
}
