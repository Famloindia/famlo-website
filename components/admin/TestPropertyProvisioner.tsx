"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SourceFamilyRow = {
  familyId: string;
  familyName: string;
  hostCode: string | null;
  city: string | null;
  state: string | null;
  famloPlusStatus: string;
  ownerUserId: string | null;
  email: string | null;
};

type ProvisionedProperty = {
  familyId: string;
  hostId: string | null;
  hostCode: string;
  name: string;
  currency: string;
  timezone: string;
  roomId: string | null;
  roomName: string;
  proDashboardUrl: string;
  basicDashboardUrl: string;
};

interface TestPropertyProvisionerProps {
  rows: SourceFamilyRow[];
}

type DurationValue = "1_month" | "3_months" | "1_year" | "custom";

export default function TestPropertyProvisioner({
  rows,
}: Readonly<TestPropertyProvisionerProps>): React.JSX.Element {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sourceFamilyId, setSourceFamilyId] = useState(rows[0]?.familyId ?? "");
  const [propertyName, setPropertyName] = useState("Famlo Booking.com Test GBP");
  const [timezone, setTimezone] = useState("Europe/London");
  const [city, setCity] = useState("London");
  const [state, setState] = useState("England");
  const [country, setCountry] = useState("United Kingdom");
  const [addressLine, setAddressLine] = useState("Staging test property");
  const [roomName, setRoomName] = useState("Booking.com Test Room");
  const [basePrice, setBasePrice] = useState("100");
  const [maxGuests, setMaxGuests] = useState("2");
  const [duration, setDuration] = useState<DurationValue>("1_year");
  const [customEndDate, setCustomEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [result, setResult] = useState<ProvisionedProperty | null>(null);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) =>
      [row.familyName, row.hostCode ?? "", row.city ?? "", row.state ?? "", row.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [rows, search]);

  const selectedSource = rows.find((row) => row.familyId === sourceFamilyId) ?? null;

  async function submitProvision(): Promise<void> {
    if (!sourceFamilyId) {
      setMessage({ type: "error", text: "Choose a source property owner first." });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/test-properties/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceFamilyId,
          propertyName,
          timezone,
          city,
          state,
          country,
          addressLine,
          roomName,
          basePrice,
          maxGuests,
          duration,
          customEndDate: duration === "custom" ? customEndDate : undefined,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        property?: ProvisionedProperty;
      };

      if (!response.ok || !payload.property) {
        setMessage({ type: "error", text: payload.error ?? "Provisioning failed." });
        return;
      }

      setResult(payload.property);
      setMessage({
        type: "success",
        text: `Isolated GBP test property created for ${selectedSource?.familyName ?? "the selected owner"}.`,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Provisioning failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>
          Isolated GBP Test Property Provisioning
        </h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px", marginTop: "8px", lineHeight: 1.7 }}>
          Internal-only flow for creating a separate Booking.com staging property under an existing real host owner.
          This keeps Aryan&apos;s INR property untouched and gives us a clean GBP Pro workspace for real feed testing.
        </p>
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderRadius: "14px",
          border: "1px solid rgba(251,191,36,0.24)",
          background: "rgba(251,191,36,0.08)",
          color: "#fde68a",
          fontSize: "12px",
          fontWeight: 700,
          lineHeight: 1.7,
        }}
      >
        This flow creates a new family/property with a new partner code, a GBP Pro settings row, Famlo+ access,
        and one active room. Basic dashboard behavior stays untouched, so the safest next step after provisioning is
        to open the new Pro URL directly.
      </div>

      {message ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "10px",
            background: message.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(220,38,38,0.12)",
            color: message.type === "success" ? "#86efac" : "#fca5a5",
            border: `1px solid ${message.type === "success" ? "rgba(34,197,94,0.24)" : "rgba(220,38,38,0.24)"}`,
            fontSize: "13px",
            fontWeight: 800,
          }}
        >
          {message.text}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.9fr)",
          gap: "18px",
          alignItems: "start",
        }}
      >
        <section
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "18px",
            display: "grid",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "16px", fontWeight: 900, color: "white" }}>Select Source Owner</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "6px" }}>
                Pick an existing family with the real partner owner you want to reuse for Pro access.
              </div>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search source property..."
              style={{
                width: "260px",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: "10px", maxHeight: "420px", overflowY: "auto", paddingRight: "4px" }}>
            {filteredRows.map((row) => {
              const isSelected = row.familyId === sourceFamilyId;
              return (
                <button
                  key={row.familyId}
                  type="button"
                  onClick={() => setSourceFamilyId(row.familyId)}
                  style={{
                    textAlign: "left",
                    borderRadius: "14px",
                    padding: "14px",
                    border: `1px solid ${isSelected ? "rgba(59,130,246,0.6)" : "rgba(255,255,255,0.08)"}`,
                    background: isSelected ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.03)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>{row.familyName}</div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.38)", marginTop: "6px" }}>
                        Partner Code: {row.hostCode ?? "Pending"}{row.city || row.state ? ` · ${[row.city, row.state].filter(Boolean).join(", ")}` : ""}
                      </div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)", marginTop: "6px" }}>
                        Owner User: {row.ownerUserId ?? "Missing"}{row.email ? ` · ${row.email}` : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        alignSelf: "flex-start",
                        padding: "5px 10px",
                        borderRadius: "999px",
                        background: row.famloPlusStatus === "active" ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                        color: row.famloPlusStatus === "active" ? "#86efac" : "rgba(255,255,255,0.55)",
                        fontSize: "10px",
                        fontWeight: 900,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {row.famloPlusStatus}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "18px",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: 900, color: "white" }}>Provision Test Property</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            This creates a new partner code and property family under the same real owner user. The new property gets
            its own Pro settings and room inventory so the current INR setup stays isolated.
          </div>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Property Name</span>
            <input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Currency</span>
              <input value="GBP" disabled style={{ ...inputStyle, opacity: 0.75, cursor: "not-allowed" }} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Timezone</span>
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)} style={inputStyle}>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Kolkata">Asia/Kolkata</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>City</span>
              <input value={city} onChange={(event) => setCity(event.target.value)} style={inputStyle} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>State / Region</span>
              <input value={state} onChange={(event) => setState(event.target.value)} style={inputStyle} />
            </label>
          </div>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Country</span>
            <input value={country} onChange={(event) => setCountry(event.target.value)} style={inputStyle} />
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Address</span>
            <input value={addressLine} onChange={(event) => setAddressLine(event.target.value)} style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px", gap: "10px" }}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Room Name</span>
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} style={inputStyle} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Base GBP</span>
              <input value={basePrice} onChange={(event) => setBasePrice(event.target.value)} style={inputStyle} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Guests</span>
              <input value={maxGuests} onChange={(event) => setMaxGuests(event.target.value)} style={inputStyle} />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Famlo+ Duration</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value as DurationValue)} style={inputStyle}>
                <option value="1_month">1 month</option>
                <option value="3_months">3 months</option>
                <option value="1_year">1 year</option>
                <option value="custom">Custom end date</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Custom End Date</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                disabled={duration !== "custom"}
                style={{ ...inputStyle, opacity: duration === "custom" ? 1 : 0.5, cursor: duration === "custom" ? "text" : "not-allowed" }}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void submitProvision()}
            disabled={submitting || !sourceFamilyId || (duration === "custom" && customEndDate.trim().length === 0)}
            style={{
              marginTop: "8px",
              borderRadius: "12px",
              padding: "12px 16px",
              border: "none",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "white",
              fontWeight: 900,
              fontSize: "13px",
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Provisioning..." : "Create isolated GBP test property"}
          </button>

          {result ? (
            <div
              style={{
                marginTop: "8px",
                padding: "14px",
                borderRadius: "12px",
                border: "1px solid rgba(34,197,94,0.24)",
                background: "rgba(34,197,94,0.08)",
                color: "#bbf7d0",
                display: "grid",
                gap: "8px",
                fontSize: "12px",
              }}
            >
              <div style={{ fontWeight: 900, color: "#dcfce7" }}>Provisioned successfully</div>
              <div>Family ID: {result.familyId}</div>
              <div>Partner Code: {result.hostCode}</div>
              <div>Room: {result.roomName}</div>
              <div>Open Pro: <a href={result.proDashboardUrl} style={linkStyle}>{result.proDashboardUrl}</a></div>
              <div>Basic route: <a href={result.basicDashboardUrl} style={linkStyle}>{result.basicDashboardUrl}</a></div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const fieldStyle = {
  display: "grid",
  gap: "6px",
} satisfies CSSProperties;

const fieldLabelStyle = {
  fontSize: "11px",
  fontWeight: 900,
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
} satisfies CSSProperties;

const linkStyle = {
  color: "#bfdbfe",
  textDecoration: "underline",
} satisfies CSSProperties;
