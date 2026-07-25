"use client";

type StorageLike = Pick<Storage, "key" | "length" | "removeItem">;

function matchingKeys(storage: StorageLike, predicate: (key: string) => boolean): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && predicate(key)) keys.push(key);
  }
  return keys;
}

export function clearGuestBrowserSession(input: {
  localStorage: StorageLike;
  sessionStorage: StorageLike;
  supabaseProjectRef: string | null;
}): void {
  if (input.supabaseProjectRef) {
    const authPrefix = `sb-${input.supabaseProjectRef}-auth-token`;
    for (const key of matchingKeys(input.localStorage, (candidate) => candidate.startsWith(authPrefix))) {
      input.localStorage.removeItem(key);
    }
  }

  for (const key of matchingKeys(
    input.sessionStorage,
    (candidate) =>
      candidate.startsWith("famlo:guest-conversations:") ||
      candidate.startsWith("famlo:guest-messages:")
  )) {
    input.sessionStorage.removeItem(key);
  }
}

export function getBrowserSupabaseProjectRef(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return null;
  try {
    return new URL(value).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

export async function performGuestLogout(input: {
  signOutSupabase: () => Promise<void>;
  clearServerSessions: () => Promise<void>;
  clearBrowserSession: () => void;
  redirectHome: () => void;
}): Promise<{ supabaseError: unknown; serverError: unknown; browserError: unknown }> {
  let supabaseError: unknown = null;
  let serverError: unknown = null;
  let browserError: unknown = null;

  try {
    await input.signOutSupabase();
  } catch (error) {
    supabaseError = error;
  }
  try {
    await input.clearServerSessions();
  } catch (error) {
    serverError = error;
  } finally {
    try {
      input.clearBrowserSession();
    } catch (error) {
      browserError = error;
    } finally {
      input.redirectHome();
    }
  }

  return { supabaseError, serverError, browserError };
}
