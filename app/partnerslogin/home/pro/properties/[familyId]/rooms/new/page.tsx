import { renderFamloProDashboardPage } from "@/app/partnerslogin/home/pro/dashboard/render-dashboard";

export const dynamic = "force-dynamic";

export default async function ProPropertyRoomCreatePage({
  params,
}: Readonly<{
  params: Promise<{
    familyId: string;
  }>;
}>): Promise<React.JSX.Element> {
  const { familyId } = await params;

  return renderFamloProDashboardPage({
    searchParams: Promise.resolve({
      family: familyId,
      section: "rooms-units",
    }),
    roomRouteState: {
      mode: "create",
    },
  });
}
