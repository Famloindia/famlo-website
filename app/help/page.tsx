import { BasicInfoPage } from "@/components/system/BasicInfoPage";

export default function HelpPage(): React.JSX.Element {
  return (
    <BasicInfoPage
      eyebrow="Support"
      title="Help Center"
      description="Get help with bookings, partner access, and common Famlo account questions."
      body={[
        "If you are a guest, use this page as a starting point for booking and account-related support.",
        "If you are a partner host or hommie, your dashboard support section remains the best place for operational help.",
        "This route is now available so your support navigation does not break while the full help center is being expanded.",
      ]}
    />
  );
}
