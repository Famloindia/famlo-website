import { BasicInfoPage } from "@/components/system/BasicInfoPage";

export default function PrivacyPage(): React.JSX.Element {
  return (
    <BasicInfoPage
      eyebrow="Legal"
      title="Privacy Policy"
      description="Famlo uses this page as the live privacy policy destination while fuller legal copy is prepared."
      body={[
        "This route now exists so privacy links have a valid destination in production.",
        "It can be expanded with your final legal text without changing the public URL again later.",
        "For now, this removes the broken-link experience and gives users a stable privacy-policy path.",
      ]}
    />
  );
}
