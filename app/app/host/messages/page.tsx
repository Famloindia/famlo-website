import { renderHostMobileWorkspace } from "@/app/app/host/_lib/render-host-mobile-workspace";

export const dynamic = "force-dynamic";

export default async function HostMobileMessagesPage(): Promise<React.JSX.Element> {
  return renderHostMobileWorkspace("messages");
}
