// components/partners/homes/HomePropertyBasicsStep.tsx

import type { HomeOnboardingFlowState } from "@/components/partners/HomeOnboardingForm";

interface StepProps {
  flow: HomeOnboardingFlowState;
  update: <K extends keyof HomeOnboardingFlowState>(
    key: K,
    value: HomeOnboardingFlowState[K]
  ) => void;
}

export function HomePropertyBasicsStep({
  flow,
  update
}: Readonly<StepProps>): React.JSX.Element {
  return (
    <div className="grid two-up dashboard-grid">
      <section className="panel detail-box">
        <h2>Property basics</h2>
        <div className="dashboard-form-grid">
          <label>
            <span>Home name</span>
            <input className="text-input" value={flow.propertyName} onChange={(event) => update("propertyName", event.target.value)} />
          </label>
          <label>
            <span>Room type</span>
            <input className="text-input" value={flow.roomType} onChange={(event) => update("roomType", event.target.value)} />
          </label>
          <label>
            <span>Max guests</span>
            <input className="text-input" value={flow.maxGuests} onChange={(event) => update("maxGuests", event.target.value)} />
          </label>
          <label>
            <span>Neighbourhood / locality</span>
            <input className="text-input" value={flow.cityNeighbourhood} onChange={(event) => update("cityNeighbourhood", event.target.value)} />
          </label>
          <label className="full-span">
            <span>Property address</span>
            <input className="text-input" value={flow.propertyAddress} onChange={(event) => update("propertyAddress", event.target.value)} />
          </label>
          <label className="full-span">
            <span>Google Maps link</span>
            <input className="text-input" value={flow.googleMapsLink} onChange={(event) => update("googleMapsLink", event.target.value)} />
          </label>
          <label>
            <span>Latitude</span>
            <input className="text-input" value={flow.latitude} onChange={(event) => update("latitude", event.target.value)} />
          </label>
          <label>
            <span>Longitude</span>
            <input className="text-input" value={flow.longitude} onChange={(event) => update("longitude", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel detail-box">
        <h2>What this supports</h2>
        <ul>
          <li>Home name and address power the public listing.</li>
          <li>Location details help map later to live `families` records.</li>
          <li>Guest capacity and room type help search and booking later.</li>
        </ul>
      </section>
    </div>
  );
}