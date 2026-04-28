// components/partners/homes/HomeReviewPublishStep.tsx

import type { HomeOnboardingFlowState } from "@/components/partners/HomeOnboardingForm";

interface StepProps {
  flow: HomeOnboardingFlowState;
  photoList: string[];
}

function showText(value: string): string {
  return value.trim() || "Pending";
}

export function HomeReviewPublishStep({
  flow,
  photoList
}: Readonly<StepProps>): React.JSX.Element {
  return (
    <div className="grid two-up dashboard-grid">
      <section className="panel detail-box">
        <h2>Review your Home</h2>
        <ul>
          <li>Host: {showText(flow.fullName)}</li>
          <li>Email: {showText(flow.email)}</li>
          <li>Phone: {showText(flow.mobileNumber)}</li>
          <li>Home name: {showText(flow.propertyName)}</li>
          <li>Address: {showText(flow.propertyAddress)}</li>
          <li>City / state: {[flow.cityName, flow.state].filter(Boolean).join(", ") || "Pending"}</li>
          <li>Room type: {showText(flow.roomType)}</li>
          <li>Max guests: {showText(flow.maxGuests)}</li>
          <li>Languages: {showText(flow.languages)}</li>
          <li>Photos added: {photoList.length}</li>
        </ul>
      </section>

      <section className="panel detail-box">
        <h2>Review and publish</h2>
        <p>
          When you submit, Famlo will check whether your Home is complete enough to go live instantly.
        </p>
        <ul>
          <li>If required details are complete, your Home can go live.</li>
          <li>If something important is missing, you will see what to fix.</li>
          <li>Otherwise your Home can stay under review.</li>
        </ul>

        <div className="dashboard-form-grid">
          <label>
            <span>Account holder</span>
            <input className="text-input" value={flow.accountHolderName} readOnly />
          </label>
          <label>
            <span>IFSC code</span>
            <input className="text-input" value={flow.ifscCode} readOnly />
          </label>
          <label>
            <span>Bank name</span>
            <input className="text-input" value={flow.bankName} readOnly />
          </label>
          <label>
            <span>Account number</span>
            <input className="text-input" value={flow.accountNumber} readOnly />
          </label>
        </div>
      </section>
    </div>
  );
}