"use client";

import { useEffect, useState } from "react";

import { StatusBadge } from "./StatusBadge";
import type {
  AdminApplication,
  ApplicationStatus,
  ApprovalCredentials
} from "../../lib/types";

interface ApplicationDetailModalProps {
  application: AdminApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (application: AdminApplication) => void;
}

interface UpdateResponse {
  application: AdminApplication;
  credentials?: ApprovalCredentials;
}

type ActionType = "note" | "approved" | "rejected";

function formatDateTime(date: string | null): string {
  if (!date) {
    return "Not reviewed yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(date));
}

export function ApplicationDetailModal({
  application,
  isOpen,
  onClose,
  onUpdated
}: ApplicationDetailModalProps): JSX.Element | null {
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [approvalCredentials, setApprovalCredentials] =
    useState<ApprovalCredentials | null>(null);

  useEffect(() => {
    setNote(application?.review_notes ?? "");
    setFeedback(null);
    setPendingAction(null);
    setApprovalCredentials(null);
  }, [application]);

  if (!isOpen || !application) {
    return null;
  }

  const currentApplication = application;

  async function updateApplication(
    status: ApplicationStatus | null,
    action: ActionType
  ): Promise<void> {
    setPendingAction(action);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/update-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          applicationType: currentApplication.application_type,
          applicationId: currentApplication.id,
          status,
          notes: note
        })
      });

      if (!response.ok) {
        const errorPayload = (await response.json()) as { error?: string };
        throw new Error(errorPayload.error ?? "Unable to update application.");
      }

      const payload = (await response.json()) as UpdateResponse;
      onUpdated(payload.application);
      setApprovalCredentials(payload.credentials ?? null);
      setFeedback({
        type: "success",
        message:
          action === "note"
            ? "Note saved successfully."
            : payload.credentials?.email_sent
              ? `Application marked as ${action}. Login details were emailed successfully.`
              : `Application marked as ${action}.`
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while updating the application."
      });
    } finally {
      setPendingAction(null);
    }
  }

  function renderTypeSpecificFields(): JSX.Element {
    if (currentApplication.application_type === "family") {
      return (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Home type
            </p>
            <p className="mt-2 text-sm leading-7 text-famloText">
              {currentApplication.house_type || "Not provided"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              About the home
            </p>
            <p className="mt-2 text-sm leading-7 text-famloText">
              {currentApplication.about_family || "Not provided"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Property
            </p>
            <p className="mt-2 text-sm leading-7 text-famloText">
              {currentApplication.property_name}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Address
            </p>
            <p className="mt-2 text-sm leading-7 text-famloText">
              {currentApplication.property_address}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Languages
            </p>
            <p className="mt-2 text-sm leading-7 text-famloText">
              {currentApplication.languages?.join(", ") || "Not provided"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Cultural offerings
            </p>
            <p className="mt-2 text-sm leading-7 text-famloText">
              {currentApplication.cultural_offerings?.join(", ") || "Not provided"}
            </p>
          </div>
        </>
      );
    }

    return (
      <>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Interests
          </p>
          <p className="mt-2 text-sm leading-7 text-famloText">
            {currentApplication.interests?.join(", ") || "Not provided"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Experience description
          </p>
          <p className="mt-2 text-sm leading-7 text-famloText">
            {currentApplication.bio || "Not provided"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Availability
          </p>
          <p className="mt-2 text-sm leading-7 text-famloText">
            {currentApplication.availability || "Not provided"}
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.25)] sm:p-10">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-famloBlue">
              {currentApplication.application_type === "family"
                ? "Family application"
                : "Friend application"}
            </p>
            <h2 className="text-2xl font-semibold text-famloText">
              {currentApplication.full_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-famloText"
          >
            Close
          </button>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Status
            </p>
            <div className="mt-2">
              <StatusBadge status={currentApplication.status} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Submitted
            </p>
            <p className="mt-2 text-sm text-famloText">
              {formatDateTime(currentApplication.submitted_at)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Email
            </p>
            <p className="mt-2 text-sm text-famloText">{currentApplication.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              City
            </p>
            <p className="mt-2 text-sm text-famloText">
              {currentApplication.application_type === "family"
                ? [currentApplication.village, currentApplication.state]
                    .filter(Boolean)
                    .join(", ") ||
                  "Not provided"
                : currentApplication.state
                  ? `${currentApplication.city}, ${currentApplication.state}`
                  : currentApplication.city}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Phone
            </p>
            <p className="mt-2 text-sm text-famloText">
              {currentApplication.phone || "Not provided"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Languages
            </p>
            <p className="mt-2 text-sm text-famloText">
              {currentApplication.languages?.join(", ") || "Not provided"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Reviewed at
            </p>
            <p className="mt-2 text-sm text-famloText">
              {formatDateTime(currentApplication.reviewed_at)}
            </p>
          </div>
          {renderTypeSpecificFields()}
        </div>

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Photo
          </p>
          {currentApplication.photo_url ? (
            <a
              href={currentApplication.photo_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex text-sm font-medium text-famloBlue underline-offset-4 hover:underline"
            >
              Open uploaded photo
            </a>
          ) : (
            <p className="mt-2 text-sm text-famloText">No photo provided</p>
          )}
        </div>

        <div className="mt-8">
          <label
            htmlFor="admin-note"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
          >
            Internal note
          </label>
          <textarea
            id="admin-note"
            rows={5}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2 w-full rounded-3xl border border-slate-200 px-4 py-3 text-sm leading-7 text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            placeholder="Add internal review notes here."
          />
        </div>

        {feedback ? (
          <div
            className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "bg-[#EDF8F0] text-[#1F6A3A]"
                : "bg-[#FFF1F1] text-[#A63D40]"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        {approvalCredentials ? (
          <div className="mt-6 rounded-[24px] border border-[#D5E7F8] bg-[#F7FBFF] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-famloBlue">
              Account credentials
            </p>
            <div className="mt-4 grid gap-3 text-sm text-famloText">
              <p>
                <span className="font-semibold">Email:</span>{" "}
                {approvalCredentials.email}
              </p>
              <p>
                <span className="font-semibold">User ID:</span>{" "}
                {approvalCredentials.user_id}
              </p>
              <p>
                <span className="font-semibold">Profile code:</span>{" "}
                {approvalCredentials.profile_code || "Not available"}
              </p>
              <p>
                <span className="font-semibold">Temporary password:</span>{" "}
                {approvalCredentials.password || "Existing account reused"}
              </p>
              <p className="text-slate-600">
                {approvalCredentials.account_created
                  ? "Share this temporary password with the approved person and ask them to change it after first login."
                  : "This email already had an account, so no new password was generated."}
              </p>
              <p className="text-slate-600">
                {approvalCredentials.email_sent
                  ? `Approval email sent${approvalCredentials.email_provider ? ` via ${approvalCredentials.email_provider}` : ""}.`
                  : "Automatic email is not configured yet, so the admin still needs to share these credentials manually."}
              </p>
              {approvalCredentials.email_error ? (
                <p className="text-sm text-[#A63D40]">
                  Email issue: {approvalCredentials.email_error}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void updateApplication(null, "note")}
            disabled={pendingAction !== null}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-famloText transition hover:border-famloBlue hover:text-famloBlue disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pendingAction === "note" ? "Saving note..." : "Add Note"}
          </button>
          <button
            type="button"
            onClick={() => void updateApplication("approved", "approved")}
            disabled={pendingAction !== null}
            className="inline-flex items-center justify-center rounded-full bg-[#1F6A3A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#185530] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pendingAction === "approved" ? "Approving..." : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => void updateApplication("rejected", "rejected")}
            disabled={pendingAction !== null}
            className="inline-flex items-center justify-center rounded-full bg-[#A63D40] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8A2F31] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pendingAction === "rejected" ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
