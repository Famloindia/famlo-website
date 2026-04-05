"use client";

// FILE: components/SearchBar.tsx
interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
}

export function SearchBar({
  query,
  onQueryChange,
  onSubmit
}: SearchBarProps): JSX.Element {
  return (
    <section className="border-b-[0.5px] border-[#E8EEF5] bg-white">
      <div className="mx-auto flex w-full max-w-[1320px] px-6 py-4">
        <form
          className="flex w-full items-center gap-3 rounded-full border-[0.5px] border-[#E8EEF5] bg-white px-4 py-3 shadow-[0_12px_30px_rgba(26,110,187,0.08)]"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-[#6B7A99]" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search city, area or village..."
            className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-[#1A1A2E] outline-none placeholder:text-[#6B7A99]"
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#1A6EBB] px-5 text-sm font-medium text-white transition hover:bg-[#155d9f]"
          >
            Search
          </button>
        </form>
      </div>
    </section>
  );
}
