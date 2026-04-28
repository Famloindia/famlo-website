import { BasicInfoPage } from "@/components/system/BasicInfoPage";

export default function CareersPage(): React.JSX.Element {
  return (
    <BasicInfoPage
      eyebrow="Company"
      title="Careers"
      description="Famlo is still shaping the team and this page will grow as hiring opens up."
      body={[
        "We are building travel experiences that feel local, warm, and useful from the first click.",
        "If you want to collaborate with Famlo before formal roles are published, please use the contact page for now.",
        "This page now exists to prevent broken navigation from the footer.",
      ]}
    />
  );
}
