"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* ─── types ─────────────────────────────────────────────── */
export interface AdRecord {
  id: string;
  label: string;
  title: string;
  description: string | null;
  image_url: string;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
  radius_km?: number | null;
  cta_text: string;
  cta_url: string;
  is_active: boolean;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  weekdays?: number[];
  daily_start_time?: string | null;
  daily_end_time?: string | null;
  timezone?: string | null;
  team_owner?: string | null;
  audience?: string | null;
}

export interface BannerRecord {
  id: string;
  image_url: string;
  alt_text: string;
  is_active: boolean;
  sort_order: number;
}

interface Props {
  ads: AdRecord[];
  banners: BannerRecord[];
  adminId: string;
}

type LocationOptions = {
  states: string[];
  cities: string[];
  villages: string[];
};

async function uploadPromoImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "promotions");

  const response = await fetch("/api/onboarding/home/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || typeof data.url !== "string") {
    throw new Error(typeof data.error === "string" ? data.error : "Upload failed.");
  }

  return data.url;
}

/* ─── small helpers ─────────────────────────────────────── */
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

const inputStyle: React.CSSProperties = {
  padding: "10px 14px", borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)", color: "#fff",
  fontSize: "14px", outline: "none", fontFamily: "inherit", width: "100%",
  boxSizing: "border-box",
};

const btnBase: React.CSSProperties = {
  padding: "10px 18px", borderRadius: "10px", border: "none",
  fontSize: "13px", fontWeight: 700, cursor: "pointer", transition: "opacity 0.15s",
};

/* ═══════════════════════════════════════════════════════════
   ADS MANAGER
═══════════════════════════════════════════════════════════ */
function AdsManager({ ads, adminId }: { ads: AdRecord[]; adminId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [locations, setLocations] = useState<LocationOptions>({ states: [], cities: [], villages: [] });
  const [form, setForm] = useState({
    label: "Exclusive Offer",
    title: "",
    description: "",
    image_url: "",
    city: "",
    state: "",
    locality: "",
    radius_km: "25",
    cta_text: "Explore Now",
    cta_url: "/homestays",
    priority: "1",
    starts_at: "",
    ends_at: "",
    weekdays: [0, 1, 2, 3, 4, 5, 6] as number[],
    daily_start_time: "",
    daily_end_time: "",
    timezone: "Asia/Kolkata",
    team_owner: "growth",
    audience: "all",
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

  const weekdayOptions = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
  ];

  async function save() {
    if (!form.title.trim() || !form.image_url.trim()) {
      setMsg({ type: "err", text: "Title and image URL are required." });
      return;
    }
    setLoading("save");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ads/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, priority: Number(form.priority), adminId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setMsg({ type: "ok", text: "Ad saved successfully." });
      setShowForm(false);
      setForm({
        label: "Exclusive Offer",
        title: "",
        description: "",
        image_url: "",
        city: "",
        state: "",
        locality: "",
        radius_km: "25",
        cta_text: "Explore Now",
        cta_url: "/homestays",
        priority: "1",
        starts_at: "",
        ends_at: "",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        daily_start_time: "",
        daily_end_time: "",
        timezone: "Asia/Kolkata",
        team_owner: "growth",
        audience: "all",
      });
      router.refresh();
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setLoading(null);
    }
  }

  async function toggle(id: string, current: boolean) {
    setLoading(id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ads/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !current, adminId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setLoading(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this ad?")) return;
    setLoading(id + "-del");
    try {
      const res = await fetch("/api/admin/ads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, adminId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ color: "#fff", margin: 0, fontSize: "16px", fontWeight: 700 }}>Homepage Ads</h3>
        <button onClick={() => setShowForm(v => !v)} style={{ ...btnBase, background: "#1A56DB", color: "#fff" }}>
          {showForm ? "Cancel" : "+ New Ad"}
        </button>
      </div>

      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: msg.type === "ok" ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)", color: msg.type === "ok" ? "#34d399" : "#f87171" }}>
          {msg.text}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "16px", padding: "24px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h4 style={{ color: "#fff", margin: 0, fontSize: "14px" }}>New Ad</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Field label="Label (small eyebrow text)">
              <input style={inputStyle} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Exclusive Offer" />
            </Field>
            <Field label="Priority (1 = highest)">
              <input style={inputStyle} type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} />
            </Field>
          </div>
          <Field label="Title">
            <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Stay inside the Blue City walls" />
          </Field>
          <Field label="Description">
            <textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" } as React.CSSProperties} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description shown on homepage..." />
          </Field>
          <Field label="Image URL">
            <input style={inputStyle} value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://..." />
          </Field>
          <div>
            <label style={{ ...btnBase, display: "inline-flex", background: "rgba(255,255,255,0.08)", color: "#fff" }}>
              {uploadingImage ? "Uploading..." : "Upload image"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setUploadingImage(true);
                  setMsg(null);
                  try {
                    const url = await uploadPromoImage(file);
                    setForm((current) => ({ ...current, image_url: url }));
                  } catch (error: any) {
                    setMsg({ type: "err", text: error.message });
                  } finally {
                    setUploadingImage(false);
                    event.target.value = "";
                  }
                }}
              />
            </label>
          </div>
          {form.image_url && (
            <img src={form.image_url} alt="preview" style={{ width: "100%", maxHeight: "140px", objectFit: "cover", borderRadius: "10px" }} />
          )}
          <datalist id="promo-city-list">
            {locations.cities.map((cityOption) => <option key={cityOption} value={cityOption} />)}
          </datalist>
          <datalist id="promo-state-list">
            {locations.states.map((stateOption) => <option key={stateOption} value={stateOption} />)}
          </datalist>
          <datalist id="promo-locality-list">
            {locations.villages.map((villageOption) => <option key={villageOption} value={villageOption} />)}
          </datalist>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px" }}>
            <Field label="Target City">
              <input list="promo-city-list" style={inputStyle} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Jodhpur" />
            </Field>
            <Field label="Target State">
              <input list="promo-state-list" style={inputStyle} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="Rajasthan" />
            </Field>
            <Field label="Target Area / Village">
              <input list="promo-locality-list" style={inputStyle} value={form.locality} onChange={e => setForm(f => ({ ...f, locality: e.target.value }))} placeholder="Jheepasani" />
            </Field>
            <Field label="Radius KM">
              <input style={inputStyle} type="number" value={form.radius_km} onChange={e => setForm(f => ({ ...f, radius_km: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Field label="CTA Button Text">
              <input style={inputStyle} value={form.cta_text} onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))} placeholder="Explore Now" />
            </Field>
            <Field label="CTA URL">
              <input style={inputStyle} value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))} placeholder="/homes or https://..." />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
            <Field label="Starts At">
              <input style={inputStyle} type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
            </Field>
            <Field label="Ends At">
              <input style={inputStyle} type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
            </Field>
            <Field label="Timezone">
              <input style={inputStyle} value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} placeholder="Asia/Kolkata" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px" }}>
            <Field label="Daily Start">
              <input style={inputStyle} type="time" value={form.daily_start_time} onChange={e => setForm(f => ({ ...f, daily_start_time: e.target.value }))} />
            </Field>
            <Field label="Daily End">
              <input style={inputStyle} type="time" value={form.daily_end_time} onChange={e => setForm(f => ({ ...f, daily_end_time: e.target.value }))} />
            </Field>
            <Field label="Team Owner">
              <select style={inputStyle} value={form.team_owner} onChange={e => setForm(f => ({ ...f, team_owner: e.target.value }))}>
                <option value="growth">Growth</option>
                <option value="ops">Ops</option>
                <option value="brand">Brand</option>
                <option value="partnerships">Partnerships</option>
              </select>
            </Field>
            <Field label="Audience">
              <select style={inputStyle} value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}>
                <option value="all">All</option>
                <option value="guest">Guests</option>
                <option value="host">Hosts</option>
                <option value="hommie">Hommies</option>
              </select>
            </Field>
          </div>
          <Field label="Active Days">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {weekdayOptions.map((weekday) => {
                const active = form.weekdays.includes(weekday.value);
                return (
                  <button
                    key={weekday.value}
                    type="button"
                    onClick={() =>
                      setForm((state) => ({
                        ...state,
                        weekdays: active
                          ? state.weekdays.filter((value) => value !== weekday.value)
                          : [...state.weekdays, weekday.value].sort((left, right) => left - right),
                      }))
                    }
                    style={{
                      padding: "8px 12px",
                      borderRadius: "999px",
                      border: active ? "1px solid #60a5fa" : "1px solid rgba(255,255,255,0.1)",
                      background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                      color: active ? "#bfdbfe" : "rgba(255,255,255,0.55)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {weekday.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <button onClick={save} disabled={loading === "save"} style={{ ...btnBase, background: "linear-gradient(135deg,#1A56DB,#3B82F6)", color: "#fff", alignSelf: "flex-start", padding: "12px 28px" }}>
            {loading === "save" ? "Saving..." : "Save Ad"}
          </button>
        </div>
      )}

      {/* Existing ads */}
      {ads.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px", padding: "20px 0" }}>
          No ads yet. Create one above and it will appear in the Discover More section on the homepage.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {ads.map(ad => (
            <div key={ad.id} style={{
              background: "rgba(255,255,255,0.04)", borderRadius: "14px", padding: "16px 20px",
              border: `1px solid ${ad.is_active ? "rgba(26,86,219,0.4)" : "rgba(255,255,255,0.06)"}`,
              display: "flex", gap: "16px", alignItems: "flex-start",
            }}>
              {ad.image_url && (
                <img src={ad.image_url} alt={ad.title} style={{ width: "80px", height: "60px", objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{ad.label}</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{ad.title}</div>
                {ad.description && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginBottom: "6px" }}>{ad.description}</div>}
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
                  CTA: &quot;{ad.cta_text}&quot; → {ad.cta_url} · Priority: {ad.priority}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
                  Location: {[ad.locality, ad.city, ad.state].filter(Boolean).join(", ") || "All locations"} · Days: {ad.weekdays && ad.weekdays.length > 0 ? ad.weekdays.join(", ") : "Every day"} · Time: {ad.daily_start_time || "00:00"}-{ad.daily_end_time || "23:59"} {ad.timezone || "Asia/Kolkata"}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
                  Team: {ad.team_owner || "Admin"} · Audience: {ad.audience || "all"} · Window: {ad.starts_at ? new Date(ad.starts_at).toLocaleString("en-IN") : "Now"} to {ad.ends_at ? new Date(ad.ends_at).toLocaleString("en-IN") : "Open ended"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
                <button onClick={() => toggle(ad.id, ad.is_active)} disabled={loading === ad.id} style={{
                  ...btnBase, padding: "8px 14px", fontSize: "12px",
                  background: ad.is_active ? "rgba(5,150,105,0.2)" : "rgba(255,255,255,0.1)",
                  color: ad.is_active ? "#34d399" : "rgba(255,255,255,0.5)",
                }}>
                  {loading === ad.id ? "..." : ad.is_active ? "✓ Live" : "Paused"}
                </button>
                <button onClick={() => remove(ad.id)} disabled={loading === ad.id + "-del"} style={{ ...btnBase, padding: "8px 14px", fontSize: "12px", background: "rgba(220,38,38,0.15)", color: "#f87171" }}>
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

/* ═══════════════════════════════════════════════════════════
   HERO BANNERS MANAGER
═══════════════════════════════════════════════════════════ */
function BannersManager({ banners, adminId }: { banners: BannerRecord[]; adminId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [aspectHint, setAspectHint] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [form, setForm] = useState({ image_url: "", alt_text: "", sort_order: "1" });

  const sortedBanners = [...banners].sort((a, b) => a.sort_order - b.sort_order);
  const activeBanners = sortedBanners.filter((b) => b.is_active);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = window.setInterval(() => {
      setPreviewIdx((current) => (current + 1) % activeBanners.length);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [activeBanners.length]);

  useEffect(() => {
    if (previewIdx >= activeBanners.length) setPreviewIdx(0);
  }, [previewIdx, activeBanners.length]);

  useEffect(() => {
    if (!showForm) return;
    const nextSort = Math.max(0, ...sortedBanners.map((b) => Number(b.sort_order ?? 0))) + 1;
    setForm((current) => ({
      ...current,
      sort_order: current.sort_order?.trim()?.length ? current.sort_order : String(nextSort || 1),
    }));
  }, [showForm, sortedBanners]);

  async function save() {
    if (!form.image_url.trim()) { setMsg({ type: "err", text: "Image URL is required." }); return; }
    setLoading("save"); setMsg(null);
    try {
      const res = await fetch("/api/admin/banners/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sort_order: Number(form.sort_order), adminId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setMsg({ type: "ok", text: "Banner saved." });
      setShowForm(false);
      setForm({ image_url: "", alt_text: "", sort_order: "1" });
      router.refresh();
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally { setLoading(null); }
  }

  async function toggle(id: string, current: boolean) {
    setLoading(id); setMsg(null);
    try {
      const res = await fetch("/api/admin/banners/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !current, adminId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setLoading(null); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this banner?")) return;
    setLoading(id + "-del");
    try {
      const res = await fetch("/api/admin/banners/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, adminId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setLoading(null); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ color: "#fff", margin: 0, fontSize: "16px", fontWeight: 700 }}>Hero Banner Images</h3>
        <button onClick={() => setShowForm(v => !v)} style={{ ...btnBase, background: "#1A56DB", color: "#fff" }}>
          {showForm ? "Cancel" : "+ Add Banner"}
        </button>
      </div>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", margin: 0 }}>
        These rotate on the homepage hero every 3 seconds. Recommended aspect ratio: <b>16:9</b> (e.g. <b>1920×1080</b> or <b>1600×900</b>). Keep important text/logos centered — the hero uses <code>cover</code> so edges can crop.
      </p>

      {activeBanners.length > 0 && (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          borderRadius: "16px",
          padding: "16px",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800, fontSize: "13px" }}>Live Preview</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: "12px" }}>
              Auto-swipes every 3s • {previewIdx + 1}/{activeBanners.length}
            </div>
          </div>
          <div style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: "14px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.25)",
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${activeBanners[previewIdx]?.image_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "saturate(1.05)",
            }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,22,40,0.45), rgba(10,22,40,0.08))" }} />
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
            {activeBanners.map((_, i) => (
              <button
                key={i}
                onClick={() => setPreviewIdx(i)}
                style={{
                  width: i === previewIdx ? "26px" : "8px",
                  height: "8px",
                  borderRadius: "999px",
                  border: "none",
                  background: i === previewIdx ? "#fff" : "rgba(255,255,255,0.35)",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: msg.type === "ok" ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)", color: msg.type === "ok" ? "#34d399" : "#f87171" }}>
          {msg.text}
        </div>
      )}

      {showForm && (
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "16px", padding: "24px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ ...btnBase, display: "inline-flex", background: "rgba(255,255,255,0.08)", color: "#fff" }}>
              {uploadingImage ? "Uploading..." : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setUploadingImage(true);
                  setMsg(null);
                  setAspectHint(null);
                  try {
                    const objectUrl = URL.createObjectURL(file);
                    await new Promise<void>((resolve) => {
                      const img = new Image();
                      img.onload = () => {
                        const w = img.width || 0;
                        const h = img.height || 0;
                        if (w > 0 && h > 0) {
                          const ratio = w / h;
                          const target = 16 / 9;
                          const drift = Math.abs(ratio - target) / target;
                          if (drift > 0.12) {
                            setAspectHint(`Heads up: this image is ${w}×${h} (~${ratio.toFixed(2)}:1). Recommended is 16:9 (~1.78:1) for best fit.`);
                          } else {
                            setAspectHint(`Looks good: ${w}×${h} (close to 16:9).`);
                          }
                        }
                        URL.revokeObjectURL(objectUrl);
                        resolve();
                      };
                      img.onerror = () => {
                        URL.revokeObjectURL(objectUrl);
                        resolve();
                      };
                      img.src = objectUrl;
                    });
                    const url = await uploadPromoImage(file);
                    setForm((current) => ({ ...current, image_url: url }));
                  } catch (error: any) {
                    setMsg({ type: "err", text: error.message });
                  } finally {
                    setUploadingImage(false);
                    event.target.value = "";
                  }
                }}
              />
            </label>
          </div>
          {aspectHint && (
            <div style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{aspectHint}</div>
          )}
          {form.image_url && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ width: "100%", aspectRatio: "16 / 9", overflow: "hidden", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
                <img src={form.image_url} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, image_url: "" }))}
                style={{ ...btnBase, alignSelf: "flex-start", background: "rgba(255,255,255,0.08)", color: "#fff" }}
              >
                Remove selected photo
              </button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Field label="Alt text (accessibility)">
              <input style={inputStyle} value={form.alt_text} onChange={e => setForm(f => ({ ...f, alt_text: e.target.value }))} placeholder="e.g. Jodhpur Blue City" />
            </Field>
            <Field label="Sort order (1 = first)">
              <input style={inputStyle} type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
            </Field>
          </div>
          <button onClick={save} disabled={loading === "save"} style={{ ...btnBase, background: "linear-gradient(135deg,#1A56DB,#3B82F6)", color: "#fff", alignSelf: "flex-start", padding: "12px 28px" }}>
            {loading === "save" ? "Saving..." : "Save Banner"}
          </button>
        </div>
      )}

      {banners.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px", padding: "20px 0" }}>
          No banners yet. Add some above — the homepage will fall back to default images until you do.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px" }}>
          {[...banners].sort((a, b) => a.sort_order - b.sort_order).map(b => (
            <div key={b.id} style={{
              borderRadius: "14px", overflow: "hidden",
              border: `2px solid ${b.is_active ? "rgba(26,86,219,0.5)" : "rgba(255,255,255,0.08)"}`,
              background: "rgba(255,255,255,0.04)",
            }}>
              <div style={{ position: "relative" }}>
                <img src={b.image_url} alt={b.alt_text} style={{ width: "100%", height: "130px", objectFit: "cover", display: "block" }} />
                <span style={{
                  position: "absolute", top: "8px", left: "8px",
                  fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "6px",
                  background: b.is_active ? "rgba(5,150,105,0.9)" : "rgba(107,114,128,0.9)",
                  color: "#fff",
                }}>#{b.sort_order} {b.is_active ? "LIVE" : "OFF"}</span>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{b.alt_text || "No label"}</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => toggle(b.id, b.is_active)} disabled={loading === b.id} style={{ ...btnBase, flex: 1, padding: "7px 0", fontSize: "12px", background: b.is_active ? "rgba(107,114,128,0.2)" : "rgba(26,86,219,0.3)", color: b.is_active ? "rgba(255,255,255,0.6)" : "#93c5fd" }}>
                    {loading === b.id ? "..." : b.is_active ? "Pause" : "Activate"}
                  </button>
                  <button onClick={() => remove(b.id)} disabled={loading === b.id + "-del"} style={{ ...btnBase, padding: "7px 12px", fontSize: "12px", background: "rgba(220,38,38,0.15)", color: "#f87171" }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT — combined panel
═══════════════════════════════════════════════════════════ */
export default function AdminAdsAndBanners({ ads, banners, adminId }: Props) {
  const [tab, setTab] = useState<"ads" | "banners">("banners");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* tab switcher */}
      <div style={{ display: "flex", gap: "8px", background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "6px", width: "fit-content" }}>
        {(["banners", "ads"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "9px 22px", borderRadius: "9px", border: "none",
            background: tab === t ? "#1A56DB" : "transparent",
            color: tab === t ? "#fff" : "rgba(255,255,255,0.45)",
            fontWeight: 700, fontSize: "13px", cursor: "pointer", transition: "all 0.15s",
            textTransform: "capitalize",
          }}>
            {t === "banners" ? "🖼 Hero Banners" : "📢 Discover Ads"}
          </button>
        ))}
      </div>

      {tab === "banners" ? (
        <BannersManager banners={banners} adminId={adminId} />
      ) : (
        <AdsManager ads={ads} adminId={adminId} />
      )}
    </div>
  );
}
