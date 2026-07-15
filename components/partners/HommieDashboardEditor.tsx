"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface HommieDashboardEditorProps {
  hommie: Record<string, unknown>;
  bookingRows: Array<Record<string, unknown>>;
}

type Section = "overview" | "profile" | "listing" | "bookings";

function joinList(values: unknown): string {
  return Array.isArray(values) ? values.join(", ") : "";
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumberString(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "";
}

function formatLocation(parts: string[]): string {
  return parts.map((item) => item.trim()).filter(Boolean).join(", ");
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatCurrency(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value ?? NaN);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "—";
  }

  return `₹${numeric.toLocaleString("en-IN")}`;
}

function formatStatusLabel(value: unknown): string {
  const raw = String(value ?? "pending").trim();
  if (!raw) return "Pending";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function HommieDashboardEditor({
  hommie,
  bookingRows
}: Readonly<HommieDashboardEditorProps>): React.JSX.Element {
  const router = useRouter();

  const [section, setSection] = useState<Section>("overview");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localBookings, setLocalBookings] = useState(bookingRows);

  const [profile, setProfile] = useState({
    host_name: String(hommie.host_name ?? ""),
    email: String(hommie.email ?? ""),
    phone: String(hommie.phone ?? ""),
    city: String(hommie.city ?? ""),
    state: String(hommie.state ?? ""),
    locality: String(hommie.locality ?? ""),
    is_active: Boolean(hommie.is_active)
  });

  const [listing, setListing] = useState({
    property_name: String(hommie.property_name ?? hommie.host_name ?? ""),
    description: String(hommie.description ?? ""),
    amenities: joinList(hommie.amenities),
    images: joinList(hommie.images),
    nightly_price: parseNumberString(hommie.nightly_price),
    max_guests: parseNumberString(hommie.max_guests || 1),
    admin_notes: String(hommie.admin_notes ?? "")
  });

  const bookingSummary = useMemo(
    () => ({
      total: localBookings.length,
      pending: localBookings.filter((row) => String(row.status ?? "") === "pending").length,
      confirmed: localBookings.filter((row) => String(row.status ?? "") === "confirmed").length,
      rejected: localBookings.filter((row) => String(row.status ?? "") === "rejected").length,
      completed: localBookings.filter((row) => String(row.status ?? "") === "completed").length,
    }),
    [localBookings]
  );

  const previewImage = useMemo(() => parseList(listing.images)[0] ?? "", [listing.images]);
  const previewAmenities = useMemo(() => parseList(listing.amenities), [listing.amenities]);
  const monthlyEarnings = useMemo(
    () =>
      localBookings
        .filter((row) => ["completed", "confirmed"].includes(String(row.status ?? "")))
        .reduce((acc, row) => acc + Math.round((Number(row.total_price) || 0) * 0.82), 0),
    [localBookings]
  );
  const recentSchedule = useMemo(
    () =>
      [...localBookings]
        .filter((row) => typeof row.date_from === "string" && row.date_from)
        .sort((left, right) => String(left.date_from).localeCompare(String(right.date_from)))
        .slice(0, 4),
    [localBookings]
  );

  async function handleSave(): Promise<void> {
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/onboarding/hommie/dashboard-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hommieId: String(hommie.id),
          updates: {
            host_name: profile.host_name,
            email: profile.email,
            phone: profile.phone,
            city: profile.city,
            state: profile.state,
            locality: profile.locality,
            is_active: profile.is_active,

            property_name: listing.property_name,
            description: listing.description,
            amenities: listing.amenities,
            images: listing.images,
            nightly_price: Number(listing.nightly_price || 0),
            max_guests: Number(listing.max_guests || 0),
            admin_notes: listing.admin_notes
          }
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Could not save hommie dashboard changes.");
        return;
      }

      setMessage("Hommie dashboard changes saved and synced.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save hommie dashboard changes.");
    } finally {
      setSaving(false);
    }
  }

  async function updateBookingStatus(
    bookingId: string,
    status: "confirmed" | "rejected"
  ): Promise<void> {
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/onboarding/hommie/dashboard-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          bookingStatus: status
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Could not update booking.");
        return;
      }

      setLocalBookings((current) =>
        current.map((row) => (String(row.id) === bookingId ? { ...row, status } : row))
      );
      setMessage(`Booking ${status}.`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update booking.");
    }
  }

  return (
    <div className="min-h-screen bg-[#EEF5FF] text-[#0B2441] font-sans pb-24 relative">
      
      {/* ── Overview Tab ── */}
      {section === "overview" && (
        <div className="animate-in fade-in pb-12">
          <div className="pt-8 px-5 pb-4 flex justify-between items-start">
            <div className="flex gap-3 items-center">
              <div className="w-12 h-12 rounded-full bg-[#EEEDFE] flex items-center justify-center text-[#3C3489] text-xl font-black">
                {String(profile.host_name).charAt(0).toUpperCase() || 'H'}
              </div>
              <div>
                <h1 className="text-xl font-black text-[#0B2441] mt-1 pr-2">{profile.host_name || "Friend"}</h1>
                <p className="text-xs text-[#5A7190] font-bold mt-0.5">{profile.locality || profile.city || "Famlo Guide"}</p>
              </div>
            </div>
            <button onClick={() => void handleSave()} disabled={saving} className="bg-[#EAF3FF] px-3 py-1.5 rounded-xl border-2 border-[#C7DCF6] shadow-sm">
              <span className="text-[11px] text-[#1A6EBB] font-bold">{saving ? "Saving" : "Save All"}</span>
            </button>
          </div>
          
          <div className="mx-4 mb-4 bg-white rounded-[22px] p-5 border-[3px] border-[#D7E5F5] flex items-center justify-between shadow-sm">
             <div className="flex items-start gap-3 flex-1">
               <div className={`w-2.5 h-2.5 rounded-full mt-1 ${profile.is_active ? 'bg-[#1D9E75]' : 'bg-[#CCC]'}`} />
               <div className="flex-1 pr-2">
                 <h3 className="text-[15px] font-black leading-snug">{profile.is_active ? 'You are Online' : 'You are Offline'}</h3>
                 <p className="text-[11px] text-[#5A7190] mt-0.5 leading-snug">{profile.is_active ? 'Guests can see your profile and activities' : 'Hidden from search'}</p>
               </div>
             </div>
             <button onClick={() => setProfile(c => ({...c, is_active: !profile.is_active}))} className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors ${profile.is_active ? 'bg-[#1A6EBB]' : 'bg-[#CCC]'}`}>
               {profile.is_active ? 'Go Offline' : 'Go Online'}
             </button>
          </div>

          <div className="flex gap-2.5 px-4 mb-4">
            <div className="flex-1 bg-[#0B2441] rounded-[22px] p-4 flex flex-col items-center shadow-lg">
              <span className="text-2xl mb-1">💰</span>
              <span className="text-[22px] font-black text-white mb-0.5">₹{monthlyEarnings.toLocaleString('en-IN')}</span>
              <span className="text-[11px] text-[#A0B1C0] font-bold text-center">Projected earnings</span>
            </div>
            <div className="flex-1 bg-white rounded-[22px] p-4 flex flex-col items-center border-[3px] border-[#C7DCF6] shadow-sm">
              <span className="text-2xl mb-1">🤝</span>
              <span className="text-[22px] font-black text-[#0B2441] mb-0.5">{bookingSummary.confirmed + bookingSummary.completed}</span>
              <span className="text-[11px] text-[#5A7190] font-bold text-center">Confirmed meets</span>
            </div>
          </div>

          <div className="px-4 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-[18px] p-4 border-[3px] border-[#D7E5F5] shadow-sm">
                <p className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold">Pending requests</p>
                <p className="text-[22px] font-black text-[#0B2441] mt-1">{bookingSummary.pending}</p>
              </div>
              <div className="bg-white rounded-[18px] p-4 border-[3px] border-[#D7E5F5] shadow-sm">
                <p className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold">Completed meets</p>
                <p className="text-[22px] font-black text-[#0B2441] mt-1">{bookingSummary.completed}</p>
              </div>
            </div>
          </div>

          <div className="px-4 mb-4">
            <div className="bg-white rounded-[22px] p-5 border-[3px] border-[#D7E5F5] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-[15px] font-black text-[#0B2441]">Upcoming schedule</h3>
                  <p className="text-[11px] text-[#5A7190] font-bold mt-0.5">Closer to the mobile hommie dashboard flow</p>
                </div>
                <button onClick={() => setSection("bookings")} className="text-[11px] font-black text-[#1A6EBB]">
                  View all
                </button>
              </div>
              {recentSchedule.length === 0 ? (
                <p className="text-[12px] text-[#5A7190] font-semibold">No upcoming hommie sessions yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentSchedule.map((booking) => (
                    <div key={String(booking.id)} className="flex items-center justify-between rounded-[16px] bg-[#F5F9FF] border border-[#D7E5F5] px-4 py-3">
                      <div>
                        <p className="text-[13px] font-black text-[#0B2441]">{formatStatusLabel(booking.quarter_type ?? "meet")}</p>
                        <p className="text-[11px] text-[#5A7190] font-semibold mt-1">
                          {formatDate(booking.date_from)} · {Number(booking.guests_count ?? 1)} guest{Number(booking.guests_count ?? 1) > 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[12px] font-black text-[#1A6EBB]">{formatCurrency(booking.total_price)}</p>
                        <p className="text-[10px] uppercase tracking-wider text-[#5A7190] font-bold mt-1">{formatStatusLabel(booking.status)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {previewImage && (
            <div className="px-4">
               <div className="bg-white rounded-[22px] p-4 border-[3px] border-[#C7DCF6] flex gap-4 shadow-sm items-center">
                  <img src={previewImage} alt="Cover" className="w-[80px] h-[80px] rounded-[16px] object-cover bg-gray-100" />
                  <div className="flex-1 pr-2">
                     <h3 className="text-sm font-black text-[#0B2441] whitespace-nowrap overflow-hidden text-ellipsis">{listing.property_name || 'My Activity'}</h3>
                     <p className="text-xs text-[#5A7190] mt-0.5 leading-snug line-clamp-2">{listing.description}</p>
                     <p className="text-xs text-[#1A6EBB] font-black mt-1">₹{listing.nightly_price}/person</p>
                  </div>
               </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bookings Tab ── */}
      {section === "bookings" && (
        <div className="animate-in fade-in px-4 pt-10 pb-12">
          <h1 className="text-2xl font-black text-[#0B2441] mb-4">City Meets</h1>
          {localBookings.length === 0 ? (
             <div className="bg-[#F5F9FF] p-6 rounded-[22px] border-[3px] border-[#D7E5F5] text-center">
               <p className="text-[#5A7190] font-bold">No meets matched yet.</p>
             </div>
          ) : localBookings.map(booking => (
             <div key={String(booking.id)} className="bg-white mb-3 border-[3px] border-[#C7DCF6] rounded-[22px] p-4 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#EAF3FF] flex items-center justify-center text-[#1A6EBB] font-black text-xs">
                      {String(booking.user_id || 'G').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#0B2441]">Guest {String(booking.user_id || '').slice(0, 4)}</p>
                      <p className="text-[10px] uppercase text-[#5A7190] font-bold tracking-wider">{formatStatusLabel(booking.quarter_type ?? "Meet")}</p>
                    </div>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] font-bold uppercase text-[#1A6EBB] bg-[#EAF3FF] px-2 py-0.5 rounded inline-block">{formatStatusLabel(booking.status)}</p>
                     <p className="text-[13px] text-[#0B2441] font-black mt-1">₹{Number(booking.total_price).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <p className="text-[11px] text-[#5A7190] font-semibold">
                  {formatDate(booking.date_from)} · {Number(booking.guests_count ?? 1)} guest{Number(booking.guests_count ?? 1) > 1 ? "s" : ""}
                </p>
                {String(booking.status) === "pending" && (
                  <div className="flex gap-2 mt-4 pt-3 border-t border-[#F5F9FF]">
                     <button onClick={() => void updateBookingStatus(String(booking.id), 'confirmed')} className="flex-1 bg-[#1A6EBB] text-white py-2 rounded-xl text-xs font-bold shadow-sm">Accept</button>
                     <button onClick={() => void updateBookingStatus(String(booking.id), 'rejected')} className="flex-1 bg-[#F5F9FF] border border-[#D7E5F5] text-[#A0B1C0] py-2 rounded-xl text-xs font-bold">Reject</button>
                  </div>
                )}
             </div>
          ))}
        </div>
      )}

      {/* ── Listing Details Tab ── */}
      {section === "listing" && (
        <div className="animate-in fade-in px-4 pt-10 pb-12">
          <div className="flex justify-between items-center mb-4">
             <h1 className="text-2xl font-black text-[#0B2441]">My Offers</h1>
             <button onClick={() => void handleSave()} disabled={saving} className="px-4 py-2 bg-[#1A6EBB] text-xs text-white font-bold rounded-xl active:bg-[#155A9C]">
                {saving ? "Saving" : "Save All"}
             </button>
          </div>
          
          <div className="bg-white rounded-[22px] p-5 border-[3px] border-[#C7DCF6] shadow-sm space-y-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold mb-1 block">Listing Title</span>
              <input className="w-full bg-[#F5F9FF] border border-[#D7E5F5] rounded-xl px-3 py-2 text-sm font-semibold text-[#0B2441] focus:outline-none focus:border-[#1A6EBB]" value={listing.property_name} onChange={e => setListing(c => ({...c, property_name: e.target.value}))}/>
            </label>
            <label className="flex justify-between items-center pb-2 border-b border-[#E7F0FA]">
              <span className="text-[13px] text-[#5A7190] font-bold block">Base Price / Person</span>
              <input type="numeric" className="w-24 text-right bg-transparent text-[15px] font-black text-[#0B2441] focus:outline-none" value={listing.nightly_price} onChange={e => setListing(c => ({...c, nightly_price: e.target.value}))}/>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold mb-1 block">What guests will do</span>
              <textarea className="w-full bg-[#F5F9FF] border border-[#D7E5F5] rounded-xl px-3 py-2 text-sm font-semibold text-[#0B2441] focus:outline-none focus:border-[#1A6EBB] min-h-[80px]" value={listing.description} onChange={e => setListing(c => ({...c, description: e.target.value}))}/>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold mb-1 block">Keywords / Activities</span>
              <input className="w-full bg-[#F5F9FF] border border-[#D7E5F5] rounded-xl px-3 py-2 text-sm font-semibold text-[#0B2441] focus:outline-none focus:border-[#1A6EBB]" placeholder="Cafes, Walking, Shopping" value={listing.amenities} onChange={e => setListing(c => ({...c, amenities: e.target.value}))}/>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold mb-1 block">Main Photo URL</span>
              <input className="w-full bg-[#F5F9FF] border border-[#D7E5F5] rounded-xl px-3 py-2 text-[10px] font-semibold text-[#0B2441] focus:outline-none focus:border-[#1A6EBB]" value={listing.images} onChange={e => setListing(c => ({...c, images: e.target.value}))}/>
            </label>
          </div>
        </div>
      )}

      {/* ── Profile Tab ── */}
      {section === "profile" && (
        <div className="animate-in fade-in px-4 pt-10 pb-12 space-y-4">
          <div className="flex justify-between items-center mb-2">
             <h1 className="text-2xl font-black text-[#0B2441]">Profile Security</h1>
             <button onClick={() => void handleSave()} disabled={saving} className="px-4 py-2 bg-[#1A6EBB] text-xs text-white font-bold rounded-xl active:bg-[#155A9C]">
                {saving ? "Saving" : "Save All"}
             </button>
          </div>
          
          <section className="bg-white rounded-[22px] p-5 border-[3px] border-[#C7DCF6] shadow-sm">
            <h2 className="text-sm font-black text-[#0B2441] mb-3">Guide Identity</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold mb-1 block">Name</span>
                <input className="w-full bg-[#F5F9FF] border border-[#D7E5F5] rounded-xl px-3 py-2 text-sm font-semibold text-[#0B2441] focus:outline-none focus:border-[#1A6EBB]" value={profile.host_name} onChange={e => setProfile(c => ({...c, host_name: e.target.value}))}/>
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold mb-1 block">Email</span>
                <input className="w-full bg-[#F5F9FF] border border-[#D7E5F5] rounded-xl px-3 py-2 text-sm font-semibold text-[#0B2441]" value={profile.email} readOnly/>
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold mb-1 block">Phone Number</span>
                <input className="w-full bg-[#F5F9FF] border border-[#D7E5F5] rounded-xl px-3 py-2 text-sm font-semibold text-[#0B2441]" value={profile.phone} onChange={e => setProfile(c => ({...c, phone: e.target.value}))}/>
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-[#5A7190] font-bold mb-1 block">City</span>
                <input className="w-full bg-[#F5F9FF] border border-[#D7E5F5] rounded-xl px-3 py-2 text-sm font-semibold text-[#0B2441]" value={profile.city} onChange={e => setProfile(c => ({...c, city: e.target.value}))}/>
              </label>
            </div>
          </section>
        </div>
      )}

      {/* ── Desktop/Mobile Bottom Navigation Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E7F0FA] p-2 pb-safe shadow-[0_-5px_15px_rgba(0,0,0,0.03)] z-50">
        <div className="flex justify-around items-center max-w-md mx-auto">
           {[ 
             { id: 'overview', label: 'Overview', icon: '👤' },
             { id: 'bookings', label: 'Meets', icon: '🛎️' },
             { id: 'listing', label: 'Listing', icon: '⭐' },
             { id: 'profile', label: 'Profile', icon: '⚙️' }
           ].map(tab => (
              <button key={tab.id} onClick={() => setSection(tab.id as Section)} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${section === tab.id ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}>
                 <span className={`text-xl mb-0.5 ${section === tab.id ? 'text-[#1A6EBB] drop-shadow-sm' : 'text-[#0B2441]'}`}>{tab.icon}</span>
                 <span className={`text-[10px] font-bold tracking-tight ${section === tab.id ? 'text-[#1A6EBB]' : 'text-[#0B2441]'}`}>{tab.label}</span>
              </button>
           ))}
        </div>
      </div>
    </div>
  );
}
