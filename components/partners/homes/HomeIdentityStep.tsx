// components/partners/homes/HomeIdentityStep.tsx

import type { HomeOnboardingFlowState } from "@/components/partners/HomeOnboardingForm";

interface StepProps {
  flow: HomeOnboardingFlowState;
  update: <K extends keyof HomeOnboardingFlowState>(
    key: K,
    value: HomeOnboardingFlowState[K]
  ) => void;
}

export function HomeIdentityStep({ flow, update }: Readonly<StepProps>): React.JSX.Element {
  return (
    <div className="grid two-up dashboard-grid">
      <section className="panel detail-box">
        <h2>Identity</h2>
        <div className="dashboard-form-grid">
          <label>
            <span>Full name</span>
            <input className="text-input" value={flow.fullName} onChange={(event) => update("fullName", event.target.value)} />
          </label>
          <label>
            <span>Phone</span>
            <input className="text-input" value={flow.mobileNumber} onChange={(event) => update("mobileNumber", event.target.value)} />
          </label>
          <label>
            <span>Email</span>
            <input className="text-input" value={flow.email} onChange={(event) => update("email", event.target.value)} />
          </label>
          <label>
            <span>State</span>
            <input className="text-input" value={flow.state} onChange={(event) => update("state", event.target.value)} />
          </label>
          <label>
            <span>City</span>
            <input className="text-input" value={flow.cityName} onChange={(event) => update("cityName", event.target.value)} />
          </label>
          <label>
            <span>Village / locality</span>
            <input className="text-input" value={flow.villageName} onChange={(event) => update("villageName", event.target.value)} />
          </label>
          <label>
            <span>Neighbourhood</span>
            <input className="text-input" value={flow.cityNeighbourhood} onChange={(event) => update("cityNeighbourhood", event.target.value)} />
          </label>
          <label>
            <span>Host profession</span>
            <input className="text-input" value={flow.hostProfession} onChange={(event) => update("hostProfession", event.target.value)} />
          </label>
          <label>
            <span>Family composition</span>
            <input className="text-input" value={flow.familyComposition} onChange={(event) => update("familyComposition", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel detail-box">
        <h2>Why this matters</h2>
        <ul>
          <li>This sets up the Home host identity for the onboarding draft.</li>
          <li>These details later support the shared publish flow into live records.</li>
          <li>City and state help Homes show in the correct public location context.</li>
        </ul>
      </section>
    </div>
  );
}