"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ApprovalCredentials, HomeApplication, HommieApplication } from "@/lib/types";

interface AdminApprovalPanelProps {
  homeApplications: HomeApplication[];
  hommieApplications: HommieApplication[];
}

interface ApprovalResult {
  credentials?: ApprovalCredentials | null;
  error?: string;
}

export function AdminApprovalPanel({
  homeApplications,
  hommieApplications
}: Readonly<AdminApprovalPanelProps>): JSX.Element {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [result, setResult] = useState<ApprovalResult | null>(null);

  async function approve(kind: "home" | "hommie", applicationId: string): Promise<void> {
    const key = `${kind}-${applicationId}`;
    setLoadingKey(key);
    setResult(null);

    const response = await fetch(`/api/admin/${kind === "home" ? "homes" : "hommies"}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ applicationId })
    });

    const data = (await response.json()) as {
      error?: string;
      credentials?: ApprovalCredentials | null;
    };

    if (!response.ok) {
      setResult({ error: data.error ?? "Approval failed." });
      setLoadingKey(null);
      return;
    }

    setResult({ credentials: data.credentials ?? null });
    setLoadingKey(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {result?.error ? (
        <div className="rounded-[24px] border border-[#ef4444]/20 bg-[#fff1f2] p-4 text-sm text-[#9f1239]">
          {result.error}
        </div>
      ) : null}

      {result?.credentials ? (
        <div className="rounded-[24px] border border-[#d6eadf] bg-[#f3fbf6] p-5 text-sm text-[#305744]">
          <p className="font-semibold text-[#1f2937]">Approval complete</p>
          <p className="mt-2">User ID: {result.credentials.user_id}</p>
          <p className="mt-1">
            Temporary password: {result.credentials.password ?? "Existing login reused"}
          </p>
          <p className="mt-1">Email: {result.credentials.email}</p>
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">
            Home Hosts
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#1f2937]">
            Pending home partner requests
          </h2>
        </div>
        <div className="grid gap-4">
          {homeApplications.length === 0 ? (
            <div className="rounded-[24px] border border-white/70 bg-white/75 p-5 text-sm text-[#52606d]">
              No pending home host applications right now.
            </div>
          ) : (
            homeApplications.map((application) => (
              <article
                key={application.id}
                className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-[#1f2937]">
                      {application.property_name}
                    </h3>
                    <p className="text-sm text-[#52606d]">
                      {application.host_name} · {application.city}, {application.state}
                    </p>
                    <p className="text-sm text-[#52606d]">{application.email}</p>
                    <p className="text-sm leading-6 text-[#52606d]">
                      {application.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => approve("home", application.id)}
                    disabled={loadingKey === `home-${application.id}`}
                    className="inline-flex items-center justify-center rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loadingKey === `home-${application.id}` ? "Approving..." : "Approve"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">
            Hommies
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#1f2937]">
            Pending hommie partner requests
          </h2>
        </div>
        <div className="grid gap-4">
          {hommieApplications.length === 0 ? (
            <div className="rounded-[24px] border border-white/70 bg-white/75 p-5 text-sm text-[#52606d]">
              No pending hommie applications right now.
            </div>
          ) : (
            hommieApplications.map((application) => (
              <article
                key={application.id}
                className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-[#1f2937]">
                      {application.property_name}
                    </h3>
                    <p className="text-sm text-[#52606d]">
                      {application.host_name} · {application.city}, {application.state}
                    </p>
                    <p className="text-sm text-[#52606d]">{application.email}</p>
                    <p className="text-sm leading-6 text-[#52606d]">
                      {application.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => approve("hommie", application.id)}
                    disabled={loadingKey === `hommie-${application.id}`}
                    className="inline-flex items-center justify-center rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loadingKey === `hommie-${application.id}` ? "Approving..." : "Approve"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
