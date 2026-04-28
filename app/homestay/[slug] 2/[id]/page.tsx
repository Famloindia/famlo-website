import { redirect } from "next/navigation";

interface HomestayRedirectPageProps {
  params: Promise<{
    slug: string;
    id: string;
  }>;
}

export default async function HomestayRedirectPage({
  params,
}: Readonly<HomestayRedirectPageProps>): Promise<never> {
  const { id } = await params;
  redirect(`/homes/${id}`);
}
