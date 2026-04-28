const SUPABASE_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_RENDER_PATH = "/storage/v1/render/image/public/";

type SupabaseImageTransform = {
  width?: number;
  height?: number;
  quality?: number;
};

export function toSupabaseImageUrl(src: string, transform: SupabaseImageTransform = {}): string {
  if (!src) return src;

  try {
    const url = new URL(src);
    if (!url.pathname.includes(SUPABASE_OBJECT_PATH)) return src;

    url.pathname = url.pathname.replace(SUPABASE_OBJECT_PATH, SUPABASE_RENDER_PATH);

    if (transform.width != null) {
      url.searchParams.set("width", String(transform.width));
    }
    if (transform.height != null) {
      url.searchParams.set("height", String(transform.height));
    }
    if (transform.quality != null) {
      url.searchParams.set("quality", String(transform.quality));
    }

    return url.toString();
  } catch {
    return src;
  }
}

