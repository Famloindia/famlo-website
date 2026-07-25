export function getCurrentInternalPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

export function redirectForIncompleteBookingProfile(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as { code?: unknown; profileUrl?: unknown };
  if (record.code !== "profile_incomplete") return false;
  const target =
    typeof record.profileUrl === "string" && record.profileUrl.startsWith("/") && !record.profileUrl.startsWith("//")
      ? record.profileUrl
      : `/profile?next=${encodeURIComponent(getCurrentInternalPath())}`;
  window.location.replace(target);
  return true;
}
