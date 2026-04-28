import { MessagesDashboard } from "@/components/account/MessagesDashboard";

interface MessagesPageProps {
  searchParams?: Promise<{
    conversation?: string;
  }>;
}

export default async function MessagesPage({
  searchParams,
}: Readonly<MessagesPageProps>): Promise<React.JSX.Element> {
  const params = await searchParams;
  return <MessagesDashboard initialConversationId={params?.conversation} />;
}
