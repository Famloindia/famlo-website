import { BasicInfoPage } from "@/components/system/BasicInfoPage";

export default function AboutPage(): React.JSX.Element {
  return (
    <BasicInfoPage
      eyebrow="Company"
      title="Our Story"
      description="Famlo helps travelers book real hosted homes and trusted local connections across India."
      body={[
        "Famlo is built around the idea that travel feels better when it is rooted in real people, not anonymous inventory.",
        "We work with hosts, guides, and local partners to make cultural stays and neighborhood experiences easier to discover and safer to book.",
        "This page is now live so users do not hit a broken link while the full brand story is being expanded.",
      ]}
    />
  );
}
