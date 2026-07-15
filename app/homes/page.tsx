import { redirect } from "next/navigation";

export default function HomesRedirectPage(): never {
  redirect("/homestays");
}
