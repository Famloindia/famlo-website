"use client";

import { useState } from "react";

import type {
  AdminManagedFamily,
  AdminManagedFriend,
  Hommie
} from "../../lib/types";

type EntityType = "family" | "friend" | "hommie";
type EditableProfile = AdminManagedFamily | AdminManagedFriend | Hommie;

interface ProfileControlEditorProps {
  entityType: EntityType;
  profile: EditableProfile;
}

type FormState = Record<string, string | boolean | undefined>;

function joinList(values: string[] | null | undefined): string {
  return values?.join(", ") ?? "";
}

export function ProfileControlEditor({
  entityType,
  profile
}: ProfileControlEditorProps): JSX.Element {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<FormState>(() => {
    if (entityType === "family") {
      const family = profile as AdminManagedFamily;
      return {
        is_active: family.is_active ?? false,
        is_accepting: family.is_accepting ?? false,
        price_morning: String(family.price_morning ?? 0),
        price_afternoon: String(family.price_afternoon ?? 0),
        price_evening: String(family.price_evening ?? 0),
        price_fullday: String(family.price_fullday ?? 0),
        platform_commission_pct: String(family.platform_commission_pct ?? 18),
        host_discount_pct: String(family.host_discount_pct ?? 0),
        active_quarters: joinList(family.active_quarters),
        blocked_dates: joinList(family.blocked_dates),
        admin_notes: family.admin_notes ?? ""
      };
    }

    if (entityType === "friend") {
      const friend = profile as AdminManagedFriend;
      return {
        is_active: friend.is_active ?? false,
        is_online: friend.is_online ?? false,
        price_hour: String(friend.price_hour ?? 0),
        platform_commission_pct: String(friend.platform_commission_pct ?? 20),
        host_discount_pct: String(friend.host_discount_pct ?? 0),
        admin_notes: friend.admin_notes ?? ""
      };
    }

    const hommie = profile as Hommie;
    return {
      is_active: hommie.is_active,
      nightly_price: String(hommie.nightly_price ?? 0),
      platform_commission_pct: String(hommie.platform_commission_pct ?? 18),
      host_discount_pct: String(hommie.host_discount_pct ?? 0),
      blocked_dates: joinList(hommie.blocked_dates),
      admin_notes: hommie.admin_notes ?? ""
    };
  });

  function setField(name: string, value: string | boolean): void {
    setFormState((current) => ({ ...current, [name]: value }));
  }

  async function saveProfile(): Promise<void> {
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/update-profile-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          profileId: profile.id,
          updates: formState
        })
      });

      const payload = (await response.json()) as { error?: string };
      setMessage(response.ok ? "Profile settings saved." : payload.error ?? "Unable to save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-[32px] border border-[#D5E7F8] bg-white p-8 shadow-[0_20px_60px_rgba(26,110,187,0.08)]">
      <div className="grid gap-5">
        {entityType === "family" ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-famloText">
                Morning price
                <input
                  type="number"
                  value={String(formState.price_morning)}
                  onChange={(event) => setField("price_morning", event.target.value)}
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                />
              </label>
              <label className="grid gap-2 text-sm text-famloText">
                Afternoon price
                <input
                  type="number"
                  value={String(formState.price_afternoon)}
                  onChange={(event) => setField("price_afternoon", event.target.value)}
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                />
              </label>
              <label className="grid gap-2 text-sm text-famloText">
                Evening price
                <input
                  type="number"
                  value={String(formState.price_evening)}
                  onChange={(event) => setField("price_evening", event.target.value)}
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                />
              </label>
              <label className="grid gap-2 text-sm text-famloText">
                Full-day price
                <input
                  type="number"
                  value={String(formState.price_fullday)}
                  onChange={(event) => setField("price_fullday", event.target.value)}
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm text-famloText">
              Active quarters
              <input
                type="text"
                value={String(formState.active_quarters)}
                onChange={(event) => setField("active_quarters", event.target.value)}
                placeholder="morning, afternoon, evening, fullday"
                className="rounded-2xl border border-slate-200 px-4 py-3"
              />
            </label>
          </>
        ) : null}

        {entityType === "friend" ? (
          <label className="grid gap-2 text-sm text-famloText">
            Price per hour
            <input
              type="number"
              value={String(formState.price_hour)}
              onChange={(event) => setField("price_hour", event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            />
          </label>
        ) : null}

        {entityType === "hommie" ? (
          <label className="grid gap-2 text-sm text-famloText">
            Nightly price
            <input
              type="number"
              value={String(formState.nightly_price)}
              onChange={(event) => setField("nightly_price", event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            />
          </label>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-famloText">
            Platform commission %
            <input
              type="number"
              step="0.01"
              value={String(formState.platform_commission_pct)}
              onChange={(event) =>
                setField("platform_commission_pct", event.target.value)
              }
              className="rounded-2xl border border-slate-200 px-4 py-3"
            />
          </label>
          <label className="grid gap-2 text-sm text-famloText">
            Discount %
            <input
              type="number"
              step="0.01"
              value={String(formState.host_discount_pct)}
              onChange={(event) => setField("host_discount_pct", event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            />
          </label>
        </div>

        {(entityType === "family" || entityType === "hommie") && (
          <label className="grid gap-2 text-sm text-famloText">
            Blocked dates
            <input
              type="text"
              value={String(formState.blocked_dates)}
              onChange={(event) => setField("blocked_dates", event.target.value)}
              placeholder="2026-04-10, 2026-04-11"
              className="rounded-2xl border border-slate-200 px-4 py-3"
            />
          </label>
        )}

        <label className="grid gap-2 text-sm text-famloText">
          Admin notes
          <textarea
            value={String(formState.admin_notes)}
            onChange={(event) => setField("admin_notes", event.target.value)}
            rows={5}
            className="rounded-3xl border border-slate-200 px-4 py-3"
          />
        </label>

        <div className="flex flex-wrap gap-5">
          <label className="inline-flex items-center gap-3 rounded-full border border-slate-200 px-4 py-3 text-sm text-famloText">
            <input
              type="checkbox"
              checked={Boolean(formState.is_active)}
              onChange={(event) => setField("is_active", event.target.checked)}
            />
            Active
          </label>

          {entityType === "family" ? (
            <label className="inline-flex items-center gap-3 rounded-full border border-slate-200 px-4 py-3 text-sm text-famloText">
              <input
                type="checkbox"
                checked={Boolean(formState.is_accepting)}
                onChange={(event) => setField("is_accepting", event.target.checked)}
              />
              Accepting bookings
            </label>
          ) : null}

          {entityType === "friend" ? (
            <label className="inline-flex items-center gap-3 rounded-full border border-slate-200 px-4 py-3 text-sm text-famloText">
              <input
                type="checkbox"
                checked={Boolean(formState.is_online)}
                onChange={(event) => setField("is_online", event.target.checked)}
              />
              Online
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={isSaving}
            className="rounded-full bg-famloBlue px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#155d9f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save profile controls"}
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
