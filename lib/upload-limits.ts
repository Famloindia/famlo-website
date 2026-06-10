export const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_GALLERY_IMAGE_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

export function formatImageUploadLimitLabel(): string {
  return "15MB";
}

export function formatGalleryImageUploadLimitLabel(): string {
  return "50MB";
}
