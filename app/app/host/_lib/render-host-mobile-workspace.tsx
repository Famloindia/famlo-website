import { redirect } from "next/navigation";

import { HostMobileWorkspace } from "@/components/app/HostMobileWorkspace";
import {
  resolveHostMobileLegacyDashboardHref,
  resolveHostMobileSession,
  type HostMobileRouteKey,
} from "@/lib/host-mobile-session";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function renderHostMobileWorkspace(routeKey: HostMobileRouteKey): Promise<React.JSX.Element> {
  const supabase = createAdminSupabaseClient();
  const session = await resolveHostMobileSession(supabase);

  if (!session.authenticated || !session.workspace) {
    redirect("/app/host/login");
  }

  const iframeHref = resolveHostMobileLegacyDashboardHref({
    familyId: session.workspace.selectedFamilyId,
    proAllowed: session.pro.allowed,
    routeKey,
  });

  return <HostMobileWorkspace activeRouteKey={routeKey} iframeHref={iframeHref} session={session} />;
}
