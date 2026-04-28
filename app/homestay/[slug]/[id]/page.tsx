import PreviewPage from "@/app/partnerslogin/home/dashboard/preview/[id]/page";

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
  return PreviewPage({ params: Promise.resolve({ id }) });
}
