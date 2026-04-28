const DEFAULT_PUBLIC_SITE_URL = "https://www.famlo.in";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) {
    return DEFAULT_PUBLIC_SITE_URL;
  }

  return normalizeBaseUrl(value);
}

export function getSafeReturnPath(input: string | null | undefined): string {
  if (!input) {
    return "/app";
  }

  if (!input.startsWith("/") || input.startsWith("//")) {
    return "/app";
  }

  return input;
}

export function buildOAuthCallbackUrl(nextPath?: string): string {
  const callbackUrl = new URL("/auth/callback", getPublicSiteUrl());
  callbackUrl.searchParams.set("next", getSafeReturnPath(nextPath));
  return callbackUrl.toString();
}
