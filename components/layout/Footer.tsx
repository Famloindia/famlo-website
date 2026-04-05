// FILE: components/layout/Footer.tsx
import Link from "next/link";

export function Footer(): JSX.Element {
  return (
    <footer className="border-t-[0.5px] border-[#E8EEF5] bg-white">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-3 px-6 py-5 text-sm text-[#6B7A99] sm:flex-row sm:items-center sm:justify-between">
        <p className="font-[family:var(--font-playfair)] text-[16px] text-[#1A6EBB]">
          famlo
        </p>
        <div className="flex items-center gap-4">
          <span className="text-[#1A1A2E]">join us.</span>
          <Link href="/home/partoffamlo" className="transition hover:text-[#1A6EBB]">
            Home
          </Link>
          <Link href="/hommie/partoffamlo" className="transition hover:text-[#1A6EBB]">
            Hommie
          </Link>
        </div>
      </div>
    </footer>
  );
}
