const experienceTypes = [
  {
    name: "Famlo Stays",
    description:
      "A combined stay layer for homestays and Famlo Homes, designed for people who want trusted local accommodation beyond standard hotels.",
    accentClassName: "bg-[#EAF5FF]"
  },
  {
    name: "Famlo Visits",
    description:
      "Hosted cultural time with real families, traditions, rituals, and neighborhood stories that make travel feel rooted and personal.",
    accentClassName: "bg-white"
  },
  {
    name: "CityBuddy",
    description:
      "Friendly local companionship for exploring neighborhoods, customs, and everyday city life with more confidence.",
    accentClassName: "bg-[#F5FAFF]"
  }
] as const;

export function ExperienceTypes(): JSX.Element {
  return (
    <section className="bg-famloBlueLight py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-famloBlue">
              Experience types
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-famloText sm:text-4xl">
              Different ways to belong wherever you go.
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-slate-600">
            Famlo now brings its three core services together: Famlo Visits,
            CityBuddy companionship, and Famlo Stays for people looking for a
            more local, more human travel experience.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {experienceTypes.map((experience) => (
            <article
              key={experience.name}
              className={`rounded-[30px] border border-[#D4E5F6] p-8 shadow-[0_20px_60px_rgba(26,110,187,0.08)] ${experience.accentClassName}`}
            >
              <div className="inline-flex rounded-full border border-[#CDE0F4] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-famloBlue">
                Famlo format
              </div>
              <h3 className="mt-6 text-2xl font-semibold text-famloText">
                {experience.name}
              </h3>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {experience.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
