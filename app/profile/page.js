"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ProfilePage;
var UserContext_1 = require("@/components/auth/UserContext");
var ProfileCompletionForm_1 = require("@/components/account/ProfileCompletionForm");
var SavedHomesSection_1 = require("@/components/account/SavedHomesSection");
function ProfileSummaryCard() {
    var _a = (0, UserContext_1.useUser)(), user = _a.user, profile = _a.profile;
    if (!user && !profile)
        return null;
    var contactLine = (profile === null || profile === void 0 ? void 0 : profile.phone) || (user === null || user === void 0 ? void 0 : user.phone) || (profile === null || profile === void 0 ? void 0 : profile.email) || (user === null || user === void 0 ? void 0 : user.email) || "Add your contact details";
    var locationLine = [profile === null || profile === void 0 ? void 0 : profile.city, profile === null || profile === void 0 ? void 0 : profile.state].filter(Boolean).join(", ") || "Location not added yet";
    var displayInitial = ((profile === null || profile === void 0 ? void 0 : profile.name) || (user === null || user === void 0 ? void 0 : user.email) || "U").charAt(0).toUpperCase();
    return (<section className="panel" style={{
            padding: "24px",
            display: "grid",
            gap: "18px",
            border: "1px solid #e0ecff",
            background: "linear-gradient(180deg,#ffffff,#f8fbff)",
        }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#eaf3ff",
            color: "#1A56DB",
            border: "1px solid #dbeafe",
            fontSize: "28px",
            fontWeight: 800,
        }}>
          {(profile === null || profile === void 0 ? void 0 : profile.avatar_url) ? (<img src={profile.avatar_url} alt={(profile === null || profile === void 0 ? void 0 : profile.name) || "Profile"} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>) : (displayInitial)}
        </div>

        <div style={{ display: "grid", gap: "6px" }}>
          <h2 style={{ margin: 0, fontSize: "clamp(24px, 4vw, 32px)" }}>Welcome</h2>
          {(profile === null || profile === void 0 ? void 0 : profile.name) ? <p style={{ margin: 0, color: "#0f172a", fontWeight: 700 }}>{profile.name}</p> : null}
          <p style={{ margin: 0, color: "#475569", fontWeight: 600 }}>{contactLine}</p>
          <p style={{ margin: 0, color: "#64748b" }}>{locationLine}</p>
        </div>
      </div>

      <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
        }}>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Phone</span>
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>{(profile === null || profile === void 0 ? void 0 : profile.phone) || (user === null || user === void 0 ? void 0 : user.phone) || "Not added"}</strong>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Email</span>
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>{(profile === null || profile === void 0 ? void 0 : profile.email) || (user === null || user === void 0 ? void 0 : user.email) || "Not added"}</strong>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Gender</span>
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>{(profile === null || profile === void 0 ? void 0 : profile.gender) || "Not added"}</strong>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Date of birth</span>
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>{(profile === null || profile === void 0 ? void 0 : profile.date_of_birth) || "Not added"}</strong>
        </div>
      </div>
    </section>);
}
function ProfilePage() {
    return (<main className="shell account-page-shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
      <section className="panel account-page-panel" style={{
            padding: "clamp(24px, 4vw, 48px)",
            display: "grid",
            gap: "24px",
        }}>
        <div className="account-page-header" style={{ display: "grid", gap: "10px" }}>
          <span style={{
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#1A56DB",
        }}>
            Account
          </span>
          <h1 style={{ margin: 0 }}>Your Profile</h1>
          <p style={{ margin: 0, color: "#5A6A85", fontSize: "16px", maxWidth: "72ch" }}>
            Save your guest profile once here. Hosts will see these details when you book a stay.
          </p>
        </div>

        <ProfileSummaryCard />

        <ProfileCompletionForm_1.ProfileCompletionForm title="Guest profile" description="Fill in your name, contact details, location, gender, date of birth, and about section to unlock booking." buttonLabel="Save profile"/>

        <SavedHomesSection_1.SavedHomesSection />
      </section>
    </main>);
}
