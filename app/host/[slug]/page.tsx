import { notFound, redirect } from "next/navigation";

import { buildHomestayPath } from "@/lib/slug";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { resolveHomeRoute } from "@/lib/home-route-resolution";

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

  if (!resolved.hostId && !resolved.familyId) {
    notFound();
  }

  const canonicalId = resolved.familyId ?? resolved.hostId;

  if (!canonicalId) {
    notFound();
  }

  const homeName =
    typeof resolved.familyRow?.name === "string" && resolved.familyRow.name.trim().length > 0
      ? resolved.familyRow.name
      : typeof resolved.hostRow?.display_name === "string" && resolved.hostRow.display_name.trim().length > 0
        ? resolved.hostRow.display_name
        : canonicalId;

  redirect(
    buildHomestayPath(
      homeName,
      typeof resolved.familyRow?.village === "string" ? resolved.familyRow.village : typeof resolved.hostRow?.locality === "string" ? resolved.hostRow.locality : null,
      typeof resolved.familyRow?.city === "string" ? resolved.familyRow.city : typeof resolved.hostRow?.city === "string" ? resolved.hostRow.city : null,
      canonicalId
    )
  );
}
