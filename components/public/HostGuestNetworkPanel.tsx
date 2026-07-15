"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, MessageCircle, Users } from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type NetworkGuest = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  avatarUrl: string | null;
  about: string | null;
  completedStayCount: number;
  lastStayAt: string | null;
};

type NetworkPayload = {
  familyId: string;
  guestCount: number;
  viewerCanAccessPeerChat: boolean;
  guests: NetworkGuest[];
  error?: string;
};

function formatDate(value: string | null): string {
  if (!value) return "Recent verified stay";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function HostGuestNetworkPanel({
  familyId,
  guestCount: initialGuestCount,
}: Readonly<{
  familyId: string;
  guestCount: number;
}>): React.JSX.Element {
  const router = useRouter();
  const { user } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [network, setNetwork] = useState<NetworkPayload>({
    familyId,
    guestCount: initialGuestCount,
    viewerCanAccessPeerChat: false,
    guests: [],
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [openingGuestId, setOpeningGuestId] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    if (userId) {
      headers["x-famlo-user-id"] = userId;
    }
    return headers;
  }, [supabase, userId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const response = await fetch(`/api/user/host-network?familyId=${encodeURIComponent(familyId)}`, {
          cache: "no-store",
          headers: await getAuthHeaders(),
        });
        const payload = (await response.json()) as NetworkPayload;
        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Could not load the verified guest network.");
        }
        if (!cancelled) {
          setNetwork(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load the verified guest network.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [familyId, getAuthHeaders]);

  async function openGuestChat(peerUserId: string): Promise<void> {
    setOpeningGuestId(peerUserId);
    setMessage(null);

    try {
      const response = await fetch("/api/user/alumni-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          familyId,
          peerUserId,
        }),
      });
      const payload = (await response.json()) as { conversationId?: string; error?: string };
      if (!response.ok || !payload.conversationId) {
        throw new Error(payload.error ?? "Could not open this Famlo guest network chat.");
      }

      startTransition(() => {
        router.push(`/messages?conversation=${encodeURIComponent(payload.conversationId ?? "")}`);
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open this Famlo guest network chat.");
    } finally {
      setOpeningGuestId(null);
    }
  }

  return (
    <section
      style={{
        background: "linear-gradient(145deg, #eff6ff 0%, #ffffff 65%)",
        borderRadius: "22px",
        border: "1px solid #bfdbfe",
        padding: "22px",
        display: "grid",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#1d4ed8", fontWeight: 800, fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            <Users size={14} />
            Verified Guest Network
          </div>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: "#0f172a", fontFamily: "'DM Sans', sans-serif" }}>
            {network.guestCount} verified guests have already stayed here
          </h2>
          <p style={{ margin: 0, color: "#475569", fontSize: "14px", lineHeight: 1.6 }}>
            Famlo unlocks peer-to-peer guest chat only after your booking is confirmed, so guests can coordinate and ask grounded questions safely.
          </p>
        </div>
        <div
          style={{
            minWidth: "110px",
            padding: "14px 16px",
            borderRadius: "18px",
            background: "#1d4ed8",
            color: "#fff",
            textAlign: "center",
            boxShadow: "0 12px 34px -18px rgba(29,78,216,0.9)",
          }}
        >
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: 1 }}>{network.guestCount}</div>
          <div style={{ fontSize: "11px", fontWeight: 700, opacity: 0.9, letterSpacing: "0.06em", textTransform: "uppercase" }}>Stayed</div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "#1d4ed8", fontWeight: 700 }}>
          <Loader2 size={16} className="animate-spin" />
          Loading verified guest network...
        </div>
      ) : null}

      {!loading && !network.viewerCanAccessPeerChat ? (
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
            padding: "14px 16px",
            borderRadius: "16px",
            background: "#ffffff",
            border: "1px solid #dbeafe",
          }}
        >
          <Lock size={18} style={{ color: "#1d4ed8", flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: "grid", gap: "4px" }}>
            <strong style={{ color: "#0f172a", fontSize: "14px" }}>Guest chat unlocks after booking confirmation</strong>
            <span style={{ color: "#475569", fontSize: "13px", lineHeight: 1.5 }}>
              Once your stay is accepted or confirmed, this panel will open the verified guest list so you can message previous Famlo guests from the same host.
            </span>
          </div>
        </div>
      ) : null}

      {!loading && network.viewerCanAccessPeerChat && network.guests.length === 0 ? (
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#ffffff", border: "1px solid #dbeafe", color: "#475569", fontSize: "13px", fontWeight: 600 }}>
          This host already has verified stay history, but there are no previous guests ready to message right now.
        </div>
      ) : null}

      {!loading && network.viewerCanAccessPeerChat && network.guests.length > 0 ? (
        <div style={{ display: "grid", gap: "12px" }}>
          {network.guests.map((guest) => (
            <article
              key={guest.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: "14px",
                alignItems: "center",
                padding: "14px 16px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid #dbeafe",
              }}
            >
              <div
                style={{
                  width: "46px",
                  height: "46px",
                  borderRadius: "999px",
                  background: guest.avatarUrl ? `center / cover no-repeat url(${guest.avatarUrl})` : "linear-gradient(135deg, #60a5fa, #1d4ed8)",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: "16px",
                }}
              >
                {guest.avatarUrl ? null : guest.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                <strong style={{ color: "#0f172a", fontSize: "15px" }}>{guest.name}</strong>
                <div style={{ color: "#475569", fontSize: "13px", lineHeight: 1.5 }}>
                  {[guest.city, guest.state].filter(Boolean).join(", ") || "India"} · {guest.completedStayCount} completed stay{guest.completedStayCount === 1 ? "" : "s"} · Last stay {formatDate(guest.lastStayAt)}
                </div>
                {guest.about ? (
                  <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>
                    {guest.about.slice(0, 140)}
                    {guest.about.length > 140 ? "..." : ""}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void openGuestChat(guest.id)}
                disabled={openingGuestId === guest.id}
                style={{
                  border: "none",
                  borderRadius: "999px",
                  padding: "10px 14px",
                  background: "#1d4ed8",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "13px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: openingGuestId === guest.id ? "wait" : "pointer",
                }}
              >
                {openingGuestId === guest.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                {openingGuestId === guest.id ? "Opening..." : "Message"}
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {message ? <div style={{ color: "#b91c1c", fontSize: "13px", fontWeight: 700 }}>{message}</div> : null}
    </section>
  );
}
