"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { type SupabaseClient, type User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { type UserProfileRecord } from "@/lib/user-profile";

type UserProfile = UserProfileRecord;

interface UserContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo<SupabaseClient>(() => createBrowserSupabaseClient(), []);

  const fetchProfile = useCallback(async (userId: string, email?: string | null) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/user/profile", {
        cache: "no-store",
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          ...(userId ? { "x-famlo-user-id": userId } : {}),
          ...(email ? { "x-famlo-user-email": email } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to load profile.");
      }

      setProfile((data?.profile as UserProfile | null) ?? null);
    } catch (err) {
      console.error("Error fetching user profile:", err);
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id, user.email ?? null);
    }
  }, [user, fetchProfile]);

  const loadAuthState = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      setUser(session.user);
      await fetchProfile(session.user.id, session.user.email ?? null);
      return;
    }

    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await response.json();
      if (data?.user?.id) {
        const fallbackUser = {
          id: data.user.id,
          email: data.user.email,
          phone: data.user.phone,
          user_metadata: {},
          app_metadata: { provider: "phone" },
          aud: "authenticated",
          created_at: new Date(0).toISOString(),
        } as User;

        setUser(fallbackUser);
        await fetchProfile(fallbackUser.id, fallbackUser.email ?? null);
        return;
      }
    } catch (err) {
      console.error("Error loading fallback auth session:", err);
    }

    setUser(null);
    setProfile(null);
  }, [fetchProfile, supabase]);

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    try {
      await loadAuthState();
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

    void (async () => {
      try {
        await loadAuthState();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

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
