import { redirect } from "next/navigation";

export default function AppAdminRoute(): never {
  redirect("/admin");
}
