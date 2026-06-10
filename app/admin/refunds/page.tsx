import { redirect } from "next/navigation";
import { hasValidAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminRefundsPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  redirect("/admin/finance/refunds");
}
