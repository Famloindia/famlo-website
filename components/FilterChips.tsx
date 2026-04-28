"use client";

// FILE: components/FilterChips.tsx
const chips = [
  "All",
  "Morning slot",
  "Afternoon slot",
  "Evening slot",
  "Full day",
  "Meals included",
  "Verified only",
  "Under ₹500"
] as const;

interface FilterChipsProps {
  activeChip: string;
  onChipChange: (chip: string) => void;
}

export function FilterChips({
  activeChip,
  onChipChange
}: FilterChipsProps): JSX.Element {
  return (
    <section className="bg-[#F8FAFD]">
      <div className="mx-auto w-full max-w-[1320px] overflow-x-auto px-6 py-5">
        <div className="flex min-w-max items-center gap-2">
          {chips.map((chip) => {
            const isActive = activeChip === chip;

            return (
              <button
                key={chip}
                type="button"
                onClick={() => onChipChange(chip)}
                className={`rounded-[10px] border-[0.5px] px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-[#1A6EBB] bg-[#EBF4FF] text-[#1A6EBB]"
                    : "border-[#E8EEF5] bg-white text-[#6B7A99]"
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
