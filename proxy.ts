import { NextRequest, NextResponse } from "next/server";

import {
  getCanonicalHomestayPath,
  getHomestayCanonicalRedirect,
  resolveHomeRoute,
} from "@/lib/home-route-resolution";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const requestedSlug = segments[1] ?? "";
  const requestedId = segments[2] ?? "";
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveHomeRoute(supabase, requestedId);

  if (!resolved.familyId || !resolved.familyRow) {
    return new NextResponse("Homestay not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const canonicalPath = await getCanonicalHomestayPath(supabase, resolved);
  if (!canonicalPath) {
    return new NextResponse("Homestay not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const redirectPath = getHomestayCanonicalRedirect(resolved, requestedSlug, canonicalPath);
  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url), 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/homestay/:slug/:id"],
};
