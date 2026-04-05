"use client";

import { useMemo, useState } from "react";

import type { Hommie, HommieBookingRequest } from "@/lib/types";

interface HommiePartnerDashboardProps {
  hommie: Hommie;
  bookings: HommieBookingRequest[];
}

type Section = "overview" | "bookings" | "availability" | "earnings" | "profile";

function joinList(values: string[] | null | undefined): string {
  return values?.join(", ") ?? "";
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function HommiePartnerDashboard({
  hommie,
  bookings
}: HommiePartnerDashboardProps): JSX.Element {
  const [section, setSection] = useState<Section>("overview");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [form, setForm] = useState({
    host_name: hommie.host_name,
    email: hommie.email,
    phone: hommie.phone ?? "",
    property_name: hommie.property_name,
    city: hommie.city,
    state: hommie.state,
    locality: hommie.locality ?? "",
    address: hommie.address,
    google_maps_link: hommie.google_maps_link ?? "",
    description: hommie.description,
    amenities: joinList(hommie.amenities),
    images: joinList(hommie.images),
    nightly_price: String(hommie.nightly_price),
    max_guests: String(hommie.max_guests),
    is_active: hommie.is_active,
    admin_notes: hommie.admin_notes ?? ""
  });
  const [bookingRows, setBookingRows] = useState<HommieBookingRequest[]>(bookings);

  const weekTransactions = bookingRows.slice(0, 4);
  const monthTransactions = bookingRows.slice(0, 8);
  const transactionRows = period === "week" ? weekTransactions : monthTransactions;
  const totalEarning = transactionRows.reduce(
    (sum, row) => sum + (row.status === "confirmed" ? Number(form.nightly_price || 0) : 0),
    0
  );

  async function saveDashboard(): Promise<void> {
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/onboarding/hommie/dashboard-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hommieId: hommie.id,
        updates: {
          ...form,
          amenities: form.amenities,
          images: form.images,
          nightly_price: Number(form.nightly_price),
          max_guests: Number(form.max_guests)
        }
      })
    });

    const payload = (await response.json()) as { error?: string };
    setSaving(false);
    setMessage(response.ok ? "Hommie dashboard saved." : payload.error ?? "Unable to save.");
  }

  async function updateBookingStatus(
    bookingId: string,
    status: "confirmed" | "rejected"
  ): Promise<void> {
    const response = await fetch("/api/onboarding/hommie/dashboard-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, bookingStatus: status })
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error ?? "Unable to update booking.");
      return;
    }

    setBookingRows((current) =>
      current.map((row) => (row.id === bookingId ? { ...row, status } : row))
    );
    setMessage(`Booking ${status}.`);
  }

  const navItems: Array<[Section, string]> = [
    ["overview", "Dashboard"],
    ["bookings", "Bookings"],
    ["availability", "Availability"],
    ["earnings", "Earnings"],
    ["profile", "Profile"]
  ];

  return (
    <section className="grid gap-6 lg:grid-cols-[250px_1fr]">
      <aside className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">
          Hommie Partner
        </p>
        <div className="mt-5 space-y-2">
          {navItems.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSection(value)}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm ${
                section === value ? "bg-[#1f2937] text-white" : "bg-[#f7f5f1] text-[#374151]"
              }`}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-6">
        <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">
                Live hommie profile
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#1f2937]">
                {form.property_name}
              </h2>
              <p className="mt-2 text-sm text-[#52606d]">
                {[form.locality, form.city, form.state].filter(Boolean).join(", ")} · hosted by {form.host_name}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <span className={`rounded-full border px-4 py-2 text-sm font-semibold ${form.is_active ? "border-[#b7e5c4] bg-[#ecfdf3] text-[#166534]" : "border-[#f9c7d2] bg-[#fff1f2] text-[#9f1239]"}`}>
                {form.is_active ? "Active" : "Inactive"}
              </span>
              <button
                type="button"
                onClick={saveDashboard}
                className="rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </section>

        {section === "overview" ? (
          <>
            <section className="grid gap-5 md:grid-cols-4">
              {[
                ["Nightly price", `Rs. ${Number(form.nightly_price || 0).toLocaleString("en-IN")}`],
                ["Max guests", form.max_guests],
                ["Booking requests", String(bookingRows.length)],
                ["Status", form.is_active ? "Open" : "Paused"]
              ].map(([label, value]) => (
                <article key={label} className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
                  <p className="text-sm text-[#52606d]">{label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#1f2937]">{value}</p>
                </article>
              ))}
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              <h3 className="text-2xl font-semibold text-[#1f2937]">Current card preview</h3>
              <div className="mt-5 overflow-hidden rounded-[28px] border border-[#D5E7F8] bg-white shadow-[0_20px_60px_rgba(26,110,187,0.08)]">
                <div className="relative h-64 bg-[#EAF5FF]">
                  {parseList(form.images)[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={parseList(form.images)[0]} alt={form.property_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#1A6EBB]">No image</div>
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-[#1f2937]">{form.property_name}</h4>
                      <p className="text-sm text-slate-600">{[form.locality, form.city, form.state].filter(Boolean).join(", ")}</p>
                    </div>
                    <p className="text-sm font-semibold text-[#1A6EBB]">Rs. {form.nightly_price}/night</p>
                  </div>
                  <p className="line-clamp-2 text-sm leading-7 text-slate-600">{form.description}</p>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {section === "bookings" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-2xl font-semibold text-[#1f2937]">Booking requests</h3>
            <div className="mt-5 space-y-3">
              {bookingRows.length === 0 ? (
                <div className="rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5 text-sm text-[#52606d]">
                  No booking requests yet.
                </div>
              ) : (
                bookingRows.map((booking) => (
                  <div key={booking.id} className="flex flex-col gap-4 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm text-[#52606d]">
                      <p className="font-semibold text-[#1f2937]">{booking.guest_name}</p>
                      <p className="mt-1">{booking.check_in} to {booking.check_out}</p>
                      <p className="mt-1">{booking.guests} guests · {booking.guest_email}</p>
                      {booking.notes ? <p className="mt-1">{booking.notes}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-4 py-2 text-xs font-semibold ${booking.status === "confirmed" ? "bg-[#ecfdf3] text-[#166534]" : booking.status === "rejected" ? "bg-[#fff1f2] text-[#9f1239]" : "bg-[#fff7e6] text-[#92400e]"}`}>
                        {booking.status}
                      </span>
                      {booking.status === "pending" ? (
                        <>
                          <button type="button" onClick={() => void updateBookingStatus(booking.id, "confirmed")} className="rounded-full border border-[#1f2937] px-4 py-2 text-sm font-semibold text-[#1f2937]">
                            Accept
                          </button>
                          <button type="button" onClick={() => void updateBookingStatus(booking.id, "rejected")} className="rounded-full border border-[#d1d5db] px-4 py-2 text-sm font-semibold text-[#52606d]">
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {section === "availability" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-2xl font-semibold text-[#1f2937]">Availability & listing controls</h3>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] px-5 py-4 text-sm text-[#1f2937]">
                <span>Listing active</span>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                />
              </label>
              <label className="grid gap-2 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] px-5 py-4 text-sm text-[#52606d]">
                Max guests
                <input
                  value={form.max_guests}
                  onChange={(event) => setForm((current) => ({ ...current, max_guests: event.target.value.replace(/[^0-9]/g, "") }))}
                  className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-[#1f2937] outline-none"
                />
              </label>
              <label className="grid gap-2 md:col-span-2 text-sm text-[#52606d]">
                Amenities
                <textarea
                  value={form.amenities}
                  onChange={(event) => setForm((current) => ({ ...current, amenities: event.target.value }))}
                  className="min-h-[120px] rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="grid gap-2 md:col-span-2 text-sm text-[#52606d]">
                Image URLs
                <textarea
                  value={form.images}
                  onChange={(event) => setForm((current) => ({ ...current, images: event.target.value }))}
                  className="min-h-[120px] rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
          </section>
        ) : null}

        {section === "earnings" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-semibold text-[#1f2937]">Earnings</h3>
              <div className="flex gap-2">
                {(["week", "month"] as const).map((item) => (
                  <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded-full px-4 py-2 text-sm font-semibold ${period === item ? "bg-[#1f2937] text-white" : "bg-[#f3f4f6] text-[#52606d]"}`}>
                    {item === "week" ? "Week" : "Month"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="rounded-[28px] border border-[#e5e7eb] bg-[#f8fbfd] p-5">
                <p className="text-sm text-[#52606d]">Current {period}</p>
                <p className="mt-2 text-3xl font-semibold text-[#1f2937]">Rs. {totalEarning.toLocaleString("en-IN")}</p>
              </div>
              <div className="rounded-[28px] border border-[#e5e7eb] bg-[#fffaf2] p-5">
                <p className="text-sm text-[#52606d]">Confirmed stays</p>
                <p className="mt-2 text-3xl font-semibold text-[#1f2937]">
                  {transactionRows.filter((item) => item.status === "confirmed").length}
                </p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {transactionRows.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between rounded-[18px] border border-[#e5e7eb] bg-[#faf7f2] px-4 py-4 text-sm">
                  <div>
                    <p className="font-semibold text-[#1f2937]">{booking.guest_name}</p>
                    <p className="text-[#52606d]">{booking.check_in} to {booking.check_out}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[#1f2937]">Rs. {Number(form.nightly_price || 0).toLocaleString("en-IN")}</p>
                    <p className="text-[#52606d]">{booking.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "profile" ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-2xl font-semibold text-[#1f2937]">Profile & listing info</h3>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ["Host name", "host_name"],
                ["Email", "email"],
                ["Phone", "phone"],
                ["Property name", "property_name"],
                ["Locality", "locality"],
                ["City", "city"],
                ["State", "state"],
                ["Nightly price", "nightly_price"],
                ["Google Maps link", "google_maps_link"],
                ["Address", "address"]
              ].map(([label, key]) => (
                <label key={key} className="grid gap-2 text-sm text-[#52606d]">
                  {label}
                  <input
                    value={String(form[key as keyof typeof form])}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-[#1f2937] outline-none"
                  />
                </label>
              ))}
            </div>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="mt-4 min-h-[140px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              placeholder="Describe the hommie experience"
            />
            <textarea
              value={form.admin_notes}
              onChange={(event) => setForm((current) => ({ ...current, admin_notes: event.target.value }))}
              className="mt-4 min-h-[120px] w-full rounded-3xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              placeholder="Notes for Famlo team"
            />
          </section>
        ) : null}

        {message ? <p className="text-sm text-[#52606d]">{message}</p> : null}
      </div>
    </section>
  );
}
