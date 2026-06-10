/**
 * Shared authentication constants and helpers that are runtime-agnostic.
 * Safe for use in Next.js Middleware (Edge Runtime) and Node.js.
 */

const ADMIN_COOKIE_NAME = "famlo-admin-session";
const TEAMS_COOKIE_NAME = "famlo-teams-session";
const GUEST_COOKIE_NAME = "famlo-guest-session";
const SUPABASE_ACCESS_TOKEN_COOKIE_NAME = "sb-access-token";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 hours
const GUEST_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function getAdminCookieName(): string {
  return ADMIN_COOKIE_NAME;
}

export function getTeamsCookieName(): string {
  return TEAMS_COOKIE_NAME;
}

export function getAdminSessionMaxAge(): number {
  return SESSION_DURATION_SECONDS;
}

export function getGuestCookieName(): string {
  return GUEST_COOKIE_NAME;
}

export function getGuestSessionMaxAge(): number {
  return GUEST_SESSION_DURATION_SECONDS;
}

export function getSupabaseAccessTokenCookieName(): string {
  return SUPABASE_ACCESS_TOKEN_COOKIE_NAME;
}
