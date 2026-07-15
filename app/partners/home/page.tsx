// app/partners/home/page.tsx
import { HomeOnboardingForm } from "@/components/partners/HomeOnboardingForm";

export const dynamic = "force-dynamic";

export default function HomeOnboardingPage() {
  return (
    <main className="shell">
      <div className="section-padding">
        <HomeOnboardingForm />
      </div>
    </main>
  );
}