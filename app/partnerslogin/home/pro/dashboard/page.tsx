import { renderFamloProDashboardPage, type FamloProDashboardPageProps } from "./render-dashboard";

export const dynamic = "force-dynamic";

export default async function FamloProDashboardPage({
  searchParams,
}: Readonly<FamloProDashboardPageProps>): Promise<React.JSX.Element> {
  return renderFamloProDashboardPage({ searchParams });
}
