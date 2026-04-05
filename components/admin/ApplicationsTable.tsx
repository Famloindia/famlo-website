"use client";

import { StatusBadge } from "./StatusBadge";
import type { AdminApplication } from "../../lib/types";

interface ApplicationsTableProps {
  applications: AdminApplication[];
  onView: (application: AdminApplication) => void;
}

function formatSubmittedDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

function getLocation(application: AdminApplication): string {
  if (application.application_type === "family") {
    const parts = [application.village, application.state].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(", ");
    }

    return application.property_address;
  }

  return application.state ? `${application.city}, ${application.state}` : application.city;
}

export function ApplicationsTable({
  applications,
  onView
}: ApplicationsTableProps): JSX.Element {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#D5E7F8] bg-white shadow-[0_20px_60px_rgba(26,110,187,0.08)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-[#F7FBFF]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Name
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                City
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Phone
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Submitted
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Status
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {applications.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-sm text-slate-500"
                >
                  No applications match this filter yet.
                </td>
              </tr>
            ) : (
              applications.map((application) => (
                <tr key={application.id} className="hover:bg-[#FBFDFF]">
                  <td className="px-6 py-4 text-sm font-medium text-famloText">
                    {application.full_name}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {getLocation(application)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {application.phone || "Not provided"}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatSubmittedDate(application.submitted_at)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <StatusBadge status={application.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onView(application)}
                      className="inline-flex items-center justify-center rounded-full border border-famloBlue px-4 py-2 text-sm font-semibold text-famloBlue transition hover:bg-famloBlueLight"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
