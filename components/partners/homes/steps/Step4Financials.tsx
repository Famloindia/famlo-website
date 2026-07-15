"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileText, X } from "lucide-react";

import styles from "../../onboarding.module.css";
import { FAMLO_MASTER_PLATFORM_AGREEMENT } from "@/lib/famlo-master-platform-agreement";

const QUARTERS = [
  { id: "morning", label: "Morning", field: "morningRate", enabledField: "morningSelected", placeholder: "7AM - 12PM" },
  { id: "afternoon", label: "Afternoon", field: "afternoonRate", enabledField: "afternoonSelected", placeholder: "12PM - 5PM" },
  { id: "evening", label: "Evening", field: "eveningRate", enabledField: "eveningSelected", placeholder: "5PM - 10PM" },
  { id: "fullday", label: "Full day", field: "fullDayRate", enabledField: "fullDaySelected", placeholder: "7AM - 10PM" },
] as const;

const AGREEMENTS = [
  { id: "hostAgreementAccepted", label: "Host Service Agreement" },
  { id: "termsPrivacyAccepted", label: "Terms, Privacy and Consent" },
  { id: "commissionAgreementAccepted", label: "Commission and Platform Fee Terms" },
  { id: "codeOfConductAccepted", label: "Code of Conduct" },
  { id: "cancellationPolicyAccepted", label: "Cancellation and Penalty Terms" },
] as const;

export default function Step4Financials({ data, update }: any) {
  const [agreementOpen, setAgreementOpen] = useState(false);

  const estimatedMonthlyEarnings = useMemo(() => {
    return QUARTERS.reduce((total, quarter) => {
      if (!data[quarter.enabledField]) return total;
      const value = Number(data[quarter.field]) || 0;
      return total + value * 8;
    }, 0);
  }, [data]);

  return (
    <div className={styles.animateIn}>
      <div className={styles.onboardingHeader}>
        <span className={styles.eyebrow} style={{ color: "#0e2b57" }}>Payments & Payouts</span>
        <h1>Payment Setup</h1>
        <p>Choose which booking quarters you want to offer and set a direct price for each one.</p>
      </div>

      <div className={styles.formGrid}>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Quarter pricing</label>
          <div
            style={{
              display: "grid",
              gap: "16px",
              borderRadius: "24px",
              border: "1px solid #dbeafe",
              background: "#f8fbff",
              padding: "20px",
            }}
          >
            {QUARTERS.map((quarter) => {
              const enabled = Boolean(data[quarter.enabledField]);
              return (
                <div
                  key={quarter.id}
                  style={{
                    display: "grid",
                    gap: "12px",
                    borderRadius: "18px",
                    border: enabled ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                    background: enabled ? "white" : "#f8fafc",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 900, color: "#0e2b57" }}>{quarter.label}</div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "rgba(14, 43, 87, 0.55)" }}>{quarter.placeholder}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => update(quarter.enabledField, !enabled)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "999px",
                        border: enabled ? "2px solid #165dcc" : "1px solid #cbd5e1",
                        background: enabled ? "#eff6ff" : "white",
                        color: "#165dcc",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {enabled ? "Selected" : "Enable"}
                    </button>
                  </div>

                  <input
                    className={styles.inputField}
                    type="number"
                    min="1"
                    name={quarter.field}
                    value={data[quarter.field] ?? ""}
                    disabled={!enabled}
                    onChange={(event) => update(quarter.field, event.target.value)}
                    placeholder={`Set ${quarter.label.toLowerCase()} price in INR`}
                    style={{ opacity: enabled ? 1 : 0.55 }}
                  />
                </div>
              );
            })}

            <div style={{ fontSize: "12px", color: "rgba(14, 43, 87, 0.65)", fontWeight: 700 }}>
              Estimated monthly payout potential based on 8 bookings per active quarter: ₹{estimatedMonthlyEarnings.toLocaleString("en-IN")}
            </div>
          </div>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Payment Destination (UPI or Bank)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "12px" }}>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "9px" }}>Primary UPI ID</label>
              <input className={styles.inputField} name="upiId" autoComplete="off" value={data.upiId} onInput={e => update("upiId", (e.target as HTMLInputElement).value)} onChange={e => update("upiId", e.target.value)} placeholder="e.g. mobile-no@upi" />
            </div>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "9px" }}>Account Holder Name</label>
              <input className={styles.inputField} name="accountHolderName" autoComplete="name" value={data.accountHolderName} onInput={e => update("accountHolderName", (e.target as HTMLInputElement).value)} onChange={e => update("accountHolderName", e.target.value)} placeholder="Must match your bank record" />
            </div>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "9px" }}>Bank Account Number</label>
              <input className={styles.inputField} name="accountNumber" autoComplete="off" inputMode="numeric" type="password" value={data.accountNumber} onInput={e => update("accountNumber", (e.target as HTMLInputElement).value)} onChange={e => update("accountNumber", e.target.value)} placeholder="•••• •••• ••••" />
            </div>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "9px" }}>Confirm Account Number</label>
              <input className={styles.inputField} name="confirmAccountNumber" autoComplete="off" inputMode="numeric" value={data.confirmAccountNumber} onInput={e => update("confirmAccountNumber", (e.target as HTMLInputElement).value)} onChange={e => update("confirmAccountNumber", e.target.value)} placeholder="Re-enter account number" />
            </div>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "9px" }}>IFSC Code</label>
              <input className={styles.inputField} name="ifscCode" autoCapitalize="characters" autoComplete="off" value={data.ifscCode} onInput={e => update("ifscCode", (e.target as HTMLInputElement).value.toUpperCase())} onChange={e => update("ifscCode", e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" />
            </div>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "9px" }}>Bank Name (Optional)</label>
              <input className={styles.inputField} name="bankName" autoComplete="organization" value={data.bankName} onInput={e => update("bankName", (e.target as HTMLInputElement).value)} onChange={e => update("bankName", e.target.value)} placeholder="e.g. SBI, HDFC" />
            </div>
          </div>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>GST Declaration (if applicable)</label>
          <div style={{ display: "grid", gap: "14px", borderRadius: "20px", border: "1px solid #dbeafe", background: "#f8fbff", padding: "18px" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  update("gstApplicable", true);
                  update("gstDeclarationAccepted", false);
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: "14px",
                  border: data.gstApplicable ? "2px solid #165dcc" : "1px solid #dbeafe",
                  background: data.gstApplicable ? "#eff6ff" : "white",
                  color: "#165dcc",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                GST applicable to me
              </button>
              <button
                type="button"
                onClick={() => {
                  update("gstApplicable", false);
                  update("gstDeclarationAccepted", false);
                  update("gstNumber", "");
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: "14px",
                  border: data.gstApplicable ? "1px solid #dbeafe" : "2px solid #165dcc",
                  background: data.gstApplicable ? "white" : "#eff6ff",
                  color: "#165dcc",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                GST not applicable
              </button>
            </div>
            {data.gstApplicable ? (
              <>
                <input
                  className={styles.inputField}
                  value={data.gstNumber}
                  onChange={(e) => update("gstNumber", e.target.value.toUpperCase())}
                  placeholder="GST number (optional but recommended)"
                />
                <label style={{ display: "flex", alignItems: "start", gap: "10px", fontSize: "13px", color: "#0e2b57", fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(data.gstDeclarationAccepted)}
                    onChange={(e) => update("gstDeclarationAccepted", e.target.checked)}
                    style={{ marginTop: "2px" }}
                  />
                  I confirm that the GST details declared here are accurate and I understand Famlo may request supporting tax documents later.
                </label>
              </>
            ) : (
              <div style={{ fontSize: "13px", color: "rgba(14, 43, 87, 0.6)", fontWeight: 700 }}>
                You can proceed without GST details if GST is not applicable to this property.
              </div>
            )}
          </div>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Legal Agreements & Consents</label>
          <div style={{ display: "grid", gap: "12px", borderRadius: "24px", border: "1px solid #dbeafe", background: "#f8fbff", padding: "24px" }}>
            <p style={{ fontSize: "12px", color: "rgba(14, 43, 87, 0.5)", fontWeight: 700, marginBottom: "8px" }}>
              Review the Famlo Master Platform Agreement before accepting. Every item below opens the agreement viewer.
            </p>

            {AGREEMENTS.map((agreement) => (
              <div key={agreement.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "white", borderRadius: "16px", border: "1px solid #f1f5f9" }}>
                <input
                  type="checkbox"
                  checked={Boolean(data[agreement.id])}
                  onChange={(e) => update(agreement.id, e.target.checked)}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <button
                  type="button"
                  onClick={() => setAgreementOpen(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "none",
                    border: "none",
                    color: "#165dcc",
                    fontSize: "14px",
                    fontWeight: 800,
                    cursor: "pointer",
                    textAlign: "left",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  <FileText size={15} />
                  {agreement.label}
                </button>
                {data[agreement.id] ? <CheckCircle2 size={16} color="#059669" style={{ marginLeft: "auto" }} /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {agreementOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.56)",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: "min(920px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              background: "white",
              borderRadius: "28px",
              padding: "24px",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.22)",
            }}
          >
            <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "16px", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 900, color: "#165dcc", textTransform: "uppercase", letterSpacing: "0.08em" }}>Attached Agreement</div>
                <h3 style={{ margin: "8px 0 6px", fontSize: "24px", color: "#0e2b57" }}>{FAMLO_MASTER_PLATFORM_AGREEMENT.title}</h3>
                <p style={{ margin: 0, fontSize: "13px", color: "rgba(14, 43, 87, 0.65)", fontWeight: 600 }}>
                  {FAMLO_MASTER_PLATFORM_AGREEMENT.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAgreementOpen(false)}
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  color: "#165dcc",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gap: "18px" }}>
              {FAMLO_MASTER_PLATFORM_AGREEMENT.sections.map((section) => (
                <section key={section.id} style={{ borderRadius: "20px", border: "1px solid #e2e8f0", padding: "18px", background: "#fcfdff" }}>
                  <h4 style={{ margin: "0 0 10px", color: "#0e2b57", fontSize: "16px", fontWeight: 900 }}>{section.title}</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {section.body.map((paragraph) => (
                      <p key={paragraph} style={{ margin: 0, fontSize: "13px", lineHeight: 1.65, color: "rgba(14, 43, 87, 0.78)", fontWeight: 600 }}>
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
