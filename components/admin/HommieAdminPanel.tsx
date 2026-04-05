"use client";

import { useState } from "react";

import type { ApprovalCredentials, Hommie, HommieApplication } from "../../lib/types";

interface HommieAdminPanelProps {
  applications: HommieApplication[];
  listings: Hommie[];
}

export function HommieAdminPanel({
  applications,
  listings
}: HommieAdminPanelProps): JSX.Element {
  const [applicationItems, setApplicationItems] = useState(applications);
  const [listingItems, setListingItems] = useState(listings);
  const [message, setMessage] = useState("");
  const [approvalCredentials, setApprovalCredentials] =
    useState<ApprovalCredentials | null>(null);

  async function approveApplication(applicationId: string): Promise<void> {
    setMessage("");
    const response = await fetch("/api/admin/hommies/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId })
    });
    const payload = (await response.json()) as {
      application?: HommieApplication;
      hommie?: Hommie;
      credentials?: ApprovalCredentials;
      error?: string;
    };

    if (!response.ok || !payload.application || !payload.hommie) {
      setMessage(payload.error ?? "Unable to approve Hommie.");
      return;
    }

    setApplicationItems((currentItems) =>
      currentItems.map((item) =>
        item.id === applicationId ? payload.application! : item
      )
    );
    setListingItems((currentItems) => [payload.hommie!, ...currentItems]);
    setApprovalCredentials(payload.credentials ?? null);
    setMessage(
      payload.credentials?.email_sent
        ? "Hommie approved, published, and login details emailed."
        : "Hommie approved and published. Email was not sent automatically."
    );
  }

  async function toggleListing(id: string, nextIsActive: boolean): Promise<void> {
    setMessage("");
    const response = await fetch("/api/admin/hommies/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hommieId: id, isActive: nextIsActive })
    });
    const payload = (await response.json()) as { hommie?: Hommie; error?: string };

    if (!response.ok || !payload.hommie) {
      setMessage(payload.error ?? "Unable to update Hommie.");
      return;
    }

    setListingItems((currentItems) =>
      currentItems.map((item) => (item.id === id ? payload.hommie! : item))
    );
    setMessage("Listing updated.");
  }

  return (
    <div className="space-y-8">
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      {approvalCredentials ? (
        <div className="rounded-[24px] border border-[#D5E7F8] bg-[#F7FBFF] p-5 text-sm text-famloText">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-famloBlue">
            Stay host credentials
          </p>
          <div className="mt-3 space-y-2">
            <p><span className="font-semibold">Email:</span> {approvalCredentials.email}</p>
            <p><span className="font-semibold">User ID:</span> {approvalCredentials.user_id}</p>
            <p><span className="font-semibold">Temporary password:</span> {approvalCredentials.password || "Existing account reused"}</p>
            <p><span className="font-semibold">Listing code:</span> {approvalCredentials.profile_code || "Not available"}</p>
            <p className="text-slate-600">
              {approvalCredentials.email_sent
                ? "Approval email sent automatically."
                : "Automatic email did not go out, so please share these credentials manually."}
            </p>
            {approvalCredentials.email_error ? (
              <p className="text-[#A63D40]">Email issue: {approvalCredentials.email_error}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-famloText">
          Hommie applications
        </h2>
        <div className="grid gap-4">
          {applicationItems.map((item) => (
            <div
              key={item.id}
              className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_16px_50px_rgba(26,110,187,0.06)]"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-famloText">
                    {item.property_name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {item.host_name} · {[item.locality, item.city, item.state]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="text-sm text-slate-600">{item.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[#FFF6DD] px-3 py-1 text-xs font-semibold text-[#8A6A00]">
                    {item.status}
                  </span>
                  {item.status !== "approved" ? (
                    <button
                      type="button"
                      onClick={() => void approveApplication(item.id)}
                      className="rounded-full bg-[#1F6A3A] px-5 py-2.5 text-sm font-semibold text-white"
                    >
                      Approve
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-famloText">Published Hommies</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {listingItems.map((item) => (
            <div
              key={item.id}
              className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_16px_50px_rgba(26,110,187,0.06)]"
            >
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-famloText">
                  {item.property_name}
                </h3>
                <p className="text-sm text-slate-600">
                  {[item.locality, item.city, item.state].filter(Boolean).join(", ")}
                </p>
                <p className="text-sm text-slate-600">
                  Rs. {item.nightly_price}/night · Up to {item.max_guests} guests
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleListing(item.id, !item.is_active)}
                className="mt-4 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-famloText"
              >
                {item.is_active ? "Deactivate" : "Activate"}
              </button>
              <a
                href={`/admin/profiles/hommie/${item.id}`}
                className="ml-3 inline-flex rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-famloText"
              >
                Manage
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
