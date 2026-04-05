import type { StoryPreview } from "../../lib/stories";

interface StoriesSectionProps {
  stories: StoryPreview[];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function StoriesSection({
  stories
}: StoriesSectionProps): JSX.Element | null {
  if (stories.length === 0) {
    return null;
  }

  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-famloBlue">
              Stories
            </p>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-famloText sm:text-4xl">
              Living experiences shared by real travelers.
            </h2>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Famlo is a professional living experience platform built around
              trust, hospitality, and stories that help future guests choose
              with confidence.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {stories.map((story) => (
            <article
              key={story.id}
              className="rounded-[30px] border border-[#D5E7F8] bg-[#F8FBFF] p-7 shadow-[0_20px_60px_rgba(26,110,187,0.08)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-famloText">
                    {story.author_name || "Famlo guest"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {story.from_city || "India"} · {formatDate(story.created_at)}
                  </p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-famloBlue">
                  {story.rating ? `${story.rating.toFixed(1)} / 5` : "Guest story"}
                </div>
              </div>
              <p className="mt-5 line-clamp-6 text-sm leading-7 text-slate-600">
                {story.story_text || "A thoughtful Famlo experience shared by a traveler."}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
