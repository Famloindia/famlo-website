import { BasicInfoPage } from "@/components/system/BasicInfoPage";

export default function LegalPage(): React.JSX.Element {
  return (
    <BasicInfoPage
      eyebrow="Legal"
      title="Privacy & Terms"
      description="Famlo legal pages are being organized into clearer sections for privacy, terms, and support responsibilities."
      body={[
        "This route acts as the legal landing page so users have a working destination from the footer.",
        "You can now branch users from here into more detailed legal content as those pages are expanded.",
        "The dedicated privacy route is also available so legal links stop producing 404 errors.",
      ]}
    />
  );
}
