import { notFound, permanentRedirect } from "next/navigation";

import { createAdminSupabaseClient } from "@/lib/supabase";
import { getCanonicalHomestayPath, resolveHomeRoute } from "@/lib/home-route-resolution";

interface HostSlugPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function HostSlugPage({
  params,
}: Readonly<HostSlugPageProps>): Promise<never> {
  const { slug } = await params;
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveHomeRoute(supabase, slug);

  if (!resolved.familyId || !resolved.familyRow) notFound();
  const canonicalPath = await getCanonicalHomestayPath(supabase, resolved);
  if (!canonicalPath) notFound();
  permanentRedirect(canonicalPath);
}
