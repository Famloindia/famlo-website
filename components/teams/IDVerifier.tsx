"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, ZoomIn, ZoomOut, Loader2 } from "lucide-react";

interface IDVerifierRecord {
  id: string;
  full_name: string;
  email: string;
  city?: string | null;
  state?: string | null;
  gender?: string | null;
  about?: string | null;
  date_of_birth?: string | null;
  kyc_status?: string | null;
  profile_photo_url: string | null;
  id_document_url: string | null;
  id_document_type: string;
  application_type: "home" | "hommie" | "guest";
}

interface IDVerifierProps {
  records: IDVerifierRecord[];
  actorId: string;
}

function VerifierCard({ record, actorId }: { record: IDVerifierRecord; actorId: string }) {
  const [faceMatchConfirmed, setFaceMatchConfirmed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmMatch = async () => {
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch("/api/teams/id-verify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: record.id,
          actorId,
          confirmed: faceMatchConfirmed,
          recordType: record.application_type,
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Verification decision failed.");
      }
      setDone(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Verification decision failed.");
    } finally {
      setConfirming(false);
    }
  };

  if (done) {
    return (
      <div style={{ background: "white", borderRadius: "20px", padding: "40px", textAlign: "center", border: "2px solid #86efac" }}>
        <CheckCircle2 size={40} color="#16a34a" />
        <div style={{ marginTop: "16px", fontWeight: 900, fontSize: "17px", color: "#15803d" }}>Face match recorded for {record.full_name}</div>
      </div>
    );
  }

  const docLabel = record.id_document_type === "aadhar" ? "Aadhaar Card" : record.id_document_type === "pan" ? "PAN Card" : "Government ID";

  return (
    <div style={{ background: "white", borderRadius: "20px", overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: "17px", color: "#0e2b57" }}>{record.full_name}</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>
            {record.email} · {record.application_type === "home" ? "Home Host" : record.application_type === "hommie" ? "Hommie" : "Guest"}
          </div>
          <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {record.city || record.state ? (
              <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#f8fafc", color: "#475569", fontSize: "11px", fontWeight: 800 }}>
                {[record.city, record.state].filter(Boolean).join(", ")}
              </span>
            ) : null}
            {record.gender ? (
              <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#f8fafc", color: "#475569", fontSize: "11px", fontWeight: 800 }}>
                {record.gender.replaceAll("_", " ")}
              </span>
            ) : null}
            {record.kyc_status ? (
              <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8", fontSize: "11px", fontWeight: 800 }}>
                {record.kyc_status.replaceAll("_", " ")}
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>
            <ZoomOut size={16} color="#64748b" />
          </button>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>
            <ZoomIn size={16} color="#64748b" />
          </button>
          <span style={{ background: "#f4f8ff", color: "#165dcc", padding: "6px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 800 }}>{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {record.about || record.date_of_birth ? (
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f1f5f9", display: "grid", gap: "10px", background: "#fcfdff" }}>
          {record.about ? (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>About</div>
              <div style={{ fontSize: "13px", color: "#334155", lineHeight: 1.6 }}>{record.about}</div>
            </div>
          ) : null}
          {record.date_of_birth ? (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Date of birth</div>
              <div style={{ fontSize: "13px", color: "#334155" }}>{record.date_of_birth}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Split View */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", borderBottom: "1px solid #f1f5f9" }}>
        {/* LEFT: ID Document */}
        <div style={{ padding: "24px", borderRight: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
            LEFT — {docLabel}
          </div>
          <div style={{ background: "#f8fafc", borderRadius: "12px", overflow: "hidden", height: "280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {record.id_document_url ? (
              <img src={record.id_document_url} alt="ID Document"
                style={{ width: "100%", height: "100%", objectFit: "contain", transform: `scale(${zoom})`, transition: "transform 0.2s" }} />
            ) : (
              <div style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 700 }}>No document uploaded</div>
            )}
          </div>
        </div>

        {/* RIGHT: Profile Photo */}
        <div style={{ padding: "24px" }}>
          <div style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
            RIGHT — Profile Photo
          </div>
          <div style={{ background: "#f8fafc", borderRadius: "12px", overflow: "hidden", height: "280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {record.profile_photo_url ? (
              <img src={record.profile_photo_url} alt="Profile Photo"
                style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, transition: "transform 0.2s" }} />
            ) : (
              <div style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 700 }}>No photo uploaded</div>
            )}
          </div>
        </div>
      </div>

      {/* Decision */}
      <div style={{ padding: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#0e2b57", marginBottom: "4px" }}>Manual Face Match Verification</div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>Confirm that the face in the ID document matches the profile photo before marking as verified.</div>
          {error ? <div style={{ marginTop: "10px", color: "#b91c1c", fontSize: "12px", fontWeight: 700 }}>{error}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => setFaceMatchConfirmed(!faceMatchConfirmed)}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", borderRadius: "12px", border: `2px solid ${faceMatchConfirmed ? "#22c55e" : "#e2e8f0"}`, background: faceMatchConfirmed ? "#f0fdf4" : "white", color: faceMatchConfirmed ? "#15803d" : "#64748b", fontWeight: 800, fontSize: "13px", cursor: "pointer" }}>
            {faceMatchConfirmed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {faceMatchConfirmed ? "Face Match ✓" : "Confirm Match"}
          </button>
          <button onClick={handleConfirmMatch} disabled={!faceMatchConfirmed || confirming}
            style={{ padding: "10px 24px", borderRadius: "12px", border: "none", background: faceMatchConfirmed ? "#165dcc" : "#e2e8f0", color: faceMatchConfirmed ? "white" : "#94a3b8", fontWeight: 900, fontSize: "13px", cursor: faceMatchConfirmed ? "pointer" : "not-allowed" }}>
            {confirming ? <Loader2 className="animate-spin" size={16} /> : "Save Verification"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IDVerifier({ records, actorId }: IDVerifierProps) {
  if (records.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 32px" }}>
        <CheckCircle2 size={48} color="#22c55e" style={{ marginBottom: "16px" }} />
        <div style={{ fontSize: "20px", fontWeight: 900, color: "#0e2b57" }}>No documents pending verification</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, color: "#0e2b57", margin: 0 }}>ID Verifier</h1>
        <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px" }}>
          Side-by-side document and profile photo comparison. Confirm face match to unlock the Identity Verified checklist item.
          Documents are served via secure signed URLs — never exposed in the browser address bar.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {records.map((r) => <VerifierCard key={r.id} record={r} actorId={actorId} />)}
      </div>
    </div>
  );
}
