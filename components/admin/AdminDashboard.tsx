"use client";

import { useMemo, useState } from "react";

import { ApplicationDetailModal } from "./ApplicationDetailModal";
import { ApplicationsTable } from "./ApplicationsTable";
import type {
  AdminApplication,
  AdminFamilyApplication,
  AdminFriendApplication,
  AdminManagedFamily,
  AdminManagedFriend,
  AdminMonthlyUsersStat,
  ApplicationStatus
} from "../../lib/types";

interface AdminDashboardProps {
  familyApplications: AdminFamilyApplication[];
  friendApplications: AdminFriendApplication[];
  families: AdminManagedFamily[];
  friends: AdminManagedFriend[];
  hommies: { id: string; is_active: boolean }[];
  totalUsers: number;
  newUsersThisMonth: number;
  monthlyUsers: AdminMonthlyUsersStat[];
}

type AdminTab = "family" | "friend";
type StatusFilter = "all" | ApplicationStatus;

function calculateCounts(applications: AdminApplication[]): Record<
  "total" | ApplicationStatus,
  number
> {
  return applications.reduce(
    (counts, application) => {
      counts.total += 1;
      counts[application.status] += 1;
      return counts;
    },
    {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    }
  );
}

export function AdminDashboard({
  familyApplications,
  friendApplications,
  families,
  friends,
  hommies,
  totalUsers,
  newUsersThisMonth,
  monthlyUsers
}: AdminDashboardProps): JSX.Element {
  const [familyItems, setFamilyItems] = useState(familyApplications);
  const [friendItems, setFriendItems] = useState(friendApplications);
  const [managedFamilies, setManagedFamilies] = useState(families);
  const [managedFriends, setManagedFriends] = useState(friends);
  const [activeTab, setActiveTab] = useState<AdminTab>("family");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedApplication, setSelectedApplication] =
    useState<AdminApplication | null>(null);
  const [controlMessage, setControlMessage] = useState("");

  const allApplications = useMemo(
    () => [...familyItems, ...friendItems],
    [familyItems, friendItems]
  );
  const stats = useMemo(() => calculateCounts(allApplications), [allApplications]);
  const businessStats = useMemo(
    () => ({
      families: managedFamilies.length,
      activeFamilies: managedFamilies.filter((item) => item.is_active).length,
      friends: managedFriends.length,
      activeFriends: managedFriends.filter((item) => item.is_active).length,
      hommies: hommies.length,
      activeHommies: hommies.filter((item) => item.is_active).length
    }),
    [hommies, managedFamilies, managedFriends]
  );

  const currentItems = activeTab === "family" ? familyItems : friendItems;
  const filteredApplications = useMemo(() => {
    if (statusFilter === "all") {
      return currentItems;
    }

    return currentItems.filter(
      (application) => application.status === statusFilter
    );
  }, [currentItems, statusFilter]);

  function handleUpdatedApplication(updatedApplication: AdminApplication): void {
    if (updatedApplication.application_type === "family") {
      setFamilyItems((currentItems) =>
        currentItems.map((application) =>
          application.id === updatedApplication.id ? updatedApplication : application
        )
      );
    } else {
      setFriendItems((currentItems) =>
        currentItems.map((application) =>
          application.id === updatedApplication.id ? updatedApplication : application
        )
      );
    }

    setSelectedApplication(updatedApplication);
  }

  async function toggleProfile(
    entityType: "family" | "friend",
    profileId: string,
    isActive: boolean
  ): Promise<void> {
    setControlMessage("");

    const response = await fetch("/api/admin/toggle-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, profileId, isActive })
    });

    const payload = (await response.json()) as {
      profile?: AdminManagedFamily | AdminManagedFriend;
      error?: string;
    };

    if (!response.ok || !payload.profile) {
      setControlMessage(payload.error ?? "Unable to update profile.");
      return;
    }

    if (entityType === "family") {
      setManagedFamilies((currentItems) =>
        currentItems.map((item) =>
          item.id === profileId
            ? {
                ...item,
                is_active: payload.profile?.is_active ?? item.is_active
              }
            : item
        )
      );
    } else {
      setManagedFriends((currentItems) =>
        currentItems.map((item) =>
          item.id === profileId
            ? {
                ...item,
                is_active: payload.profile?.is_active ?? item.is_active
              }
            : item
        )
      );
    }

    setControlMessage("Control updated.");
  }

  return (
    <>
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_16px_50px_rgba(26,110,187,0.08)]">
            <p className="text-sm font-medium text-slate-500">Total</p>
            <p className="mt-3 text-3xl font-semibold text-famloText">
              {stats.total}
            </p>
          </div>
          <div className="rounded-[28px] border border-[#F2E3A5] bg-[#FFFDF4] p-6 shadow-[0_16px_50px_rgba(15,23,42,0.04)]">
            <p className="text-sm font-medium text-slate-500">Pending</p>
            <p className="mt-3 text-3xl font-semibold text-famloText">
              {stats.pending}
            </p>
          </div>
          <div className="rounded-[28px] border border-[#CDE9D7] bg-[#F8FCF9] p-6 shadow-[0_16px_50px_rgba(15,23,42,0.04)]">
            <p className="text-sm font-medium text-slate-500">Approved</p>
            <p className="mt-3 text-3xl font-semibold text-famloText">
              {stats.approved}
            </p>
          </div>
          <div className="rounded-[28px] border border-[#F1C7C8] bg-[#FFF8F8] p-6 shadow-[0_16px_50px_rgba(15,23,42,0.04)]">
            <p className="text-sm font-medium text-slate-500">Rejected</p>
            <p className="mt-3 text-3xl font-semibold text-famloText">
              {stats.rejected}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-5">
            <p className="text-sm text-slate-500">Families</p>
            <p className="mt-2 text-2xl font-semibold text-famloText">
              {businessStats.families}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {businessStats.activeFamilies} active
            </p>
          </div>
          <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-5">
            <p className="text-sm text-slate-500">Friends</p>
            <p className="mt-2 text-2xl font-semibold text-famloText">
              {businessStats.friends}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {businessStats.activeFriends} active
            </p>
          </div>
          <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-5">
            <p className="text-sm text-slate-500">Hommies</p>
            <p className="mt-2 text-2xl font-semibold text-famloText">
              {businessStats.hommies}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {businessStats.activeHommies} active
            </p>
          </div>
          <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-5">
            <p className="text-sm text-slate-500">Total users</p>
            <p className="mt-2 text-2xl font-semibold text-famloText">
              {totalUsers}
            </p>
          </div>
          <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-5">
            <p className="text-sm text-slate-500">New this month</p>
            <p className="mt-2 text-2xl font-semibold text-famloText">
              {newUsersThisMonth}
            </p>
          </div>
          <a
            href="/admin/hommies"
            className="flex rounded-[28px] border border-[#D5E7F8] bg-[#F8FBFF] p-5 transition hover:border-famloBlue"
          >
            <div className="self-center">
              <p className="text-sm text-slate-500">Hommies control</p>
              <p className="mt-2 text-base font-semibold text-famloText">
                Review and manage Hommies
              </p>
            </div>
          </a>
        </div>

        <div className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_16px_50px_rgba(26,110,187,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-famloText">
                User growth
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Monthly user creation based on your current `users` table.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              Activity tracking can be added next with dedicated event logs.
            </p>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-6">
            {monthlyUsers.length > 0 ? (
              monthlyUsers.map((item) => (
                <div
                  key={item.month_label}
                  className="rounded-2xl border border-slate-200 bg-[#FAFCFF] p-4"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    {item.month_label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-famloText">
                    {item.count}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No user records yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-[28px] border border-[#D5E7F8] bg-white p-5 shadow-[0_16px_50px_rgba(26,110,187,0.06)] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("family")}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                activeTab === "family"
                  ? "bg-famloBlue text-white"
                  : "bg-famloBlueLight text-famloBlue hover:bg-[#DDEEFF]"
              }`}
            >
              Family Applications
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("friend")}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                activeTab === "friend"
                  ? "bg-famloBlue text-white"
                  : "bg-famloBlueLight text-famloBlue hover:bg-[#DDEEFF]"
              }`}
            >
              Friend Applications
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            {(["all", "pending", "approved", "rejected"] as const).map(
              (filterValue) => (
                <button
                  key={filterValue}
                  type="button"
                  onClick={() => setStatusFilter(filterValue)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    statusFilter === filterValue
                      ? "border-famloBlue bg-famloBlue text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-famloBlue hover:text-famloBlue"
                  }`}
                >
                  {filterValue === "all"
                    ? "All"
                    : `${filterValue.charAt(0).toUpperCase()}${filterValue.slice(1)}`}
                </button>
              )
            )}
          </div>
        </div>

        <ApplicationsTable
          applications={filteredApplications}
          onView={setSelectedApplication}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_16px_50px_rgba(26,110,187,0.06)]">
            <div className="mb-5">
              <h2 className="text-2xl font-semibold text-famloText">
                Family controls
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Activate or restrict approved family accounts.
              </p>
            </div>
            <div className="space-y-4">
              {managedFamilies.slice(0, 8).map((family) => (
                <div
                  key={family.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-famloText">
                        {family.name}
                      </p>
                      <p className="text-sm text-slate-600">
                        {[family.village, family.city, family.state]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {family.user_email ?? "No linked email"} · Onboarding{" "}
                        {family.onboarding_completed ? "complete" : "pending"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void toggleProfile(
                          "family",
                          family.id,
                          !(family.is_active ?? false)
                        )
                      }
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        family.is_active
                          ? "border border-[#E8C7C7] bg-[#FFF5F5] text-[#A63D40]"
                          : "bg-[#1F6A3A] text-white"
                      }`}
                    >
                      {family.is_active ? "Restrict" : "Activate"}
                    </button>
                    <a
                      href={`/admin/profiles/family/${family.id}`}
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-famloText"
                    >
                      Manage
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_16px_50px_rgba(26,110,187,0.06)]">
            <div className="mb-5">
              <h2 className="text-2xl font-semibold text-famloText">
                Friend controls
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Activate or restrict approved City Buddy accounts.
              </p>
            </div>
            <div className="space-y-4">
              {managedFriends.slice(0, 8).map((friend) => (
                <div
                  key={friend.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-famloText">
                        {friend.name ?? "City Buddy"}
                      </p>
                      <p className="text-sm text-slate-600">
                        {[friend.city, friend.state].filter(Boolean).join(", ")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {friend.user_email ?? "No linked email"} · Onboarding{" "}
                        {friend.onboarding_completed ? "complete" : "pending"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void toggleProfile(
                          "friend",
                          friend.id,
                          !(friend.is_active ?? false)
                        )
                      }
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        friend.is_active
                          ? "border border-[#E8C7C7] bg-[#FFF5F5] text-[#A63D40]"
                          : "bg-[#1F6A3A] text-white"
                      }`}
                    >
                      {friend.is_active ? "Restrict" : "Activate"}
                    </button>
                    <a
                      href={`/admin/profiles/friend/${friend.id}`}
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-famloText"
                    >
                      Manage
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {controlMessage ? (
          <p className="text-sm text-slate-600">{controlMessage}</p>
        ) : null}
      </div>

      <ApplicationDetailModal
        application={selectedApplication}
        isOpen={selectedApplication !== null}
        onClose={() => setSelectedApplication(null)}
        onUpdated={handleUpdatedApplication}
      />
    </>
  );
}
