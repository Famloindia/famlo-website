"use client";

import { useState } from "react";
import { useUser } from "./UserContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { isGuestProfileComplete } from "@/lib/user-profile";

export function AuthBubble() {
  const { user, profile, loading, signOut } = useUser();
  const [showModal, setShowModal] = useState(false);

  if (loading) return null;

  return (
    <>
      <div className="auth-bubble-container">
        {user ? (
          <div className="auth-bubble authenticated">
            <div className="auth-info">
              <p className="auth-welcome">Welcome, {profile?.name || "User"}</p>
              {!isGuestProfileComplete(profile) && (
                <span className="auth-warning">Complete profile to book</span>
              )}
            </div>
            <button onClick={signOut} className="auth-btn logout">Sign Out</button>
          </div>
        ) : (
          <button 
            onClick={() => setShowModal(true)} 
            className="auth-bubble unauthenticated"
          >
            <span className="auth-icon">🔐</span>
            <span>Sign In to Book</span>
          </button>
        )}
      </div>

      {showModal && <AuthModal isOpen={showModal} onClose={() => setShowModal(false)} />}

      <style jsx>{`
        .auth-bubble-container {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          z-index: 1000;
          pointer-events: auto;
        }

        .auth-bubble {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 50px;
          padding: 0.75rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }

        .auth-bubble:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.15);
        }

        .auth-icon {
          font-size: 1.25rem;
        }

        .auth-welcome {
          font-weight: 600;
          font-size: 0.9rem;
          margin: 0;
        }

        .auth-warning {
          font-size: 0.75rem;
          color: #e53e3e;
          display: block;
        }

        .auth-btn {
          border: none;
          background: #000;
          color: #fff;
          padding: 0.4rem 1rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .auth-btn:hover {
          background: #333;
        }

        .unauthenticated {
          background: #000;
          color: #fff;
          border: none;
        }

        .unauthenticated:hover {
          background: #222;
        }
      `}</style>
    </>
  );
}
