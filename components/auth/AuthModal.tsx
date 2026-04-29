"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useUser } from "./UserContext";
import { ProfileCompletionForm } from "@/components/account/ProfileCompletionForm";
import { isGuestProfileComplete } from "@/lib/user-profile";
import { buildOAuthCallbackUrl } from "@/lib/site-url";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  skipProfileStep?: boolean;
}

export function AuthModal({ isOpen, onClose, skipProfileStep = false }: AuthModalProps) {
  const { user, profile, refreshAuth } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [type, setType] = useState<"phone" | "email">("phone");
  const [value, setValue] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"enter" | "verify" | "profile">("enter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStep = skipProfileStep
    ? step
    : (user && !isGuestProfileComplete(profile)) ? "profile" : step;

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError("");

    try {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildOAuthCallbackUrl(nextPath),
        },
      });

      if (oauthError) throw oauthError;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSessionId(data.sessionId || "");
      setStep("verify");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value, otp, sessionId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.session) {
        await supabase.auth.setSession(data.session);
      } else if (data.sessionCredentials?.phone && data.sessionCredentials?.password) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          phone: data.sessionCredentials.phone,
          password: data.sessionCredentials.password,
        });

        if (signInError) throw signInError;
      } else if (data.sessionCredentials?.email && data.sessionCredentials?.password) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.sessionCredentials.email,
          password: data.sessionCredentials.password,
        });

        if (signInError) throw signInError;
      }

      await refreshAuth();
      if (skipProfileStep) {
        onClose();
      } else {
        setStep("profile");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>
        
        {currentStep === "enter" && (
          <form className="auth-form" onSubmit={handleSendOtp}>
            <h2>{type === "phone" ? "Enter Mobile Number" : "Enter Email Address"}</h2>
            <p className="auth-subtitle">
              We will send a 6-digit OTP to verify your account.
            </p>

            <button type="button" className="google-btn" disabled={loading} onClick={() => void handleGoogleAuth()}>
              {loading ? "Opening Google..." : "Continue with Google"}
            </button>

            <div className="auth-divider"><span>or</span></div>
            
            <div className="type-toggle">
              <button 
                type="button" 
                className={type === "phone" ? "active" : ""} 
                onClick={() => setType("phone")}
              >Phone</button>
              <button 
                type="button" 
                className={type === "email" ? "active" : ""} 
                onClick={() => setType("email")}
              >Email</button>
            </div>

            <input 
              type={type === "phone" ? "tel" : "email"} 
              placeholder={type === "phone" ? "+91 XXXXX XXXXX" : "name@example.com"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="auth-input"
              required
            />
            
            {error && <p className="error-msg">{error}</p>}
            
            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? "Please wait..." : "Send OTP"}
            </button>
          </form>
        )}

        {currentStep === "verify" && (
          <form className="auth-form" onSubmit={handleVerifyOtp}>
            <h2>Verify code</h2>
            <p className="auth-subtitle">Sent to {value}</p>
            {type === "phone" ? <p className="auth-note">OTP may arrive on a phone call as well.</p> : null}
            
            <input 
              type="text" 
              placeholder="123 456"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="auth-input otp-input"
              required
            />

            {error && <p className="error-msg">{error}</p>}
            
            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? "Verifying..." : "Confirm & Login"}
            </button>
            <button 
              type="button" 
              className="back-btn" 
              onClick={() => setStep("enter")}
            >Change Phone/Email</button>
          </form>
        )}

        {currentStep === "profile" && (
          <ProfileCompletionForm
            compact
            title="Complete your profile"
            description="Save your guest profile before you continue to booking."
            buttonLabel="Save and continue"
            onSuccess={onClose}
          />
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(8px);
          z-index: 9999;
          overflow: hidden;
          overscroll-behavior: contain;
          display: block;
        }

        .modal-content {
          background: #fff;
          width: calc(100% - 32px);
          max-width: 500px;
          max-height: calc(100vh - 40px);
          border-radius: 24px;
          padding: 1.75rem;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #e2e8f0 transparent;
          animation: modal-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes modal-pop {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        .modal-content::-webkit-scrollbar {
          width: 4px;
        }

        .modal-content::-webkit-scrollbar-thumb {
          background-color: #e2e8f0;
          border-radius: 10px;
        }

        .close-btn {
          position: absolute;
          top: 1.25rem;
          right: 1.25rem;
          z-index: 10;
          background: #f1f5f9;
          border: none;
          font-size: 1.25rem;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }

        .close-btn:hover {
          color: #0f172a;
          background: #e2e8f0;
          transform: rotate(90deg);
        }

        .auth-form h2 {
          font-size: 1.5rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          letter-spacing: -0.02em;
          color: #0f172a;
          padding-right: 32px;
        }

        .auth-subtitle {
          color: #64748b;
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
          font-weight: 500;
          max-width: 80%;
        }

        .auth-note {
          color: #1e40af;
          background: #eff6ff;
          padding: 8px 12px;
          border-radius: 10px;
          margin: -0.5rem 0 1.25rem;
          font-size: 0.82rem;
          line-height: 1.4;
          font-weight: 600;
        }

        .type-toggle {
          display: flex;
          background: #f1f5f9;
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 1.25rem;
        }

        .type-toggle button {
          flex: 1;
          border: none;
          background: none;
          padding: 8px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          color: #64748b;
        }

        .type-toggle button.active {
          background: #fff;
          color: #0f172a;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .google-btn {
          width: 100%;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #0f172a;
          border-radius: 12px;
          padding: 12px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          margin-bottom: 1rem;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .google-btn:hover {
          background: #f8fafc;
        }

        .auth-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #cbd5e1;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 1rem;
        }

        .auth-divider::before,
        .auth-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #f1f5f9;
        }

        .auth-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 2px solid #f1f5f9;
          font-size: 1rem;
          margin-bottom: 1.25rem;
          outline: none;
          transition: all 0.2s;
          background: #f8fafc;
          box-sizing: border-box;
        }

        .auth-input:focus {
          border-color: #3b82f6;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.06);
        }

        .otp-input {
          text-align: center;
          letter-spacing: 0.4rem;
          font-weight: 800;
          font-size: 1.75rem;
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          background: #0f172a;
          color: #fff;
          border: none;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .submit-btn:hover {
          background: #1e293b;
          transform: translateY(-1px);
        }

        .submit-btn:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
        }

        .error-msg {
          color: #b91c1c;
          margin-bottom: 1rem;
          font-size: 0.85rem;
          font-weight: 600;
          background: #fef2f2;
          padding: 10px;
          border-radius: 8px;
        }

        .back-btn {
          width: 100%;
          background: none;
          border: none;
          color: #64748b;
          margin-top: 1rem;
          font-size: 0.85rem;
          font-weight: 600;
          text-decoration: underline;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
