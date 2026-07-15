export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildListingSlug(name: string, locality?: string | null, city?: string | null): string {
  const parts = [name, locality, city].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return slugify(parts.join(" "));
}

export function buildHomestayPath(
  name: string,
  locality?: string | null,
  city?: string | null,
  code?: string | null
): string {
  const slug = buildListingSlug(name, locality, city) || slugify(code || name || "homestay");
  const codeSegment = typeof code === "string" && code.trim().length > 0 ? encodeURIComponent(code.trim()) : slug;
  return `/homestay/${slug}/${codeSegment}`;
}
