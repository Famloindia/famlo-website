"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, Compass, MessageCircle, WalletCards } from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type HostSession = {
  active: boolean;
  familyId?: string | null;
  hostUserId?: string | null;
  displayName?: string | null;
  dashboardUrl?: string | null;
};

type ConversationRow = {
  id: string;
  last_message?: string | null;
  guest_unread?: number | null;
  host_unread?: number | null;
};

export default function AppRuntime(): React.JSX.Element | null {
  return (
    <Suspense fallback={null}>
      <AppRuntimeContent />
    </Suspense>
  );
}

function AppRuntimeContent(): React.JSX.Element | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [hostSession, setHostSession] = useState<HostSession>({ active: false });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [standalone, setStandalone] = useState(false);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const lastUnreadRef = useRef<number | null>(null);

  const installContext = standalone || pathname.startsWith("/app") || searchParams.get("app") === "1";
  const appMode = hostSession.active ? "host" : user ? "user" : installContext ? "guest" : "none";
  const hiddenRoutes =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/teams") ||
    pathname.startsWith("/partners/home") ||
    pathname.startsWith("/partners/hommies") ||
    pathname.includes("/submitted");
  const showMobileNav = appMode !== "none" && !hiddenRoutes;
  const currentTab = searchParams.get("tab") ?? "dashboard";

  const navItems = useMemo(() => {
    if (appMode === "host") {
      const dashboardUrl = hostSession.dashboardUrl ?? "/partnerslogin/home/dashboard";
      return [
        { href: `${dashboardUrl}`, label: "Home", icon: Compass, active: pathname.startsWith("/partnerslogin/home/dashboard") && currentTab === "dashboard" },
        { href: `${dashboardUrl}&tab=bookings`, label: "Bookings", icon: WalletCards, active: pathname.startsWith("/partnerslogin/home/dashboard") && currentTab === "bookings" },
        { href: `${dashboardUrl}&tab=messages`, label: "Messages", icon: MessageCircle, active: pathname.startsWith("/partnerslogin/home/dashboard") && currentTab === "messages" },
        { href: `${dashboardUrl}&tab=calendar`, label: "Calendar", icon: CalendarDays, active: pathname.startsWith("/partnerslogin/home/dashboard") && currentTab === "calendar" },
      ];
    }

    return [
      { href: "/?app=1", label: "Explore", icon: Compass, active: pathname === "/" || pathname === "/homestays" || pathname.startsWith("/host/") || pathname.startsWith("/homes/") },
      { href: user ? "/bookings?app=1" : "/bookings?auth=true&app=1", label: "Bookings", icon: WalletCards, active: pathname === "/bookings" },
      { href: user ? "/messages?app=1" : "/messages?auth=true&app=1", label: "Messages", icon: MessageCircle, active: pathname === "/messages" },
    ];
  }, [appMode, currentTab, hostSession.dashboardUrl, pathname, user]);

  useEffect(() => {
    let ignore = false;

    void (async () => {
      try {
        const response = await fetch("/api/app/session", { cache: "no-store" });
        const payload = (await response.json()) as { hostSession?: HostSession };
        if (!ignore) {
          setHostSession(payload.hostSession ?? { active: false });
        }
      } catch {
        if (!ignore) {
          setHostSession({ active: false });
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [pathname, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(display-mode: standalone)");
    const syncStandalone = () => {
      setStandalone(media.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    };

    syncStandalone();
    media.addEventListener("change", syncStandalone);
    return () => {
      media.removeEventListener("change", syncStandalone);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permissionHandle = window.setTimeout(() => {
      setNotificationPermission(Notification.permission);
    }, 0);
    return () => window.clearTimeout(permissionHandle);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        setServiceWorkerReady(true);
      })
      .catch((error) => {
        console.error("[app-runtime] service worker registration failed", error);
      });
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--famlo-app-bottom-space", showMobileNav ? "76px" : "0px");
    return () => {
      document.documentElement.style.setProperty("--famlo-app-bottom-space", "0px");
    };
  }, [showMobileNav]);

  useEffect(() => {
    if (!serviceWorkerReady || notificationPermission !== "granted") return;
    if (!hostSession.active && !user?.id) return;

    let cancelled = false;

    const loadAndNotify = async () => {
      try {
        let conversations: ConversationRow[] = [];
        let unread = 0;
        let title = "Famlo update";
        let body = "You have a new Famlo message.";

        if (hostSession.active && (hostSession.familyId || hostSession.hostUserId)) {
          const params = new URLSearchParams();
          if (hostSession.familyId) params.set("familyId", hostSession.familyId);
          if (hostSession.hostUserId) params.set("hostUserId", hostSession.hostUserId);
          const response = await fetch(`/api/host/conversations?${params.toString()}`, { cache: "no-store" });
          conversations = (await response.json()) as ConversationRow[];
          unread = conversations.reduce((sum, row) => sum + Number(row.host_unread ?? 0), 0);
          title = "Famlo Host";
          body = unread > 1 ? `${unread} unread guest updates are waiting.` : "A guest sent you a new update.";
        } else if (user?.id) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const headers: Record<string, string> = {
            "x-famlo-user-id": user.id,
          };
          if (session?.access_token) {
            headers.Authorization = `Bearer ${session.access_token}`;
          }
          const response = await fetch("/api/user/conversations", { cache: "no-store", headers });
          conversations = (await response.json()) as ConversationRow[];
          unread = conversations.reduce((sum, row) => sum + Number(row.guest_unread ?? 0), 0);
          title = "Famlo";
          body = unread > 1 ? `${unread} unread host updates are waiting.` : "Your host sent a new update.";
        }

        if (cancelled) return;

        if (lastUnreadRef.current == null) {
          lastUnreadRef.current = unread;
          return;
        }

        if (unread > lastUnreadRef.current && document.visibilityState === "hidden") {
          const latestMessage = conversations.find((row) => row.last_message)?.last_message ?? body;
          if ("serviceWorker" in navigator) {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(title, {
              body: latestMessage,
              icon: "/icon-192x192.png",
              badge: "/icon-96x96.png",
              data: {
                url: hostSession.active ? `${hostSession.dashboardUrl ?? "/partnerslogin/home/dashboard"}&tab=messages` : "/messages",
              },
            });
          } else {
            new Notification(title, {
              body: latestMessage,
              icon: "/icon-192x192.png",
            });
          }
        }

        lastUnreadRef.current = unread;
      } catch (error) {
        console.error("[app-runtime] notification poll failed", error);
      }
    };

    void loadAndNotify();
    const interval = window.setInterval(() => {
      void loadAndNotify();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hostSession.active, hostSession.dashboardUrl, hostSession.familyId, hostSession.hostUserId, notificationPermission, serviceWorkerReady, supabase, user?.id]);

  return (
    <>
      {showMobileNav ? (
        <nav className="famlo-app-nav" aria-label="Famlo mobile navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`famlo-app-nav__item ${item.active ? "is-active" : ""}`}>
                <Icon size={22} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <style jsx>{`
        .famlo-app-nav {
          position: fixed;
          left: 0;
          bottom: 0;
          width: 100%;
          z-index: 1000;
          display: grid;
          grid-template-columns: repeat(${navItems.length}, minmax(0, 1fr));
          gap: 0;
          padding: 10px 0 calc(10px + env(safe-area-inset-bottom, 0px));
          background: rgba(10, 20, 40, 0.85);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: transform 220ms ease, opacity 220ms ease, background 220ms ease;
        }

        .famlo-app-nav__item {
          min-height: 56px;
          text-decoration: none;
          display: grid;
          place-items: center;
          grid-auto-flow: row;
          gap: 4px;
          color: #9ca3af;
          font-size: 11px;
          font-weight: 700;
          font-family: var(--font-ui);
          transition: transform 180ms ease, color 180ms ease, opacity 180ms ease;
          position: relative;
          overflow: hidden;
          text-align: center;
        }

        .famlo-app-nav__item.is-active {
          color: #4da6ff;
        }

        .famlo-app-nav__item svg {
          color: currentColor;
          opacity: 1;
          transition: transform 180ms ease, color 180ms ease;
        }

        .famlo-app-nav__item.is-active svg {
          transform: translateY(-1px);
        }

        .famlo-app-nav__item:active {
          transform: translateY(1px) scale(0.985);
        }

        @media (min-width: 900px) {
          .famlo-app-nav {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
