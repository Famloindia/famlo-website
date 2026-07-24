// components/partners/homes/HomeListingDetailsStep.tsx

import type { HomeOnboardingFlowState } from "@/components/partners/HomeOnboardingForm";

interface StepProps {
  flow: HomeOnboardingFlowState;
  update: <K extends keyof HomeOnboardingFlowState>(
    key: K,
    value: HomeOnboardingFlowState[K]
  ) => void;
}

export function HomeListingDetailsStep({
  flow,
  update
}: Readonly<StepProps>): React.JSX.Element {
  return (
    <div className="grid two-up dashboard-grid">
      <section className="panel detail-box">
        <h2>Listing details</h2>
        <div className="dashboard-form-grid">
          <label className="full-span">
            <span>Host bio</span>
            <textarea className="text-area" value={flow.hostBio} onChange={(event) => update("hostBio", event.target.value)} />
          </label>
          <label className="full-span">
            <span>Cultural offering</span>
            <textarea className="text-area" value={flow.culturalActivity} onChange={(event) => update("culturalActivity", event.target.value)} />
          </label>
          <label className="full-span">
            <span>My journey</span>
            <textarea className="text-area" value={flow.journeyStory} onChange={(event) => update("journeyStory", event.target.value)} />
          </label>
          <label className="full-span">
            <span>My special place</span>
            <textarea className="text-area" value={flow.specialExperience} onChange={(event) => update("specialExperience", event.target.value)} />
          </label>
          <label className="full-span">
            <span>My local experience</span>
            <textarea className="text-area" value={flow.localExperience} onChange={(event) => update("localExperience", event.target.value)} />
          </label>
          <label className="full-span">
            <span>Amenities</span>
            <input className="text-input" placeholder="WiFi, parking, local meal" value={flow.amenities} onChange={(event) => update("amenities", event.target.value)} />
          </label>
          <label className="full-span">
            <span>Included items</span>
            <input className="text-input" placeholder="Breakfast, tea, guided walk" value={flow.includedItems} onChange={(event) => update("includedItems", event.target.value)} />
          </label>
          <label className="full-span">
            <span>Common-area access</span>
            <input className="text-input" placeholder="Living room, courtyard, terrace" value={flow.commonAreas} onChange={(event) => update("commonAreas", event.target.value)} />
          </label>
          <label className="full-span">
            <span>Food types</span>
            <input className="text-input" placeholder="Vegetarian, vegan" value={flow.foodTypes} onChange={(event) => update("foodTypes", event.target.value)} />
          </label>
          <label>
            <span>Languages</span>
            <input className="text-input" value={flow.languages} onChange={(event) => update("languages", event.target.value)} />
          </label>
          <label>
            <span>Bathroom type</span>
            <input className="text-input" value={flow.bathroomType} onChange={(event) => update("bathroomType", event.target.value)} />
          </label>
          <label>
            <span>Check-in time</span>
            <input className="text-input" type="time" value={flow.checkInTime} onChange={(event) => update("checkInTime", event.target.value)} />
          </label>
          <label>
            <span>Check-out time</span>
            <input className="text-input" type="time" value={flow.checkOutTime} onChange={(event) => update("checkOutTime", event.target.value)} />
          </label>
          <label className="full-span">
            <span>House rules</span>
            <textarea className="text-area" placeholder="No smoking, quiet after 10 PM" value={flow.customRules} onChange={(event) => update("customRules", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel detail-box">
        <h2>Pricing</h2>
        <div className="dashboard-form-grid">
          <label>
            <span>Full day price</span>
            <input className="text-input" value={flow.baseNightlyRate} onChange={(event) => update("baseNightlyRate", event.target.value)} />
          </label>
          <label>
            <span>Morning price</span>
            <input className="text-input" value={flow.morningRate} onChange={(event) => update("morningRate", event.target.value)} />
          </label>
          <label>
            <span>Afternoon price</span>
            <input className="text-input" value={flow.afternoonRate} onChange={(event) => update("afternoonRate", event.target.value)} />
          </label>
          <label>
            <span>Evening price</span>
            <input className="text-input" value={flow.eveningRate} onChange={(event) => update("eveningRate", event.target.value)} />
          </label>
        </div>
      </section>
    </div>
  );
}
