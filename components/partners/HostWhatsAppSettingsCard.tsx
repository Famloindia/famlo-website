"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, CheckCircle2, MessageCircle, X } from "lucide-react";

type Settings = {
  phoneMasked: string | null;
  hasPhone: boolean;
  verified: boolean;
  enabled: boolean;
  optedIn: boolean;
  source: string | null;
  language: string;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: string | null;
  hasDeliveryIssue: boolean;
  deliveryGloballyEnabled: boolean;
};

const emptySettings: Settings = {
  phoneMasked: null,
  hasPhone: false,
  verified: false,
  enabled: false,
  optedIn: false,
  source: null,
  language: "en",
  lastDeliveryStatus: null,
  lastDeliveryAt: null,
  hasDeliveryIssue: false,
  deliveryGloballyEnabled: false,
};

export function HostWhatsAppSettingsCard(): React.JSX.Element {
  const titleId = useId();
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      try {
        const response = await fetch("/api/host/whatsapp-settings", { cache: "no-store" });
        const payload = (await response.json()) as { settings?: Settings; error?: string };
        if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Unable to load WhatsApp settings.");
        if (!cancelled) setSettings(payload.settings);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load WhatsApp settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function openEditor(): void {
    setPhone("");
    setConsent(settings.optedIn);
    setChallengeId(null);
    setOtp("");
    setMessage(null);
    setError(null);
    setDialogOpen(true);
  }

  async function toggleEnabled(nextEnabled: boolean): Promise<void> {
    const previous = settings;
    setSettings((current) => ({ ...current, enabled: nextEnabled }));
    setSaving(true);
    setError(null);
    try {
      if (nextEnabled && (!settings.verified || !settings.optedIn)) {
        setSettings(previous);
        openEditor();
        return;
      }
      const response = await fetch("/api/host/whatsapp-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const payload = (await response.json()) as { settings?: Settings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Unable to update WhatsApp alerts.");
      setSettings(payload.settings);
      setMessage(nextEnabled ? "WhatsApp alerts enabled." : "WhatsApp alerts disabled.");
    } catch (toggleError) {
      setSettings(previous);
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update WhatsApp alerts.");
    } finally {
      setSaving(false);
    }
  }

  async function sendOtp(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/host/whatsapp-settings/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, consent }),
      });
      const payload = (await response.json()) as { challengeId?: string; error?: string };
      if (!response.ok || !payload.challengeId) throw new Error(payload.error ?? "Unable to send verification code.");
      setChallengeId(payload.challengeId);
      setMessage("Verification code sent.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send verification code.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyOtp(): Promise<void> {
    if (!challengeId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/host/whatsapp-settings/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code: otp }),
      });
      const payload = (await response.json()) as { settings?: Settings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Unable to verify the code.");
      setSettings(payload.settings);
      setDialogOpen(false);
      setMessage("WhatsApp number verified.");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to verify the code.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestMessage(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/host/whatsapp-settings/test", { method: "POST" });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Unable to send a test message.");
      setMessage(payload.message ?? "Test message queued.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Unable to send a test message.");
    } finally {
      setSaving(false);
    }
  }

  const status = loading
    ? "Loading"
    : settings.hasDeliveryIssue
      ? "Delivery issue"
      : settings.verified
        ? "Verified"
        : settings.hasPhone
          ? "Verification required"
          : "No number";

  return (
    <>
      <section
        aria-labelledby={titleId}
        style={{
          marginTop: "16px",
          border: "1px solid rgba(34, 197, 94, 0.22)",
          background: "#f0fdf4",
          borderRadius: "8px",
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534" }}>
              <MessageCircle size={18} aria-hidden="true" />
              <h3 id={titleId} style={{ margin: 0, fontSize: "13px", textTransform: "uppercase" }}>
                WhatsApp Alerts
              </h3>
            </div>
            <div style={{ marginTop: "14px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ color: "#0f172a" }}>{settings.phoneMasked ?? "No WhatsApp number added"}</strong>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  color: settings.hasDeliveryIssue ? "#b91c1c" : settings.verified ? "#166534" : "#92400e",
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                {settings.hasDeliveryIssue ? <AlertTriangle size={14} /> : settings.verified ? <CheckCircle2 size={14} /> : null}
                {status}
              </span>
            </div>
            <p style={{ margin: "8px 0 0", color: "#475569", fontSize: "13px", fontWeight: 600 }}>
              Booking requests, guest messages and important account updates will be sent to this number.
            </p>
            {!settings.deliveryGloballyEnabled ? (
              <p role="status" style={{ margin: "10px 0 0", color: "#9a3412", fontSize: "12px", fontWeight: 800 }}>
                WhatsApp delivery is not active yet.
              </p>
            ) : null}
            {settings.lastDeliveryStatus ? (
              <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "12px" }}>
                Latest delivery: {settings.lastDeliveryStatus}
              </p>
            ) : (
              <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "12px" }}>Latest delivery: No delivery yet</p>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 800, color: "#14532d" }}>
            <span>WhatsApp Alerts</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Enable WhatsApp alerts"
              checked={settings.enabled}
              disabled={loading || saving}
              onChange={(event) => void toggleEnabled(event.target.checked)}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "18px", flexWrap: "wrap" }}>
          <button type="button" className="button-like secondary" onClick={openEditor} disabled={loading || saving}>
            Edit Number
          </button>
          <button
            type="button"
            className="button-like secondary"
            disabled={!settings.deliveryGloballyEnabled || !settings.enabled || saving}
            title={!settings.deliveryGloballyEnabled ? "WhatsApp delivery is not active yet." : undefined}
            onClick={() => void sendTestMessage()}
          >
            Send Test Message
          </button>
        </div>
        {message ? <p role="status" style={{ color: "#166534", margin: "12px 0 0", fontWeight: 700 }}>{message}</p> : null}
        {error ? <p role="alert" style={{ color: "#b91c1c", margin: "12px 0 0", fontWeight: 700 }}>{error}</p> : null}
      </section>

      {dialogOpen ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.48)",
            display: "grid",
            placeItems: "center",
            padding: "16px",
          }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !saving) setDialogOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${titleId}-dialog`}
            style={{ width: "min(100%, 440px)", background: "white", borderRadius: "8px", padding: "24px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center" }}>
              <h3 id={`${titleId}-dialog`} style={{ margin: 0 }}>Verify WhatsApp number</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                style={{ border: 0, background: "transparent", padding: "6px", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {!challengeId ? (
              <>
                <label style={{ display: "grid", gap: "7px", marginTop: "20px", fontWeight: 700 }}>
                  WhatsApp number
                  <input
                    type="tel"
                    inputMode="tel"
                    autoFocus
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+91 98765 43210"
                    className="text-input"
                  />
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "9px", marginTop: "16px" }}>
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  <span>I consent to receive booking and important account updates on WhatsApp.</span>
                </label>
                <button
                  type="button"
                  className="button-like"
                  style={{ marginTop: "20px", width: "100%" }}
                  onClick={() => void sendOtp()}
                  disabled={saving || !phone.trim()}
                >
                  {saving ? "Sending..." : "Send verification code"}
                </button>
              </>
            ) : (
              <>
                <label style={{ display: "grid", gap: "7px", marginTop: "20px", fontWeight: 700 }}>
                  Six-digit code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-input"
                  />
                </label>
                <button
                  type="button"
                  className="button-like"
                  style={{ marginTop: "20px", width: "100%" }}
                  onClick={() => void verifyOtp()}
                  disabled={saving || otp.length !== 6}
                >
                  {saving ? "Verifying..." : "Verify number"}
                </button>
              </>
            )}
            {message ? <p role="status" style={{ color: "#166534", marginBottom: 0 }}>{message}</p> : null}
            {error ? <p role="alert" style={{ color: "#b91c1c", marginBottom: 0 }}>{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
