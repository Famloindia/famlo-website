"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { HomeCardRecord } from "@/lib/discovery";
import {
  DESTINATION_SEARCH_MIN_LENGTH,
  buildPopularDestinationSuggestions,
  getNextDestinationIndex,
  normalizeDestinationText,
  type DestinationSuggestion,
} from "@/lib/destination-autocomplete";

type DestinationAutocompleteProps = {
  homes: HomeCardRecord[];
  value: string;
  onValueChange: (value: string) => void;
  onSuggestionSelect: (suggestion: DestinationSuggestion) => void;
};

type DestinationSearchResponse = {
  suggestions?: DestinationSuggestion[];
};

function LocationPinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="destination-suggestion-icon">
      <path
        d="M12 21c4.2-5 6.3-8.5 6.3-11.1A6.3 6.3 0 1 0 5.7 9.9C5.7 12.5 7.8 16 12 21Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="9.9" r="2.5" fill="currentColor" />
    </svg>
  );
}

export default function DestinationAutocomplete({
  homes,
  value,
  onValueChange,
  onSuggestionSelect,
}: DestinationAutocompleteProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<DestinationSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = normalizeDestinationText(value);

  const popularSuggestions = useMemo(() => buildPopularDestinationSuggestions(homes), [homes]);
  const visibleSuggestions = normalizedQuery.length >= DESTINATION_SEARCH_MIN_LENGTH
    ? remoteSuggestions
    : popularSuggestions;
  const showEmptyState =
    isOpen &&
    normalizedQuery.length >= DESTINATION_SEARCH_MIN_LENGTH &&
    !isLoading &&
    visibleSuggestions.length === 0;
  const activeOptionId =
    activeIndex >= 0 && activeIndex < visibleSuggestions.length ? `${listboxId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapper.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (normalizedQuery.length < DESTINATION_SEARCH_MIN_LENGTH) {
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search/destinations?q=${encodeURIComponent(value.trim())}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as DestinationSearchResponse;
        if (!controller.signal.aborted) {
          setRemoteSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Destination autocomplete request failed.", error);
          setRemoteSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedQuery, value]);

  function commitSuggestion(suggestion: DestinationSuggestion) {
    onSuggestionSelect(suggestion);
    setActiveIndex(-1);
    setIsOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      className="homepage-search-field homepage-search-destination"
      onBlur={() => {
        window.setTimeout(() => {
          const activeElement = document.activeElement;
          if (!wrapperRef.current?.contains(activeElement)) {
            setIsOpen(false);
          }
        }, 0);
      }}
    >
      <span>City / destination</span>
      <input
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        autoComplete="off"
        name="q"
        placeholder="Manali, Goa, Jaipur..."
        role="combobox"
        type="search"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (normalizeDestinationText(nextValue).length < DESTINATION_SEARCH_MIN_LENGTH) {
            setRemoteSuggestions([]);
            setIsLoading(false);
          }
          onValueChange(nextValue);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => {
          setIsOpen(true);
          setActiveIndex(visibleSuggestions.length > 0 ? 0 : -1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => getNextDestinationIndex(current, 1, visibleSuggestions.length));
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => getNextDestinationIndex(current, -1, visibleSuggestions.length));
            return;
          }

          if (event.key === "Enter" && isOpen && visibleSuggestions.length > 0) {
            const suggestion = visibleSuggestions[activeIndex >= 0 ? activeIndex : 0];
            if (suggestion) {
              event.preventDefault();
              commitSuggestion(suggestion);
            }
            return;
          }

          if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
      />

      {isOpen && (isLoading || visibleSuggestions.length > 0 || showEmptyState) ? (
        <div className="destination-suggestions" role="listbox" id={listboxId} aria-label="Destination suggestions">
          {normalizedQuery.length < DESTINATION_SEARCH_MIN_LENGTH && visibleSuggestions.length > 0 ? (
            <div className="destination-suggestions-group">Popular destinations</div>
          ) : null}

          {isLoading ? (
            <div className="destination-suggestions-empty">Searching Famlo stays...</div>
          ) : null}

          {!isLoading
            ? visibleSuggestions.map((suggestion, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={`${suggestion.slug}-${suggestion.state ?? "na"}`}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={isActive ? "destination-suggestion is-active" : "destination-suggestion"}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commitSuggestion(suggestion)}
                  >
                    <LocationPinIcon />
                    <span className="destination-suggestion-copy">
                      <span className="destination-suggestion-title">{suggestion.name}</span>
                      <span className="destination-suggestion-meta">
                        {[suggestion.state, suggestion.country].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <span className="destination-suggestion-count">
                      {suggestion.propertyCount} stay{suggestion.propertyCount === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })
            : null}

          {showEmptyState ? (
            <div className="destination-suggestions-empty">No Famlo stays found for &quot;{value.trim()}&quot;</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
