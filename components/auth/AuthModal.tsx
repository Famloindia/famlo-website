"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useUser } from "./UserContext";
import { ProfileForm } from "./ProfileForm";
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
    if (isOpen && user && (skipProfileStep || isGuestProfileComplete(profile))) {
      onClose();
    }
  }, [isOpen, onClose, profile, skipProfileStep, user]);

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
          <ProfileForm onSuccess={onClose} />
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(5px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .modal-content {
          background: #fff;
          width: 100%;
          max-width: 450px;
          border-radius: 24px;
          padding: 2.5rem;
          position: relative;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }

        .close-btn {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          background: none;
          border: none;
          font-size: 2rem;
          line-height: 1;
          cursor: pointer;
          color: #999;
          transition: color 0.2s;
        }

        .close-btn:hover {
          color: #333;
        }

        .auth-form h2 {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          letter-spacing: -0.5px;
        }

        .auth-subtitle {
          color: #666;
          margin-bottom: 2rem;
        }

        .auth-note {
          color: #64748b;
          margin: -1rem 0 1rem;
          font-size: 0.92rem;
          line-height: 1.4;
        }

        .type-toggle {
          display: flex;
          background: #f0f0f0;
          border-radius: 12px;
          padding: 0.25rem;
          margin-bottom: 1.5rem;
        }

        .type-toggle button {
          flex: 1;
          border: none;
          background: none;
          padding: 0.6rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .type-toggle button.active {
          background: #fff;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
        }

        .google-btn {
          width: 100%;
          border: 1px solid #dbe5ff;
          background: #f8fbff;
          color: #0f172a;
          border-radius: 12px;
          padding: 0.95rem 1rem;
          font-size: 0.98rem;
          font-weight: 700;
          cursor: pointer;
          margin-bottom: 1rem;
        }

        .auth-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #94a3b8;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }

        .auth-divider::before,
        .auth-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #e2e8f0;
        }

        .auth-input {
          width: 100%;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          border: 1px solid #ddd;
          font-size: 1rem;
          margin-bottom: 1.5rem;
          outline: none;
          transition: border-color 0.2s;
        }

        .auth-input:focus {
          border-color: #000;
        }

        .otp-input {
          text-align: center;
          letter-spacing: 0.5rem;
          font-weight: 700;
          font-size: 1.5rem;
        }

        .submit-btn {
          width: 100%;
          padding: 1.1rem;
          border-radius: 12px;
          background: #000;
          color: #fff;
          border: none;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s;
        }

        .submit-btn:hover {
          background: #333;
          transform: translateY(-2px);
        }

        .submit-btn:disabled {
          background: #999;
          transform: none;
        }

        .error-msg {
          color: #e53e3e;
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
        }

        .back-btn {
          width: 100%;
          background: none;
          border: none;
          color: #666;
          margin-top: 1rem;
          font-size: 0.9rem;
          text-decoration: underline;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
