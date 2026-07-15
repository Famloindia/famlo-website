import HomestayOnboardingFlow from "@/components/partners/HomestayOnboardingFlow";

export const metadata = {
  title: "Become a Home Host | Famlo",
  description: "Join as a homestay host. Verify your identity, build your host profile, and submit your home for review."
};

export default function JoinHomesPage() {
  return (
    <main>
      <HomestayOnboardingFlow />
    </main>
  );
}
