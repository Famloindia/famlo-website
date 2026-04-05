"use client";

import { useState } from "react";

import type {
  AdminManagedFamily,
  AdminManagedFriend,
  AdminPlatformSettings,
  Hommie
} from "../../lib/types";

interface BusinessControlsPanelProps {
  settings: AdminPlatformSettings;
  families: AdminManagedFamily[];
  friends: AdminManagedFriend[];
  hommies: Hommie[];
}

interface SettingsState {
  global_family_commission_pct: string;
  global_friend_commission_pct: string;
  global_hommie_commission_pct: string;
  default_family_discount_pct: string;
  default_friend_discount_pct: string;
  default_hommie_discount_pct: string;
}

export function BusinessControlsPanel({
  settings,
  families,
  friends,
  hommies
}: BusinessControlsPanelProps): JSX.Element {
  const [formState, setFormState] = useState<SettingsState>({
    global_family_commission_pct: String(settings.global_family_commission_pct),
    global_friend_commission_pct: String(settings.global_friend_commission_pct),
    global_hommie_commission_pct: String(settings.global_hommie_commission_pct),
    default_family_discount_pct: String(settings.default_family_discount_pct),
    default_friend_discount_pct: String(settings.default_friend_discount_pct),
    default_hommie_discount_pct: String(settings.default_hommie_discount_pct)
  });
  const [message, setMessage] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  function updateField(key: keyof SettingsState, value: string): void {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(): Promise<void> {
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/business-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global_family_commission_pct: Number(formState.global_family_commission_pct),
          global_friend_commission_pct: Number(formState.global_friend_commission_pct),
          global_hommie_commission_pct: Number(formState.global_hommie_commission_pct),
          default_family_discount_pct: Number(formState.default_family_discount_pct),
          default_friend_discount_pct: Number(formState.default_friend_discount_pct),
          default_hommie_discount_pct: Number(formState.default_hommie_discount_pct)
        })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to save settings.");
        return;
      }

      setMessage("Platform pricing settings saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function applySettingsToProfiles(): Promise<void> {
    setIsApplying(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/apply-platform-settings", {
        method: "POST"
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to apply settings.");
        return;
      }

      setMessage("Global settings applied to all families, friends, and hommies.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-6">
          <p className="text-sm text-slate-500">Families in control</p>
          <p className="mt-2 text-3xl font-semibold text-famloText">{families.length}</p>
        </div>
        <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-6">
          <p className="text-sm text-slate-500">Friends in control</p>
          <p className="mt-2 text-3xl font-semibold text-famloText">{friends.length}</p>
        </div>
        <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-6">
          <p className="text-sm text-slate-500">Hommies in control</p>
          <p className="mt-2 text-3xl font-semibold text-famloText">{hommies.length}</p>
        </div>
      </div>

      <section className="rounded-[32px] border border-[#D5E7F8] bg-white p-8 shadow-[0_20px_60px_rgba(26,110,187,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-famloText">
              Platform pricing controls
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Set global commission and default discount percentages for all profiles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void applySettingsToProfiles()}
            disabled={isApplying}
            className="rounded-full border border-famloBlue px-5 py-3 text-sm font-semibold text-famloBlue transition hover:bg-famloBlueLight disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isApplying ? "Applying..." : "Apply to all profiles"}
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-famloText">Families</p>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.global_family_commission_pct}
              onChange={(event) =>
                updateField("global_family_commission_pct", event.target.value)
              }
              placeholder="Global commission %"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.default_family_discount_pct}
              onChange={(event) =>
                updateField("default_family_discount_pct", event.target.value)
              }
              placeholder="Default discount %"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold text-famloText">Friends</p>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.global_friend_commission_pct}
              onChange={(event) =>
                updateField("global_friend_commission_pct", event.target.value)
              }
              placeholder="Global commission %"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.default_friend_discount_pct}
              onChange={(event) =>
                updateField("default_friend_discount_pct", event.target.value)
              }
              placeholder="Default discount %"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold text-famloText">Hommies</p>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.global_hommie_commission_pct}
              onChange={(event) =>
                updateField("global_hommie_commission_pct", event.target.value)
              }
              placeholder="Global commission %"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.default_hommie_discount_pct}
              onChange={(event) =>
                updateField("default_hommie_discount_pct", event.target.value)
              }
              placeholder="Default discount %"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={isSaving}
            className="rounded-full bg-famloBlue px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#155d9f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save settings"}
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[28px] border border-[#D5E7F8] bg-white p-6">
          <h3 className="text-xl font-semibold text-famloText">Manage families</h3>
          <div className="mt-4 space-y-3">
            {families.slice(0, 8).map((item) => (
              <a
                key={item.id}
                href={`/admin/profiles/family/${item.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm transition hover:border-famloBlue hover:bg-[#F8FBFF]"
              >
                <span>{item.name}</span>
                <span className="text-slate-500">Manage</span>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-[#D5E7F8] bg-white p-6">
          <h3 className="text-xl font-semibold text-famloText">Manage friends</h3>
          <div className="mt-4 space-y-3">
            {friends.slice(0, 8).map((item) => (
              <a
                key={item.id}
                href={`/admin/profiles/friend/${item.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm transition hover:border-famloBlue hover:bg-[#F8FBFF]"
              >
                <span>{item.name ?? "City Buddy"}</span>
                <span className="text-slate-500">Manage</span>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-[#D5E7F8] bg-white p-6">
          <h3 className="text-xl font-semibold text-famloText">Manage hommies</h3>
          <div className="mt-4 space-y-3">
            {hommies.slice(0, 8).map((item) => (
              <a
                key={item.id}
                href={`/admin/profiles/hommie/${item.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm transition hover:border-famloBlue hover:bg-[#F8FBFF]"
              >
                <span>{item.property_name}</span>
                <span className="text-slate-500">Manage</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
