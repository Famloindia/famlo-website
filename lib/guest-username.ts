export const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "auth",
  "famlo",
  "host",
  "login",
  "logout",
  "profile",
  "signup",
  "support",
  "www",
]);

export function normalizeGuestUsername(input: unknown): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

export function validateGuestUsername(input: unknown): string | null {
  const username = normalizeGuestUsername(input);
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(username)) {
    return "Use 3-30 lowercase letters, numbers, or underscores, starting with a letter.";
  }
  if (RESERVED_USERNAMES.has(username)) {
    return "This username is reserved.";
  }
  return null;
}
