// app/hommies/[id]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { HommieContactPreview } from "@/components/public/HommieContactPreview";
import { getCompanionDetail } from "@/lib/discovery";

export const dynamic = "force-dynamic";

interface HommieDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function HommieDetailPage({
  params
}: Readonly<HommieDetailPageProps>): Promise<React.JSX.Element> {
  const { id } = await params;
  const companion = await getCompanionDetail(id);

  if (!companion || !companion.isActive) {
    notFound();
  }

  const publicLocation = [companion.city, companion.state].filter(Boolean).join(", ");

  return (
    <main className="shell">
      <section className="panel detail-page">
        <div className="detail-topbar">
          <Link href="/hommies">Back to Hommies</Link>
          <span className="status">Active Hommie</span>
        </div>

        <div className="detail-grid">
          {/* PHOTO */}
          <div className="detail-gallery">
            {companion.imageUrl ? (
              <div className="detail-image-frame">
                <img src={companion.imageUrl} alt={companion.title} />
              </div>
            ) : (
              <div className="detail-image-frame detail-image-fallback" />
            )}
          </div>

          {/* CONTENT */}
          <div className="detail-copy">
            <span className="eyebrow">
              Hommie
            </span>
            <h1>{companion.title}</h1>
            <p className="detail-subtitle">{publicLocation || "Famlo hommie"}</p>

            {companion.description && (
              <p className="detail-description">{companion.description}</p>
            )}

            {/* PRICING */}
            {(companion.hourlyPrice || companion.nightlyPrice) && (
              <div className="panel detail-box">
                <h2>Pricing</h2>
                {companion.hourlyPrice && (
                  <div className="quarter-row">
                    <span>Per hour</span>
                    <strong>₹{companion.hourlyPrice}</strong>
                  </div>
                )}
                {companion.nightlyPrice && (
                  <div className="quarter-row">
                    <span>Per night</span>
                    <strong>₹{companion.nightlyPrice}</strong>
                  </div>
                )}
              </div>
            )}

            {/* ACTIVITIES & LANGUAGES */}
            <div className="detail-columns">
              {companion.activities.length > 0 && (
                <div className="panel detail-box">
                  <h2>Activities</h2>
                  <ul>{companion.activities.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
              )}
              {companion.languages.length > 0 && (
                <div className="panel detail-box">
                  <h2>Languages</h2>
                  <ul>{companion.languages.map((l) => <li key={l}>{l}</li>)}</ul>
                </div>
              )}
            </div>

            {/* BOOKING */}
            <HommieContactPreview
              companionId={companion.id}
              companionTitle={companion.title}
              publicLocation={publicLocation}
              activities={companion.activities}
              hourlyPrice={companion.hourlyPrice}
              nightlyPrice={companion.nightlyPrice}
              guideId={companion.guideId}
              guideUserId={companion.guideUserId}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
