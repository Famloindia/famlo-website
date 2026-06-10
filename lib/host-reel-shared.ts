export const HOST_REEL_ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export const HOST_REEL_ACCEPT_ATTRIBUTE = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
export const MAX_HOST_REEL_UPLOAD_BYTES = 75 * 1024 * 1024;

export function validateHostReelFile(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  if (!HOST_REEL_ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return "Upload an MP4, WEBM, or MOV video for the host reel.";
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "Choose a valid video file before uploading.";
  }

  if (input.sizeBytes > MAX_HOST_REEL_UPLOAD_BYTES) {
    return "Host reel videos must be 75MB or smaller.";
  }

  if (!input.fileName.trim()) {
    return "Choose a valid video file before uploading.";
  }

  return null;
}
