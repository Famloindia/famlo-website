import { NextRequest, NextResponse } from "next/server";

function addSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/homestay/")) {
    const segments = pathname.split("/").filter(Boolean);
    const code = segments[2];

    if (code) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/homes/${code}`;
      return NextResponse.rewrite(rewriteUrl);
    }
  }

  if (pathname.startsWith("/app") || pathname.startsWith("/partners")) {
    return NextResponse.next();
  }

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isTeam = pathname === "/teams" || pathname.startsWith("/teams/");

  if (!isAdmin && !isTeam) {
    return NextResponse.next();
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/admin/:path*", "/teams/:path*", "/homestay/:path*"],
};
