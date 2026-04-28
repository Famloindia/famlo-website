"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useUser } from "@/components/auth/UserContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { useSearchParams, usePathname } from "next/navigation";

// Triggering hard reload for profile dropdown CSS updates
export default function Header() {
  return (
    <Suspense fallback={null}>
      <HeaderContent />
    </Suspense>
  );
}

function HeaderContent() {
  const { user, profile, loading, signOut } = useUser();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const isJoinPage = pathname === "/joinfamlo";
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [dismissedAuthToken, setDismissedAuthToken] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const authToken = `${pathname}?${searchParams.toString()}`;
  const urlWantsAuth = !loading && !user && (searchParams.get("auth") === "true" || searchParams.get("verify") === "true");
  const autoAuthOpen = urlWantsAuth && dismissedAuthToken !== authToken;
  const isAuthOpen = authModalOpen || autoAuthOpen;

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Outside click listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className={`header ${isScrolled ? "scrolled" : ""} ${isJoinPage ? "join-header" : ""}`}>
      <div className="shell header-inner">
        <Link href="/" className="logo-group">
          <img 
            src="/logo-blue.png" 
            alt="Famlo" 
            className={`logo-image ${isJoinPage ? "join-logo" : ""}`} 
            style={{
              height: isJoinPage ? "30px" : "26px",
              width: "auto",
              maxHeight: isJoinPage ? "30px" : "26px",
            }}
          />
        </Link>

        <nav className="header-nav">
          {!isJoinPage && (
            loading ? (
              <div className="skeleton-pill" />
            ) : user ? (
              <div className="auth-row">
                <button className="icon-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </button>
                
                <div className="user-dropdown-container" ref={dropdownRef}>
                  <button 
                    className="avatar-btn"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                  >
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile?.name || "Profile"}
                        className="avatar-image"
                      />
                    ) : (
                      profile?.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()
                    )}
                  </button>

                  {dropdownOpen && (
                    <div className="dropdown-menu">
                      <div className="dropdown-header">
                        <strong>Welcome</strong>
                        <span style={{ fontSize: "16px", fontWeight: "700", color: "#1e3a8a" }}>
                          {profile?.name || user.user_metadata?.full_name || "User"}
                        </span>
                        <span>{profile?.phone || user.phone || profile?.email || user.email}</span>
                      </div>
                      <div className="dropdown-tabs">
                        <Link href="/profile" passHref legacyBehavior>
                          <a className="tab-item" onClick={() => setDropdownOpen(false)}>Profile</a>
                        </Link>
                        <Link href="/bookings" passHref legacyBehavior>
                          <a className="tab-item" onClick={() => setDropdownOpen(false)}>My Bookings</a>
                        </Link>
                        <Link href="/messages" passHref legacyBehavior>
                          <a className="tab-item" onClick={() => setDropdownOpen(false)}>Messages</a>
                        </Link>
                        <button className="logout-btn" onClick={() => { signOut(); setDropdownOpen(false); }}>
                          Log out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="auth-btns">
                <button className="btn-primary" onClick={() => setAuthModalOpen(true)}>Log in / Sign up</button>
              </div>
            )
          )}
        </nav>
      </div>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => {
          setAuthModalOpen(false);
          if (urlWantsAuth) setDismissedAuthToken(authToken);
        }}
      />

      <style jsx>{`
        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 80px;
          z-index: 1000;
          transition: all 300ms ease;
          display: flex;
          align-items: center;
        }

        .header.join-header {
          height: 64px;
          background: #fff;
          border-bottom: 1px solid #f0f4ff;
          box-shadow: none;
        }

        .header.scrolled {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(16px);
          height: 70px;
          border-bottom: 1px solid var(--border-color);
        }

        .header-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .logo-group {
          display: flex;
          flex-direction: column;
        }

        .logo-image {
          height: 26px;
          width: auto;
          display: block;
          transition: transform 200ms ease;
        }

        .logo-image:hover {
          transform: scale(1.02);
        }

        .logo-image.join-logo {
          height: 30px;
        }

        .logo-tagline {
          font-family: var(--font-body);
          font-size: 11px;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .auth-btns {
          display: flex;
          gap: 12px;
        }

        .auth-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .icon-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          display: flex;
          padding: 8px;
        }

        .user-dropdown-container {
          position: relative;
        }

        .avatar-btn {
          width: 40px;
          height: 40px;
          padding: 0;
          border-radius: 50%;
          background: #f0f7ff;
          color: #3b82f6;
          border: 2px solid #e0e7ff;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
        }

        .avatar-btn:hover {
          border-color: #3b82f6;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.2);
        }

        .avatar-image {
          width: 100% !important;
          height: 100% !important;
          min-width: 100% !important;
          min-height: 100% !important;
          aspect-ratio: 1/1 !important;
          object-fit: cover !important;
          object-position: center !important;
          display: block !important;
          image-rendering: -webkit-optimize-contrast;
        }

        .dropdown-menu {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          width: 300px;
          background: #fdfdfd;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
          padding: 0;
          overflow: hidden;
          animation: fade-drop 250ms ease-out;
        }

        @keyframes fade-drop {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .dropdown-header {
          padding: 24px 28px;
          background: #f4f7fb;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .dropdown-header strong {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
        }

        .dropdown-header span {
          font-size: 15px;
          font-weight: 500;
          color: #64748b;
        }

        .dropdown-tabs {
          padding: 20px 24px 24px;
          display: grid;
          gap: 14px;
        }

        .tab-item {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          width: 100%;
          box-sizing: border-box;
          padding: 16px 20px;
          text-decoration: none;
          color: #1e3a8a;
          font-size: 16px;
          font-weight: 800;
          border-radius: 18px;
          transition: all 200ms ease;
          background: #fbfdff;
          border: 1px solid #dbeafe;
          white-space: nowrap;
        }

        .tab-item:hover {
          background: #eff6ff;
          border-color: #bfdbfe;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.08);
        }

        .logout-btn {
          width: 100%;
          text-align: left;
          padding: 16px 20px;
          background: #fff5f5;
          border: 1px solid #fecaca;
          border-radius: 18px;
          color: #dc2626;
          font-size: 16px;
          font-weight: 800;
          font-family: var(--font-ui), "Manrope", sans-serif;
          cursor: pointer;
          transition: all 200ms ease;
          margin-top: 4px;
        }

        .logout-btn:hover {
          background: #fee2e2;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.08);
        }

        .skeleton-pill {
          width: 100px;
          height: 40px;
          background: #eee;
          border-radius: 999px;
          animation: shimmer 1.5s infinite linear;
        }

        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }

        @media (max-width: 768px) {
          .dropdown-menu {
            width: 240px;
            border-radius: 16px;
          }
          .dropdown-header {
            padding: 16px 20px;
          }
          .dropdown-header strong {
            font-size: 16px;
          }
          .dropdown-header span:first-of-type {
            font-size: 14px !important;
          }
          .dropdown-header span:last-of-type {
            font-size: 12px;
          }
          .dropdown-tabs {
            padding: 12px 16px 16px;
            gap: 8px;
          }
          .tab-item, .logout-btn {
            padding: 10px 14px;
            font-size: 14px;
            border-radius: 12px;
          }
        }
      `}</style>
    </header>
  );
}
