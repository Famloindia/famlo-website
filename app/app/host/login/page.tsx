import { redirect } from "next/navigation";

import { HostAppLogin } from "@/components/app/HostAppLogin";
import { resolveHostMobileSession } from "@/lib/host-mobile-session";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostMobileLoginPage(): Promise<React.JSX.Element> {
  const supabase = createAdminSupabaseClient();
  const session = await resolveHostMobileSession(supabase);

  if (session.authenticated) {
    redirect(session.defaultRoute);
  }

  return <HostAppLogin badgeLabel={session.badge.label} />;
}
