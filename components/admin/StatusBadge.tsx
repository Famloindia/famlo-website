import type { ApplicationStatus } from "../../lib/types";

interface StatusBadgeProps {
  status: ApplicationStatus;
}

const statusStyles: Record<ApplicationStatus, string> = {
  pending: "bg-[#FFF6DD] text-[#8A6A00]",
  approved: "bg-[#EDF8F0] text-[#1F6A3A]",
  rejected: "bg-[#FFF1F1] text-[#A63D40]"
};

const statusLabels: Record<ApplicationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected"
};

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
