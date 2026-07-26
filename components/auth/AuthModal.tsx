"use client";

import { Eye, EyeOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { buildOAuthCallbackUrl, getSafeGuestAuthReturnPath } from "@/lib/site-url";
import { useUser } from "./UserContext";

type AuthMode = "login" | "signup";
type AuthStep =
  | "main"
  | "email_signup"
  | "phone"
  | "phone_verify"
  | "email_sent"
  | "recovery"
  | "recovery_email"
  | "recovery_email_sent"
  | "recovery_phone"
  | "recovery_phone_verify"
  | "recovery_phone_password";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  returnTo?: string;
  skipProfileStep?: boolean;
}

const GENERIC_AUTH_ERROR = "Authentication could not be completed. Check your details and try again.";

export function AuthModal({
  isOpen,
  onClose,
  initialMode = "login",
  returnTo,
  skipProfileStep = false,
}: AuthModalProps): React.JSX.Element | null {
  const { refreshAuth } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<AuthStep>("main");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const safeReturnTo = getSafeGuestAuthReturnPath(
    returnTo ?? (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/")
  );

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setStep("main");
    setIdentifier("");
    setEmail("");
    setPhone("");
    setPassword("");
    setConfirmPassword("");
    setOtp("");
    setSessionId("");
    setShowPassword(false);
    setLoading(false);
    setError("");
    setMessage("");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  function closeModal(): void {
    setMode(initialMode);
    setStep("main");
    setError("");
    setMessage("");
    setOtp("");
    setSessionId("");
    onClose();
  }

  function switchMode(nextMode: AuthMode): void {
    setMode(nextMode);
    setStep("main");
    setError("");
    setMessage("");
    setOtp("");
    setSessionId("");
  }

  async function completeAuthentication(): Promise<void> {
    const snapshot = await refreshAuth();
    if (!skipProfileStep && !snapshot?.profileComplete) {
      const profileUrl = new URL("/profile", window.location.origin);
      profileUrl.searchParams.set("next", safeReturnTo);
      window.location.replace(`${profileUrl.pathname}${profileUrl.search}`);
      return;
    }
    window.location.replace(safeReturnTo);
  }

  async function handlePasswordLogin(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.session) throw new Error(payload.error ?? GENERIC_AUTH_ERROR);
      const { error: sessionError } = await supabase.auth.setSession(payload.session);
      if (sessionError) throw sessionError;
      await completeAuthentication();
    } catch {
      setError("The email, username, or password is incorrect.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignup(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/signup/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword, returnTo: safeReturnTo }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? GENERIC_AUTH_ERROR);
      if (payload.session) {
        const { error: sessionError } = await supabase.auth.setSession(payload.session);
        if (sessionError) throw sessionError;
        await completeAuthentication();
      } else {
        setStep("email_sent");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GENERIC_AUTH_ERROR);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(): Promise<void> {
    setLoading(true);
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: buildOAuthCallbackUrl(safeReturnTo) },
    });
    if (oauthError) {
      setError(GENERIC_AUTH_ERROR);
      setLoading(false);
    }
  }

  async function handleSendPhoneOtp(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "phone", value: phone, intent: "signup" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.sessionId) throw new Error(payload.error ?? GENERIC_AUTH_ERROR);
      setSessionId(payload.sessionId);
      setStep("phone_verify");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GENERIC_AUTH_ERROR);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPhoneOtp(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "phone",
          value: phone,
          otp,
          sessionId,
          intent: "signup",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? GENERIC_AUTH_ERROR);
      await completeAuthentication();
    } catch {
      setError("The verification code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoveryEmail(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      setMessage(
        payload.message ??
          "If an eligible account exists, password reset instructions have been sent."
      );
      setStep("recovery_email_sent");
    } catch {
      setError("Password recovery could not be started. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoveryPhoneOtp(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "phone", value: phone, intent: "login" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.sessionId) throw new Error();
      setSessionId(payload.sessionId);
      setStep("recovery_phone_verify");
    } catch {
      setError("Password recovery could not be started. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoveryPhoneVerify(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "phone",
          value: phone,
          otp,
          sessionId,
          intent: "login",
        }),
      });
      if (!response.ok) throw new Error();
      setPassword("");
      setConfirmPassword("");
      setStep("recovery_phone_password");
    } catch {
      setError("The verification code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoveryPhonePassword(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password/change", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? GENERIC_AUTH_ERROR);
      setMessage("Your password has been updated. You can now log in.");
      setPassword("");
      setConfirmPassword("");
      setStep("main");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GENERIC_AUTH_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const title =
    step.startsWith("recovery")
      ? "Reset your password"
      : mode === "login"
        ? "Welcome back"
        : "Create your Famlo account";

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeModal();
    }}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="guest-auth-title">
        <button type="button" className="icon-close" aria-label="Close" onClick={closeModal}>
          <X size={18} />
        </button>
        <header>
          <span className="auth-kicker">
            {step.startsWith("recovery") ? "Account recovery" : mode === "login" ? "Log in" : "Sign up"}
          </span>
          <h2 id="guest-auth-title">{title}</h2>
        </header>

        {step === "main" && mode === "login" ? (
          <form className="auth-stack" onSubmit={(event) => void handlePasswordLogin(event)}>
            <label>
              <span>Email or username</span>
              <input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
            </label>
            <label>
              <span>Password</span>
              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <button
              className="text-link align-right link-button"
              type="button"
              onClick={() => {
                setStep("recovery");
                setError("");
                setMessage("");
              }}
            >
              Forgot password?
            </button>
            {message ? <p className="auth-success">{message}</p> : null}
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>{loading ? "Logging in..." : "Log in"}</button>
            <button className="secondary-action" type="button" disabled={loading} onClick={() => void handleGoogle()}>Continue with Google</button>
            <button className="secondary-action" type="button" onClick={() => { setStep("phone"); setError(""); }}>Continue with phone</button>
            <p className="provider-note">First time using Google or phone? Your Famlo account will be created automatically.</p>
            <p className="switch-copy">New to Famlo? <button type="button" onClick={() => switchMode("signup")}>Sign up with email</button></p>
          </form>
        ) : null}

        {step === "main" && mode === "signup" ? (
          <div className="auth-stack">
            <button className="secondary-action" type="button" disabled={loading} onClick={() => void handleGoogle()}>Continue with Google</button>
            <button className="secondary-action" type="button" onClick={() => setStep("phone")}>Continue with phone</button>
            <button className="primary-action" type="button" onClick={() => setStep("email_signup")}>Continue with email</button>
            {error ? <p className="auth-error">{error}</p> : null}
            <p className="switch-copy">Already have an account? <button type="button" onClick={() => switchMode("login")}>Log in</button></p>
          </div>
        ) : null}

        {step === "email_signup" ? (
          <form className="auth-stack" onSubmit={(event) => void handleEmailSignup(event)}>
            <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label><span>Password</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label><span>Confirm password</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
            <label className="show-password"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show passwords</label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>{loading ? "Creating account..." : "Create account"}</button>
            <button className="text-action" type="button" onClick={() => setStep("main")}>Back</button>
          </form>
        ) : null}

        {step === "phone" ? (
          <form className="auth-stack" onSubmit={(event) => void handleSendPhoneOtp(event)}>
            <p className="auth-note">We will verify your phone and reopen or create your Famlo account.</p>
            <label><span>Phone number</span><input type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>{loading ? "Sending..." : "Send verification code"}</button>
            <button className="text-action" type="button" onClick={() => setStep("main")}>Back</button>
          </form>
        ) : null}

        {step === "phone_verify" ? (
          <form className="auth-stack" onSubmit={(event) => void handleVerifyPhoneOtp(event)}>
            <p className="auth-note">Enter the code sent to {phone}.</p>
            <label><span>Verification code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required /></label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>{loading ? "Verifying..." : mode === "login" ? "Verify and log in" : "Verify and sign up"}</button>
            <button className="text-action" type="button" onClick={() => setStep("phone")}>Change phone number</button>
          </form>
        ) : null}

        {step === "email_sent" ? (
          <div className="auth-stack">
            <p className="auth-success">Check your email and use the verification link to finish creating your account.</p>
            <button className="primary-action" type="button" onClick={closeModal}>Done</button>
          </div>
        ) : null}

        {step === "recovery" ? (
          <div className="auth-stack">
            <button className="primary-action" type="button" onClick={() => setStep("recovery_email")}>Reset using Email</button>
            <button className="secondary-action" type="button" onClick={() => setStep("recovery_phone")}>Reset using Phone</button>
            <button className="text-action" type="button" onClick={() => setStep("main")}>Back to log in</button>
          </div>
        ) : null}

        {step === "recovery_email" ? (
          <form className="auth-stack" onSubmit={(event) => void handleRecoveryEmail(event)}>
            <label><span>Registered email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>{loading ? "Sending..." : "Send recovery link"}</button>
            <button className="text-action" type="button" onClick={() => setStep("recovery")}>Back</button>
          </form>
        ) : null}

        {step === "recovery_email_sent" ? (
          <div className="auth-stack">
            <p className="auth-success">{message}</p>
            <p className="auth-note">Open the secure link in your email to choose and confirm a new password.</p>
            <button className="primary-action" type="button" onClick={() => setStep("main")}>Back to log in</button>
          </div>
        ) : null}

        {step === "recovery_phone" ? (
          <form className="auth-stack" onSubmit={(event) => void handleRecoveryPhoneOtp(event)}>
            <label><span>Registered phone</span><input type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>{loading ? "Sending..." : "Send secure OTP"}</button>
            <button className="text-action" type="button" onClick={() => setStep("recovery")}>Back</button>
          </form>
        ) : null}

        {step === "recovery_phone_verify" ? (
          <form className="auth-stack" onSubmit={(event) => void handleRecoveryPhoneVerify(event)}>
            <label><span>Secure OTP</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required /></label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>{loading ? "Verifying..." : "Verify phone"}</button>
            <button className="text-action" type="button" onClick={() => setStep("recovery_phone")}>Change phone number</button>
          </form>
        ) : null}

        {step === "recovery_phone_password" ? (
          <form className="auth-stack" onSubmit={(event) => void handleRecoveryPhonePassword(event)}>
            <label><span>New password</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label><span>Confirm password</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
            <label className="show-password"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show passwords</label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>{loading ? "Updating..." : "Update password"}</button>
          </form>
        ) : null}
      </section>

      <style jsx>{`
        .auth-overlay { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, .62); backdrop-filter: blur(8px); overflow-y: auto; }
        .auth-dialog { position: relative; width: min(100%, 460px); max-height: calc(100dvh - 32px); overflow-y: auto; background: #fff; border: 1px solid #dbeafe; border-radius: 22px; box-shadow: 0 24px 64px rgba(15, 38, 80, .18); padding: 28px; }
        .icon-close { position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 12px; background: #f1f5f9; color: #334155; cursor: pointer; }
        header { display: grid; gap: 5px; margin-bottom: 22px; padding-right: 38px; }
        h2 { margin: 0; font-size: 25px; color: #0f2650; }
        .auth-kicker { color: #2563eb; font-size: 11px; font-weight: 800; text-transform: uppercase; }
        .auth-stack { display: grid; gap: 13px; }
        label { display: grid; gap: 6px; color: #334155; font-size: 12px; font-weight: 800; }
        input { width: 100%; height: 46px; border: 1px solid #cbd5e1; border-radius: 13px; padding: 0 12px; font: inherit; font-size: 14px; color: #0f172a; box-sizing: border-box; }
        input:focus { outline: 2px solid #bfdbfe; border-color: #2563eb; }
        .password-field { position: relative; }
        .password-field input { padding-right: 48px; }
        .password-field button { position: absolute; right: 4px; top: 4px; width: 38px; height: 38px; border: 0; border-radius: 10px; background: transparent; color: #475569; cursor: pointer; }
        .primary-action, .secondary-action, .text-action { min-height: 46px; border-radius: 13px; font-weight: 800; cursor: pointer; }
        .primary-action { border: 1px solid var(--accent-primary); background: var(--accent-primary); color: #fff; }
        .primary-action:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
        .secondary-action { border: 1px solid #bfdbfe; background: #fff; color: #174ea6; }
        .text-action { border: 0; background: transparent; color: #2563eb; }
        .primary-action:focus-visible, .secondary-action:focus-visible, .text-action:focus-visible, .icon-close:focus-visible, .password-field button:focus-visible, .link-button:focus-visible, .switch-copy button:focus-visible { outline: 3px solid var(--accent-light); outline-offset: 2px; }
        button:disabled { opacity: .6; cursor: not-allowed; }
        .text-link { color: #1d4ed8; font-size: 12px; font-weight: 700; text-decoration: none; }
        .link-button { border: 0; padding: 0; background: transparent; cursor: pointer; }
        .align-right { justify-self: end; }
        .switch-copy { margin: 3px 0 0; text-align: center; color: #64748b; font-size: 13px; }
        .provider-note { margin: 0; color: #64748b; font-size: 12px; line-height: 1.5; text-align: center; }
        .switch-copy button { border: 0; background: transparent; color: #1d4ed8; font-weight: 800; cursor: pointer; }
        .auth-error, .auth-success, .auth-note { margin: 0; border-radius: 11px; padding: 10px 12px; font-size: 13px; line-height: 1.5; }
        .auth-error { background: #fef2f2; color: #b91c1c; }
        .auth-success { background: #ecfdf5; color: #166534; }
        .auth-note { background: #eff6ff; color: #1e40af; }
        .show-password { display: flex; align-items: center; gap: 8px; }
        .show-password input { width: 16px; height: 16px; }
        @media (max-width: 520px) { .auth-overlay { padding: 0; align-items: end; } .auth-dialog { width: 100%; max-height: 94dvh; border-radius: 22px 22px 0 0; padding: 24px 18px max(24px, env(safe-area-inset-bottom)); } }
      `}</style>
    </div>
  );
}
