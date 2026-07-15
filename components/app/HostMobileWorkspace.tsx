"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BedDouble,
  CalendarDays,
  CircleOff,
  FileText,
  HelpCircle,
  Home,
  IndianRupee,
  MessageCircle,
  Plus,
  RefreshCcw,
  Settings2,
  Sparkles,
} from "lucide-react";

import type { HostMobileRouteKey, HostMobileSessionResponse } from "@/lib/host-mobile-session";

import styles from "./host-mobile-workspace.module.css";

type HostMobileWorkspaceProps = {
  activeRouteKey: HostMobileRouteKey;
  iframeHref: string;
  session: HostMobileSessionResponse;
};

function getInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((part) => part.trim()[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return letters || "FH";
}

export function HostMobileWorkspace({
  activeRouteKey,
  iframeHref,
  session,
}: HostMobileWorkspaceProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadedFrameHref, setLoadedFrameHref] = useState<string | null>(null);

  const isPro = session.pro.allowed;
  const isNativeFreeDashboard = activeRouteKey === "free" && !isPro;
  const hostName = session.host?.displayName ?? "Famlo Host";
  const propertyName = session.workspace?.selectedFamilyName ?? "Famlo workspace";
  const initials = getInitials(hostName);
  const propertiesHref = isPro ? "/app/host/pro" : "/app/host/free";

  const navItems = useMemo(
    () => [
      { href: propertiesHref, label: "Properties", routeKey: isPro ? "pro" : "free", icon: Home },
      { href: "/app/host/bookings", label: "Bookings", routeKey: "bookings", icon: Sparkles },
      { href: "/app/host/calendar", label: "Calendar", routeKey: "calendar", icon: CalendarDays },
      { href: "/app/host/messages", label: "Message", routeKey: "messages", icon: MessageCircle },
      { href: "/app/host/revenue", label: "Revenue", routeKey: "revenue", icon: BarChart3 },
      { href: "/app/host/reports", label: "Report", routeKey: "reports", icon: BarChart3 },
    ],
    [isPro, propertiesHref]
  );

  const freeDashboardNavItems = useMemo(
    () => [
      { href: "/app/host/free", label: "Dashboard", icon: Home, active: activeRouteKey === "free" },
      { href: "/app/host/free", label: "Rooms", icon: BedDouble, active: false },
      { href: "/app/host/bookings", label: "Booking", icon: FileText, active: false },
      { href: "/app/host/pro", label: "Pro", icon: Home, active: false, featured: true },
      { href: "/app/host/calendar", label: "Calendar", icon: CalendarDays, active: false },
      { href: "/app/host/messages", label: "Message", icon: MessageCircle, active: false },
      { href: "/app/host/revenue", label: "Earnings", icon: IndianRupee, active: false },
    ],
    [activeRouteKey]
  );

  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const frameLoading = loadedFrameHref !== iframeHref;

  return (
    <section className={`${styles.workspace} ${isNativeFreeDashboard ? styles.workspaceFreeDashboard : ""}`}>
      {isNativeFreeDashboard ? (
        <div className={styles.freeDashboardPhone}>
          <div className={styles.freeDashboardScroll}>
            <header className={styles.freeDashboardHeader}>
              <Image src="/logo-blue.png" alt="Famlo" width={110} height={32} className={styles.freeDashboardLogo} />
              <div className={styles.freeDashboardHeaderActions}>
                <button type="button" className={`${styles.freeDashboardActionButton} ${styles.freeDashboardActionPrimary}`} aria-label="Refresh dashboard">
                  <RefreshCcw size={18} />
                </button>
                <button type="button" className={styles.freeDashboardActionButton} aria-label="Add listing">
                  <Plus size={20} />
                </button>
                <button type="button" className={styles.freeDashboardActionButton} aria-label="Open settings">
                  <Settings2 size={18} />
                </button>
              </div>
            </header>

            <section className={styles.freeDashboardHero}>
              <div className={styles.freeDashboardToggleRow}>
                <span>Listing active for guest</span>
                <button type="button" className={styles.freeDashboardSwitch} aria-pressed="false">
                  <span className={styles.freeDashboardSwitchKnob} />
                  <span>OFF</span>
                </button>
              </div>
              <div className={styles.freeDashboardToggleRow}>
                <span>Booking Approval</span>
                <button type="button" className={styles.freeDashboardSwitch} aria-pressed="false">
                  <span className={styles.freeDashboardSwitchKnob} />
                  <span>OFF</span>
                </button>
              </div>
            </section>

            <div className={styles.freeDashboardTabs} role="tablist" aria-label="Dashboard range">
              <button type="button" className={`${styles.freeDashboardTab} ${styles.freeDashboardTabActive}`}>Today</button>
              <button type="button" className={styles.freeDashboardTab}>This week</button>
              <button type="button" className={styles.freeDashboardTab}>This Month</button>
              <button type="button" className={styles.freeDashboardTab}>This Year</button>
            </div>

            <section className={styles.freeDashboardStatsGrid}>
              <article className={styles.freeDashboardStatCard}>
                <span className={styles.freeDashboardStatLabel}>Total earnings</span>
                <strong className={styles.freeDashboardStatValue}>₹0</strong>
              </article>
              <article className={styles.freeDashboardStatCard}>
                <span className={styles.freeDashboardStatLabel}>Total bookings</span>
                <strong className={styles.freeDashboardStatValue}>0</strong>
              </article>
              <article className={styles.freeDashboardStatCard}>
                <span className={styles.freeDashboardStatLabel}>Active rooms</span>
                <strong className={`${styles.freeDashboardStatValue} ${styles.freeDashboardStatValueSuccess}`}>1</strong>
              </article>
              <article className={styles.freeDashboardStatCard}>
                <span className={styles.freeDashboardStatLabel}>Active capacity</span>
                <strong className={styles.freeDashboardStatValue}>2</strong>
              </article>
            </section>

            <section className={styles.freeDashboardPanel}>
              <div className={styles.freeDashboardPanelHeader}>
                <h2>Pending approval</h2>
                <span className={styles.freeDashboardCountBadge}>0</span>
              </div>
              <div className={styles.freeDashboardEmptyState}>
                <CircleOff size={24} />
                <strong>No bookings waiting for approval</strong>
                <p>When Booking approval is on, new paid Famlo bookings will show up here for a quick decision.</p>
              </div>
            </section>

            <section className={styles.freeDashboardPanel}>
              <div className={styles.freeDashboardPanelHeader}>
                <h2>Live dashboard</h2>
              </div>
              <div className={styles.freeDashboardInfoRows}>
                <div className={styles.freeDashboardInfoRow}>
                  <span>Listing status</span>
                  <strong>Hidden from guests</strong>
                </div>
                <div className={styles.freeDashboardInfoRow}>
                  <span>Booking approval</span>
                  <strong>Instant booking flow</strong>
                </div>
              </div>
            </section>
          </div>

          <div className={styles.freeDashboardBottomBar}>
            <nav className={styles.freeDashboardNav} aria-label="Free dashboard navigation">
              {freeDashboardNavItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={[
                      styles.freeDashboardNavItem,
                      item.active ? styles.freeDashboardNavItemActive : "",
                      item.featured ? styles.freeDashboardNavItemFeatured : "",
                    ].join(" ").trim()}
                    aria-current={item.active ? "page" : undefined}
                  >
                    <span className={styles.freeDashboardNavIconWrap}>
                      <Icon size={item.featured ? 30 : 18} />
                    </span>
                    <span>{item.label}</span>
                    {item.featured ? <em>PRO</em> : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : (
        <>
          <header className={styles.topBar}>
            <div className={styles.identityBlock}>
              <div className={styles.eyebrow}>Famlo Host Mobile</div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{propertyName}</h1>
              </div>
              <p className={styles.subtitle}>
                {hostName}
                {" · "}
                {isPro ? "Famlo Pro workspace" : "Famlo Host workspace"}
              </p>
            </div>

            <div className={styles.actions} ref={menuRef}>
              {session.badge.visible && session.badge.label ? (
                <span className={styles.envBadge}>{session.badge.label}</span>
              ) : null}
              <span className={styles.proPill}>
                <Sparkles size={16} />
                {isPro ? "Famlo Pro" : "Famlo Host"}
              </span>
              <button
                type="button"
                className={styles.avatarButton}
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open host profile menu"
              >
                {initials}
              </button>

              {menuOpen ? (
                <div className={styles.menu} role="menu" aria-label="Host profile menu">
                  <div className={styles.menuHeader}>
                    <span className={styles.menuName}>{hostName}</span>
                    <span className={styles.menuMeta}>{propertyName}</span>
                  </div>
                  <Link
                    href="/app/host/support-billing"
                    className={`${styles.menuLink} ${activeRouteKey === "support-billing" ? styles.isMenuActive : ""}`}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <HelpCircle size={18} />
                    <span>Support &amp; Billing</span>
                  </Link>
                  <Link
                    href="/app/host/profile"
                    className={`${styles.menuLink} ${activeRouteKey === "profile" ? styles.isMenuActive : ""}`}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Settings2 size={18} />
                    <span>Settings</span>
                  </Link>
                </div>
              ) : null}
            </div>
          </header>

          <div className={styles.viewport}>
            <div className={styles.frameShell}>
              <div className={`${styles.frameBackdrop} ${!frameLoading ? styles.isFrameHidden : ""}`} aria-hidden={!frameLoading}>
                <div className={styles.spinner} />
                <span>Loading your host workspace…</span>
              </div>
              <iframe
                title="Famlo host workspace"
                src={iframeHref}
                className={styles.frame}
                onLoad={() => setLoadedFrameHref(iframeHref)}
              />
            </div>
          </div>

          <div className={styles.bottomBanner}>
            <nav className={styles.navRail} aria-label="Host navigation banner">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active =
                  (item.routeKey === "free" && activeRouteKey === "free") ||
                  (item.routeKey === "pro" && activeRouteKey === "pro") ||
                  (item.routeKey !== "free" && item.routeKey !== "pro" && activeRouteKey === item.routeKey);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navItem} ${active ? styles.isNavActive : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </section>
  );
}
