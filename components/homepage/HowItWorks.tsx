const travelerSteps = [
  {
    number: "01",
    title: "Apply to join Famlo",
    description:
      "Families and City Buddies share who they are, where they are based, and how they want to welcome travelers."
  },
  {
    number: "02",
    title: "We review every profile",
    description:
      "Our team manually reviews submissions, checks fit, and approves only the people who match Famlo's standard of trust."
  },
  {
    number: "03",
    title: "Travel with local connection",
    description:
      "Approved families and friends create a warmer experience for travelers looking for culture, care, and genuine local guidance."
  }
] as const;

export function HowItWorks(): JSX.Element {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="max-w-2xl space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-famloBlue">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-famloText sm:text-4xl">
            A simple path to more meaningful travel.
          </h2>
          <p className="text-base leading-7 text-slate-600">
            Famlo is designed to make cultural stays feel approachable and
            trustworthy from the very beginning.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {travelerSteps.map((step) => (
            <article
              key={step.number}
              className="rounded-[28px] border border-slate-200 bg-[#FCFEFF] p-8 shadow-[0_16px_50px_rgba(15,23,42,0.04)]"
            >
              <p className="text-sm font-semibold tracking-[0.2em] text-famloBlue">
                {step.number}
              </p>
              <h3 className="mt-5 text-xl font-semibold text-famloText">
                {step.title}
              </h3>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
