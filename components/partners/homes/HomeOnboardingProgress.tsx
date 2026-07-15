// components/partners/homes/HomeOnboardingProgress.tsx

const STEPS = [
  "Identity",
  "Property basics",
  "Listing details",
  "Photos and trust",
  "Review and publish"
];

export function HomeOnboardingProgress({
  currentStep
}: Readonly<{ currentStep: number }>): React.JSX.Element {
  return (
    <div className="panel detail-box" style={{ marginBottom: "1rem" }}>
      <div className="dashboard-form-grid">
        {STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const isCurrent = currentStep === stepNumber;
          const isDone = currentStep > stepNumber;

          return (
            <div key={label}>
              <span className="eyebrow">{isDone ? "Done" : isCurrent ? "Current" : "Next"}</span>
              <p style={{ fontWeight: isCurrent ? 700 : 500 }}>
                {stepNumber}. {label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}