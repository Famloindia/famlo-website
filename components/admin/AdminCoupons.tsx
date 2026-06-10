"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface CouponRecord {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount_amount: number | null;
  min_booking_amount: number | null;
  applies_to_type: string | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  is_active: boolean;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
}

interface Props {
  coupons: CouponRecord[];
  adminId: string;
}

type LocationOptions = {
  states: string[];
  cities: string[];
  villages: string[];
};

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const btnBase: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: "10px",
  border: "none",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function AdminCoupons({ coupons, adminId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [locations, setLocations] = useState<LocationOptions>({ states: [], cities: [], villages: [] });
  const [form, setForm] = useState({
    code: "",
    discount_type: "percentage",
    discount_value: "10",
    max_discount_amount: "",
    min_booking_amount: "",
    applies_to_type: "all",
    starts_at: "",
    ends_at: "",
    usage_limit: "",
    per_user_limit: "1",
    city: "",
    state: "",
    locality: "",
  });

  useEffect(() => {
    fetch("/api/locations/search")
      .then((res) => res.json())
      .then((data) => setLocations({
        states: Array.isArray(data.states) ? data.states : [],
        cities: Array.isArray(data.cities) ? data.cities : [],
        villages: Array.isArray(data.villages) ? data.villages : [],
      }))
      .catch(() => setLocations({ states: [], cities: [], villages: [] }));
  }, []);

  async function save() {
    if (!form.code.trim()) {
      setMsg({ type: "err", text: "Coupon code is required." });
      return;
    }

    setLoading("save");
    setMsg(null);

    try {
      const res = await fetch("/api/admin/coupons/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          code: form.code.trim().toUpperCase(),
          discount_value: Number(form.discount_value),
          max_discount_amount: form.max_discount_amount ? Number(form.max_discount_amount) : null,
          min_booking_amount: form.min_booking_amount ? Number(form.min_booking_amount) : null,
          usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
          per_user_limit: form.per_user_limit ? Number(form.per_user_limit) : 1,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          locality: form.locality.trim() || null,
          adminId,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");

      setMsg({ type: "ok", text: "Coupon saved successfully." });
      setShowForm(false);
      setForm({
        code: "",
        discount_type: "percentage",
        discount_value: "10",
        max_discount_amount: "",
        min_booking_amount: "",
        applies_to_type: "all",
        starts_at: "",
        ends_at: "",
        usage_limit: "",
        per_user_limit: "1",
        city: "",
        state: "",
        locality: "",
      });
      router.refresh();
    } catch (error: any) {
      setMsg({ type: "err", text: error.message });
    } finally {
      setLoading(null);
    }
  }

  async function toggle(id: string, current: boolean) {
    setLoading(id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/coupons/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !current, adminId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (error: any) {
      setMsg({ type: "err", text: error.message });
    } finally {
      setLoading(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this coupon?")) return;
    setLoading(`${id}-delete`);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/coupons/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, adminId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (error: any) {
      setMsg({ type: "err", text: error.message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ color: "#fff", margin: 0, fontSize: "16px", fontWeight: 700 }}>Coupons</h3>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px", margin: "6px 0 0" }}>
            Platform-owned coupons for both app and web. Pricing logic should read this table, not hardcoded frontend values.
          </p>
        </div>
        <button onClick={() => setShowForm((value) => !value)} style={{ ...btnBase, background: "#1A56DB", color: "#fff" }}>
          {showForm ? "Cancel" : "+ New Coupon"}
        </button>
      </div>

      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: msg.type === "ok" ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)", color: msg.type === "ok" ? "#34d399" : "#f87171" }}>
          {msg.text}
        </div>
      )}

      {showForm && (
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "16px", padding: "24px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
            <Field label="Coupon Code">
              <input style={inputStyle} value={form.code} onChange={(event) => setForm((state) => ({ ...state, code: event.target.value.toUpperCase() }))} placeholder="WELCOME10" />
            </Field>
            <Field label="Discount Type">
              <select style={inputStyle} value={form.discount_type} onChange={(event) => setForm((state) => ({ ...state, discount_type: event.target.value }))}>
                <option value="percentage">Percentage</option>
                <option value="flat">Flat</option>
              </select>
            </Field>
            <Field label="Discount Value">
              <input style={inputStyle} type="number" min="0" value={form.discount_value} onChange={(event) => setForm((state) => ({ ...state, discount_value: event.target.value }))} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
            <Field label="Max Discount">
              <input style={inputStyle} type="number" min="0" value={form.max_discount_amount} onChange={(event) => setForm((state) => ({ ...state, max_discount_amount: event.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Min Booking Amount">
              <input style={inputStyle} type="number" min="0" value={form.min_booking_amount} onChange={(event) => setForm((state) => ({ ...state, min_booking_amount: event.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Applies To">
              <select style={inputStyle} value={form.applies_to_type} onChange={(event) => setForm((state) => ({ ...state, applies_to_type: event.target.value }))}>
                <option value="all">All</option>
                <option value="host">Hosts</option>
                <option value="hommie">Hommies</option>
                <option value="activity">Activities</option>
              </select>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px" }}>
            <Field label="Starts At">
              <input style={inputStyle} type="datetime-local" value={form.starts_at} onChange={(event) => setForm((state) => ({ ...state, starts_at: event.target.value }))} />
            </Field>
            <Field label="Ends At">
              <input style={inputStyle} type="datetime-local" value={form.ends_at} onChange={(event) => setForm((state) => ({ ...state, ends_at: event.target.value }))} />
            </Field>
            <Field label="Usage Limit">
              <input style={inputStyle} type="number" min="0" value={form.usage_limit} onChange={(event) => setForm((state) => ({ ...state, usage_limit: event.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Per User Limit">
              <input style={inputStyle} type="number" min="1" value={form.per_user_limit} onChange={(event) => setForm((state) => ({ ...state, per_user_limit: event.target.value }))} />
            </Field>
          </div>

          <datalist id="coupon-city-list">
            {locations.cities.map((cityOption) => <option key={cityOption} value={cityOption} />)}
          </datalist>
          <datalist id="coupon-state-list">
            {locations.states.map((stateOption) => <option key={stateOption} value={stateOption} />)}
          </datalist>
          <datalist id="coupon-locality-list">
            {locations.villages.map((villageOption) => <option key={villageOption} value={villageOption} />)}
          </datalist>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
            <Field label="Coupon City">
              <input list="coupon-city-list" style={inputStyle} value={form.city} onChange={(event) => setForm((state) => ({ ...state, city: event.target.value }))} placeholder="Jodhpur" />
            </Field>
            <Field label="Coupon State">
              <input list="coupon-state-list" style={inputStyle} value={form.state} onChange={(event) => setForm((state) => ({ ...state, state: event.target.value }))} placeholder="Rajasthan" />
            </Field>
            <Field label="Coupon Area / Village">
              <input list="coupon-locality-list" style={inputStyle} value={form.locality} onChange={(event) => setForm((state) => ({ ...state, locality: event.target.value }))} placeholder="Jheepasani" />
            </Field>
          </div>

          <button onClick={save} disabled={loading === "save"} style={{ ...btnBase, background: "linear-gradient(135deg,#1A56DB,#3B82F6)", color: "#fff", alignSelf: "flex-start", padding: "12px 28px" }}>
            {loading === "save" ? "Saving..." : "Save Coupon"}
          </button>
        </div>
      )}

      {coupons.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px", padding: "20px 0" }}>
          No coupons yet. Add one when you are ready to turn pricing promotions on.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
          {coupons.map((coupon) => (
            <div key={coupon.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: "16px", border: `1px solid ${coupon.is_active ? "rgba(26,86,219,0.35)" : "rgba(255,255,255,0.08)"}`, padding: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 800, color: "#93c5fd", letterSpacing: "0.08em" }}>{coupon.code}</div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff", marginTop: "6px" }}>
                    {coupon.discount_type === "percentage" ? `${coupon.discount_value}% off` : `Rs ${coupon.discount_value} off`}
                  </div>
                </div>
                <span style={{ fontSize: "11px", fontWeight: 800, borderRadius: "999px", padding: "6px 10px", background: coupon.is_active ? "rgba(5,150,105,0.2)" : "rgba(255,255,255,0.08)", color: coupon.is_active ? "#34d399" : "rgba(255,255,255,0.5)" }}>
                  {coupon.is_active ? "LIVE" : "PAUSED"}
                </span>
              </div>

              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                Applies to: {coupon.applies_to_type ?? "all"}<br />
                Area: {[coupon.locality, coupon.city, coupon.state].filter(Boolean).join(", ") || "All areas"}<br />
                Min booking: {coupon.min_booking_amount ?? 0}<br />
                Per user: {coupon.per_user_limit ?? 1}<br />
                Window: {coupon.starts_at ? new Date(coupon.starts_at).toLocaleString("en-IN") : "Now"} to {coupon.ends_at ? new Date(coupon.ends_at).toLocaleString("en-IN") : "Open ended"}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => toggle(coupon.id, coupon.is_active)} disabled={loading === coupon.id} style={{ ...btnBase, flex: 1, background: coupon.is_active ? "rgba(107,114,128,0.2)" : "rgba(26,86,219,0.24)", color: coupon.is_active ? "rgba(255,255,255,0.7)" : "#93c5fd" }}>
                  {loading === coupon.id ? "..." : coupon.is_active ? "Pause" : "Activate"}
                </button>
                <button onClick={() => remove(coupon.id)} disabled={loading === `${coupon.id}-delete`} style={{ ...btnBase, background: "rgba(220,38,38,0.15)", color: "#f87171" }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
