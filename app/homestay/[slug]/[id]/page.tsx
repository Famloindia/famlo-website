import HomeDetailPage from "@/app/homes/[id]/page";
import {
  getCanonicalHomestayPath,
  getCachedHomeRouteResolution,
  getHomestayCanonicalRedirect,
} from "@/lib/home-route-resolution";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { notFound, permanentRedirect } from "next/navigation";

interface HomestayRedirectPageProps {
  params: Promise<{
    slug: string;
    id: string;
  }>;
}

export default async function HomestayRedirectPage({
  params,
}: Readonly<HomestayRedirectPageProps>): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const resolved = await getCachedHomeRouteResolution(id);
  if (!resolved.familyId || !resolved.familyRow) notFound();

  const canonicalPath = await getCanonicalHomestayPath(createAdminSupabaseClient(), resolved);
  if (!canonicalPath) notFound();

  const redirectPath = getHomestayCanonicalRedirect(resolved, slug, canonicalPath);
  if (redirectPath) permanentRedirect(redirectPath);

  return HomeDetailPage({
    params: Promise.resolve({ id: resolved.familyId }),
    canonicalRequest: true,
    resolvedRoute: resolved,
  });
}
