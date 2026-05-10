import FamloProDashboardPage from "@/app/partnerslogin/home/pro/dashboard/page";

export const dynamic = "force-dynamic";

export default async function ProPropertyRoomEditPage({
  params,
}: Readonly<{
  params: Promise<{
    familyId: string;
    roomId: string;
  }>;
}>): Promise<React.JSX.Element> {
  const { familyId, roomId } = await params;

  return FamloProDashboardPage({
    searchParams: Promise.resolve({
      family: familyId,
      section: "rooms-units",
    }),
    roomRouteState: {
      mode: "edit",
      roomId,
    },
  });
}
