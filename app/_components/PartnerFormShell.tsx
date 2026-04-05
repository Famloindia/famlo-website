import type { ReactNode } from "react";

interface PartnerFormShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function PartnerFormShell({
  eyebrow,
  title,
  description,
  children
}: Readonly<PartnerFormShellProps>): JSX.Element {
  return (
    <section className="px-6 py-12 sm:py-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">
            {eyebrow}
          </p>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[#1f2937] sm:text-5xl">
              {title}
            </h1>
            <p className="max-w-xl text-base leading-7 text-[#52606d] sm:text-lg">
              {description}
            </p>
          </div>
          <div className="rounded-[28px] border border-white/70 bg-white/70 p-6 text-sm leading-7 text-[#52606d] shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
            After admin approval, the partner receives a user ID and password.
            That login can be used later when we build their dashboard and site.
          </div>
        </div>
        <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
          {children}
        </div>
      </div>
    </section>
  );
}
