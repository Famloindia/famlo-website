import { redirect } from "next/navigation";

import { resolveHostMobileSession } from "@/lib/host-mobile-session";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HostMobileEntryPage(): Promise<never> {
  const supabase = createAdminSupabaseClient();
  const session = await resolveHostMobileSession(supabase);
  redirect(session.defaultRoute);
}
