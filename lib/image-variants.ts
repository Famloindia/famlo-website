export function derivePreviewImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const fullMarker = "-full.webp";
  if (!trimmed.includes(fullMarker)) {
    return null;
  }

  return trimmed.replace(fullMarker, "-preview.webp");
}
