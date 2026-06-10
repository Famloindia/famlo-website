//app/partners/hommies/page.tsx

import Link from "next/link";

import { HommieOnboardingForm } from "@/components/partners/HommieOnboardingForm";

export const dynamic = "force-dynamic";

export default function PartnerHommiesPage(): React.JSX.Element {
  return (
    <main className="shell">
      <section className="panel dashboard-shell">
        <div className="dashboard-header">
          <div>
            <span className="eyebrow">Famlo hommies</span>
            <h1>Apply as a local Famlo hommie</h1>
            <p>
              Tell us about your city, how you help travelers, and the kinds of experiences or support
              you can offer.
            </p>
          </div>
          <div className="dashboard-links">
            <Link href="/">Public homepage</Link>
            <Link href="/partners/login">Partner login</Link>
          </div>
        </div>

        <HommieOnboardingForm />
      </section>
    </main>
  );
}
