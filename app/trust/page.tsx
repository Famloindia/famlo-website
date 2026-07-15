import { BasicInfoPage } from "@/components/system/BasicInfoPage";

export default function TrustPage(): React.JSX.Element {
  return (
    <BasicInfoPage
      eyebrow="Safety"
      title="Trust & Safety"
      description="Famlo aims to make every stay and local connection more transparent, verified, and accountable."
      body={[
        "We structure listings so guests see public details first while sensitive information stays protected until booking steps are complete.",
        "Partner dashboards, compliance workflows, and approval steps are designed to support safer onboarding over time.",
        "This route now exists so your footer no longer leads to a 404 while the detailed trust center is still being built.",
      ]}
    />
  );
}
