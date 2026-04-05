"use client";

// FILE: components/QuarterModal.tsx
import { useEffect, useMemo, useState } from "react";

import type { ListingItem, ListingQuarter } from "./HomeCard";

interface QuarterModalProps {
  listing: ListingItem | null;
  isOpen: boolean;
  onClose: () => void;
}

const quarterAccent: Record<ListingQuarter["key"], string> = {
  morning: "bg-[#FFF4DD] text-[#9A5B00]",
  afternoon: "bg-[#EBF4FF] text-[#1A6EBB]",
  evening: "bg-[#FFEAF1] text-[#B83280]",
  fullday: "bg-[#EAFBF0] text-[#15803D]"
};

function getNextSevenDays(): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + index);
    return nextDate;
  });
}

function formatDateKey(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function Icon({
  path,
  className
}: {
  path: JSX.Element;
  className: string;
}): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      {path}
    </svg>
  );
}

export function QuarterModal({
  listing,
  isOpen,
  onClose
}: QuarterModalProps): JSX.Element | null {
  const dates = useMemo(() => getNextSevenDays(), []);
  const [selectedDate, setSelectedDate] = useState<string>(formatDateKey(dates[0]));
  const [selectedQuarterKey, setSelectedQuarterKey] = useState<ListingQuarter["key"] | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedDate(formatDateKey(dates[0]));
    setSelectedQuarterKey(null);
  }, [dates, isOpen, listing]);

  if (!isOpen || !listing) {
    return null;
  }

  const isDateBlocked = listing.blockedDates.includes(selectedDate);
  const quarterCards = listing.quarterTags.map((quarter) => ({
    ...quarter,
    available: quarter.available && !isDateBlocked
  }));
  const selectedQuarter =
    quarterCards.find((quarter) => quarter.key === selectedQuarterKey) ?? null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1A1A2E]/55 px-4 py-8">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[18px] border-[0.5px] border-[#E8EEF5] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#1A1A2E] shadow-sm"
        >
          <Icon className="h-4.5 w-4.5" path={<path d="M6 6 18 18M18 6 6 18" />} />
        </button>

        <div className="relative h-56 bg-gradient-to-br from-[#D7E8FF] via-[#EAF4FF] to-[#F8FAFD]">
          {listing.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.image}
              alt={listing.name}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>

        <div className="space-y-6 p-6">
          <div className="space-y-2">
            <h2 className="font-[family:var(--font-playfair)] text-[18px] font-medium text-[#1A1A2E]">
              {listing.name}
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-[14px] text-[#6B7A99]">
              <span className="inline-flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-[#1A6EBB]" path={<><path d="M12 21s6-5.45 6-11a6 6 0 1 0-12 0c0 5.55 6 11 6 11Z" /><circle cx="12" cy="10" r="2.5" /></>} />
                {listing.area}, {listing.city}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[#1A1A2E]">
                  <Icon className="h-4 w-4 fill-current" path={<path d="m12 3.75 2.55 5.17 5.7.83-4.13 4.03.97 5.67L12 16.77l-5.09 2.68.97-5.67L3.75 9.75l5.7-.83L12 3.75Z" />} />
                </span>
                {listing.rating.toFixed(1)} · {listing.reviewCount} reviews
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[#1A1A2E]">
              <Icon className="h-4 w-4 text-[#1A6EBB]" path={<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>} />
              <span>Pick a day</span>
            </div>
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2 pb-1">
                {dates.map((date) => {
                  const dateKey = formatDateKey(date);
                  const isSelected = selectedDate === dateKey;

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setSelectedDate(dateKey)}
                      className={`rounded-[10px] border-[0.5px] px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-[#1A6EBB] bg-[#EBF4FF]"
                          : "border-[#E8EEF5] bg-white"
                      }`}
                    >
                      <p className="text-xs text-[#6B7A99]">
                        {date.toLocaleDateString("en-IN", { weekday: "short" })}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#1A1A2E]">
                        {date.toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric"
                        })}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[#1A1A2E]">
              <Icon className="h-4 w-4 text-[#1A6EBB]" path={<><circle cx="12" cy="12" r="8" /><path d="M12 7.5v4.5l3 1.5" /></>} />
              <span>Choose a quarter</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {quarterCards.map((quarter) => {
                const isSelected = selectedQuarterKey === quarter.key;

                return (
                  <button
                    key={quarter.key}
                    type="button"
                    disabled={!quarter.available}
                    onClick={() => setSelectedQuarterKey(quarter.key)}
                    className={`rounded-[14px] border-[0.5px] p-4 text-left transition ${
                      !quarter.available
                        ? "cursor-not-allowed border-[#E8EEF5] bg-[#F4F7FB] opacity-60"
                        : isSelected
                          ? "border-[#1A6EBB] bg-[#EBF4FF]"
                          : "border-[#E8EEF5] bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${quarterAccent[quarter.key]}`}>
                        <Icon className="h-4 w-4" path={<><circle cx="12" cy="12" r="8" /><path d="M12 7.5v4.5l3 1.5" /></>} />
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          quarter.available ? "text-[#22C55E]" : "text-[#EF4444]"
                        }`}
                      >
                        {quarter.available ? "Available" : "Booked"}
                      </span>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      <p className="text-[15px] font-medium text-[#1A1A2E]">
                        {quarter.label}
                      </p>
                      <p className="text-[13px] text-[#6B7A99]">{quarter.timeRange}</p>
                      <p className="text-[14px] font-medium text-[#1A1A2E]">
                        ₹{quarter.price.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t-[0.5px] border-[#E8EEF5] bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[15px] font-medium text-[#1A1A2E]">
              {selectedQuarter
                ? `₹${selectedQuarter.price.toLocaleString("en-IN")} · ${selectedQuarter.label}`
                : "Select a quarter"}
            </p>
            <p className="mt-1 text-xs text-[#6B7A99]">
              {selectedQuarter ? `${selectedQuarter.timeRange} · 18% Famlo fee included` : "18% Famlo fee included"}
            </p>
          </div>
          <button
            type="button"
            disabled={!selectedQuarter}
            onClick={() => {
              if (!selectedQuarter) {
                return;
              }

              const basePath =
                listing.kind === "home" ? `/homes/${listing.slug}` : `/hommies/${listing.slug}`;
              const bookingUrl = `${basePath}?date=${selectedDate}&quarter=${selectedQuarter.key}`;
              window.location.href = bookingUrl;
            }}
            className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#1A6EBB] px-6 text-sm font-medium text-white transition hover:bg-[#155d9f] disabled:cursor-not-allowed disabled:bg-[#B8D4F0]"
          >
            Book now
          </button>
        </div>
      </div>
    </div>
  );
}
