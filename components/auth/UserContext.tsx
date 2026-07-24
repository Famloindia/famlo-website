"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { type SupabaseClient, type User } from "@supabase/supabase-js";
import type { GuestSessionSnapshot } from "@/lib/guest-session";
import { fetchGuestSessionSnapshot } from "@/lib/guest-session-client";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { type UserProfileRecord } from "@/lib/user-profile";

type UserProfile = UserProfileRecord;

interface UserContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<GuestSessionSnapshot | null>;
  refreshAuth: () => Promise<GuestSessionSnapshot | null>;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo<SupabaseClient>(() => createBrowserSupabaseClient(), []);

  const loadSessionSnapshot = useCallback(async (): Promise<GuestSessionSnapshot | null> => {
    try {
      const { snapshot, user: nextUser } = await fetchGuestSessionSnapshot(supabase);
      setUser(nextUser);
      setProfile(snapshot.profile);
      return snapshot;
    } catch (err) {
      console.error("Error loading auth session:", err);
      setUser(null);
      setProfile(null);
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

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    setUser(null);
    setProfile(null);
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
    <UserContext.Provider value={{ user, profile, loading, refreshProfile, refreshAuth, signOut }}>
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
