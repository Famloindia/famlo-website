import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import CancellationOperationsQueue from "@/components/operations/CancellationOperationsQueue";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { listCancellationCases } from "@/lib/cancellations/operations";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminCancellationRequestsPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const cases = await listCancellationCases(createAdminSupabaseClient());
  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="refunds" killSwitchActive={false}>
      <CancellationOperationsQueue initialCases={cases as never[]} mode="admin" />
    </AdminLayout>
  );
}
