"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { type SupabaseClient, type User } from "@supabase/supabase-js";
import type { GuestSessionSnapshot } from "@/lib/guest-session";
import type { ContactEvidence } from "@/lib/auth/contact-evidence";
import { fetchGuestSessionSnapshot } from "@/lib/guest-session-client";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { type UserProfileRecord } from "@/lib/user-profile";
import {
  clearGuestBrowserSession,
  getBrowserSupabaseProjectRef,
  performGuestLogout,
} from "@/lib/auth/guest-logout-client";

type UserProfile = UserProfileRecord;

interface UserContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signingOut: boolean;
  contactEvidence: ContactEvidence;
  applyProfile: (profile: UserProfile) => void;
  refreshProfile: () => Promise<GuestSessionSnapshot | null>;
  refreshAuth: () => Promise<GuestSessionSnapshot | null>;
  signOut: (options?: { clearHostSession?: boolean; redirectTo?: string }) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [contactEvidence, setContactEvidence] = useState<ContactEvidence>({
    email: { value: null, verified: false, readOnly: false, source: "none" },
    phone: { value: null, verified: false, source: "none" },
    providers: [],
  });
  const signOutInFlight = useRef(false);
  const supabase = useMemo<SupabaseClient>(() => createBrowserSupabaseClient(), []);

  const loadSessionSnapshot = useCallback(async (): Promise<GuestSessionSnapshot | null> => {
    try {
      const { snapshot, user: nextUser } = await fetchGuestSessionSnapshot(supabase);
      setUser(nextUser);
      setProfile(snapshot.profile);
      setContactEvidence(snapshot.contactEvidence);
      return snapshot;
    } catch (err) {
      console.error("Error loading auth session:", err);
      setUser(null);
      setProfile(null);
      setContactEvidence({
        email: { value: null, verified: false, readOnly: false, source: "none" },
        phone: { value: null, verified: false, source: "none" },
        providers: [],
      });
      return null;
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    return loadSessionSnapshot();
  }, [loadSessionSnapshot]);

  const loadAuthState = useCallback(async () => {
    return loadSessionSnapshot();
  }, [loadSessionSnapshot]);

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    try {
      return await loadAuthState();
    } finally {
      setLoading(false);
    }
  }, [loadAuthState]);

  const applyProfile = useCallback((nextProfile: UserProfile) => {
    setProfile(nextProfile);
  }, []);

  const signOut = useCallback(async (options?: { clearHostSession?: boolean; redirectTo?: string }) => {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    setSigningOut(true);
    const redirectTo =
      options?.redirectTo?.startsWith("/") && !options.redirectTo.startsWith("//")
        ? options.redirectTo
        : "/";

    const result = await performGuestLogout({
      signOutSupabase: async () => {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
      },
      clearServerSessions: async () => {
        const guestResponse = await fetch("/api/auth/session", { method: "DELETE", cache: "no-store" });
        if (!guestResponse.ok) throw new Error("Guest session cleanup failed.");
        if (options?.clearHostSession) {
          const hostResponse = await fetch("/api/app/session", { method: "DELETE", cache: "no-store" });
          if (!hostResponse.ok) throw new Error("Host session cleanup failed.");
        }
      },
      clearBrowserSession: () => {
        clearGuestBrowserSession({
          localStorage: window.localStorage,
          sessionStorage: window.sessionStorage,
          supabaseProjectRef: getBrowserSupabaseProjectRef(),
        });
        setUser(null);
        setProfile(null);
        setContactEvidence({
          email: { value: null, verified: false, readOnly: false, source: "none" },
          phone: { value: null, verified: false, source: "none" },
          providers: [],
        });
      },
      redirectHome: () => window.location.replace(redirectTo),
    });

    if (result.supabaseError) {
      console.error("Supabase sign-out failed; continuing local cleanup.", {
        name: result.supabaseError instanceof Error ? result.supabaseError.name : "Error",
      });
    }
    if (result.serverError) {
      console.error("Server session cleanup failed; continuing local cleanup.", {
        name: result.serverError instanceof Error ? result.serverError.name : "Error",
      });
    }
  }, [supabase]);

  useEffect(() => {
    let active = true;

    const bootstrapHandle = window.setTimeout(() => {
      void (async () => {
        try {
          await loadAuthState();
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      })();
    }, 0);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void (async () => {
        setLoading(true);
        try {
          await loadAuthState();
        } finally {
          setLoading(false);
        }
      })();
    });

    return () => {
      active = false;
      window.clearTimeout(bootstrapHandle);
      subscription.unsubscribe();
    };
  }, [supabase, loadAuthState]);

  return (
    <UserContext.Provider value={{ user, profile, loading, signingOut, contactEvidence, applyProfile, refreshProfile, refreshAuth, signOut }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
