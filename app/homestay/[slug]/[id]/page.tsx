import HomeDetailPage from "@/app/homes/[id]/page";

interface HomestayRedirectPageProps {
  params: Promise<{
    slug: string;
    id: string;
  }>;
}

export default async function HomestayRedirectPage({
  params,
}: Readonly<HomestayRedirectPageProps>): Promise<React.JSX.Element> {
  const { id } = await params;
  return HomeDetailPage({ params: Promise.resolve({ id }) });
}
