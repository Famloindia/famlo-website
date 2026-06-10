// components/partners/homes/HomePhotosTrustStep.tsx

import type { HomeOnboardingFlowState } from "@/components/partners/HomeOnboardingForm";

interface StepProps {
  flow: HomeOnboardingFlowState;
  photoList: string[];
  uploadingPhotos: boolean;
  update: <K extends keyof HomeOnboardingFlowState>(
    key: K,
    value: HomeOnboardingFlowState[K]
  ) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onPhotosChange: (nextPhotos: string[]) => void;
}

export function HomePhotosTrustStep({
  flow,
  photoList,
  uploadingPhotos,
  update,
  onUpload,
  onPhotosChange
}: Readonly<StepProps>): React.JSX.Element {
  return (
    <div className="grid two-up dashboard-grid">
      <section className="panel detail-box">
        <h2>Photos</h2>
        <div className="dashboard-form-grid">
          <label className="full-span">
            <span>Photo URLs</span>
            <textarea className="text-area" value={flow.photos} onChange={(event) => update("photos", event.target.value)} />
          </label>
          <label className="full-span">
            <span>Upload Home photos</span>
            <input
              accept="image/*"
              className="text-input"
              multiple
              onChange={(event) => void onUpload(event)}
              type="file"
            />
          </label>
        </div>

        <p>{uploadingPhotos ? "Uploading Home photos..." : "Upload up to 5 Home photos."}</p>

        {photoList.length > 0 ? (
          <div className="submission-photos">
            {photoList.map((photo, index) => (
              <img alt={`Home photo ${index + 1}`} key={`${photo}-${index}`} src={photo} />
            ))}
          </div>
        ) : (
          <p>No Home photos added yet.</p>
        )}
      </section>

      <section className="panel detail-box">
        <h2>Photos and trust</h2>
        <div className="dashboard-form-grid">
          <label className="toggle-row full-span">
            <span>I confirm these Home details are accurate</span>
            <input
              checked={flow.complianceAcknowledgement}
              onChange={(event) => update("complianceAcknowledgement", event.target.checked)}
              type="checkbox"
            />
          </label>

          <label className="full-span">
            <span>Compliance notes / acknowledgement</span>
            <textarea className="text-area" value={flow.complianceNotes} onChange={(event) => update("complianceNotes", event.target.value)} />
          </label>

          <label>
            <span>Aadhaar number</span>
            <input className="text-input" value={flow.aadhaarNumber} onChange={(event) => update("aadhaarNumber", event.target.value)} />
          </label>

          <label>
            <span>PAN number</span>
            <input className="text-input" value={flow.panNumber} onChange={(event) => update("panNumber", event.target.value)} />
          </label>
        </div>

        <ul>
          <li>Photos improve trust and live readiness.</li>
          <li>These fields can later support review and compliance handling.</li>
          <li>Uploaded photos should ultimately connect to live `family_photos` records.</li>
        </ul>
      </section>
    </div>
  );
}