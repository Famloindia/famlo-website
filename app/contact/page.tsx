import { BasicInfoPage } from "@/components/system/BasicInfoPage";

export default function ContactPage(): React.JSX.Element {
  return (
    <BasicInfoPage
      eyebrow="Support"
      title="Contact Us"
      description="Reach Famlo for support, partnership questions, and general product help."
      body={[
        "You can use this route as the contact landing page until a richer support form and inbox flow are added.",
        "For partner-specific help, the dashboard support section remains available inside the partner portal.",
        "This page now exists so footer and public navigation links no longer lead to a 404.",
      ]}
    />
  );
}
