"use client";

interface ResetPageProps {
  title: string;
  description: string;
}

export function ResetPage({
  title,
  description
}: Readonly<ResetPageProps>): JSX.Element {
  return (
    <section className="flex min-h-screen items-center px-6 py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 rounded-[32px] border border-white/60 bg-white/75 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur md:p-12">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">
            Famlo Rebuild Mode
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-[#1f2937] sm:text-5xl">
            {title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-[#52606d] sm:text-lg">
            {description}
          </p>
        </div>

        <div className="grid gap-4 rounded-[24px] border border-[#e8dcc8] bg-[#fffaf2] p-6 text-sm text-[#6b7280] md:grid-cols-3">
          <div>
            <p className="font-semibold text-[#1f2937]">Current status</p>
            <p className="mt-2">The old interface has been cleared from this route.</p>
          </div>
          <div>
            <p className="font-semibold text-[#1f2937]">Next step</p>
            <p className="mt-2">We can redesign and build this page from scratch.</p>
          </div>
          <div>
            <p className="font-semibold text-[#1f2937]">Working style</p>
            <p className="mt-2">One route at a time, with a clean baseline underneath.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
