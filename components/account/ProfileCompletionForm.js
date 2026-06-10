"use client";
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileCompletionForm = ProfileCompletionForm;
var react_1 = require("react");
var lucide_react_1 = require("lucide-react");
var UserContext_1 = require("@/components/auth/UserContext");
var supabase_1 = require("@/lib/supabase");
var user_profile_1 = require("@/lib/user-profile");
var upload_limits_1 = require("@/lib/upload-limits");
function readJsonOrText(response) {
    return __awaiter(this, void 0, void 0, function () {
        var raw, trimmed;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, response.text()];
                case 1:
                    raw = _a.sent();
                    try {
                        return [2 /*return*/, JSON.parse(raw)];
                    }
                    catch (_b) {
                        trimmed = raw.trim();
                        if (/request entity too large/i.test(trimmed)) {
                            return [2 /*return*/, { error: "Image must be ".concat((0, upload_limits_1.formatImageUploadLimitLabel)(), " or smaller.") }];
                        }
                        return [2 /*return*/, trimmed ? { error: trimmed } : {}];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function ProfileCompletionForm(_a) {
    var _b;
    var _c = _a.title, title = _c === void 0 ? "Complete your guest profile" : _c, _d = _a.description, description = _d === void 0 ? "Add your details once so Famlo hosts know who is arriving before you book." : _d, _e = _a.buttonLabel, buttonLabel = _e === void 0 ? "Save profile" : _e, _f = _a.compact, compact = _f === void 0 ? false : _f, onSuccess = _a.onSuccess;
    var _g = (0, UserContext_1.useUser)(), user = _g.user, profile = _g.profile, refreshProfile = _g.refreshProfile;
    var supabase = (0, react_1.useMemo)(function () { return (0, supabase_1.createBrowserSupabaseClient)(); }, []);
    var avatarInputRef = (0, react_1.useRef)(null);
    var _h = (0, react_1.useState)(false), manualEditMode = _h[0], setManualEditMode = _h[1];
    var _j = (0, react_1.useState)({
        email: "",
        phone: "",
        name: "",
        city: "",
        state: "",
        about: "",
        dob: "",
        gender: "",
        avatarUrl: "",
    }), draft = _j[0], setDraft = _j[1];
    var _k = (0, react_1.useState)(false), saving = _k[0], setSaving = _k[1];
    var _l = (0, react_1.useState)(false), uploading = _l[0], setUploading = _l[1];
    var _m = (0, react_1.useState)(null), message = _m[0], setMessage = _m[1];
    var resolvedForm = {
        email: draft.email || (profile === null || profile === void 0 ? void 0 : profile.email) || (user === null || user === void 0 ? void 0 : user.email) || "",
        phone: draft.phone || (profile === null || profile === void 0 ? void 0 : profile.phone) || (user === null || user === void 0 ? void 0 : user.phone) || "",
        name: draft.name || (profile === null || profile === void 0 ? void 0 : profile.name) || "",
        city: draft.city || (profile === null || profile === void 0 ? void 0 : profile.city) || "",
        state: draft.state || (profile === null || profile === void 0 ? void 0 : profile.state) || "",
        about: draft.about || (profile === null || profile === void 0 ? void 0 : profile.about) || "",
        dob: draft.dob || (profile === null || profile === void 0 ? void 0 : profile.date_of_birth) || "",
        gender: draft.gender || (profile === null || profile === void 0 ? void 0 : profile.gender) || "",
        avatarUrl: draft.avatarUrl || (profile === null || profile === void 0 ? void 0 : profile.avatar_url) || "",
    };
    var profileComplete = (0, user_profile_1.isGuestProfileComplete)(__assign(__assign({}, (profile !== null && profile !== void 0 ? profile : {
        id: (_b = user === null || user === void 0 ? void 0 : user.id) !== null && _b !== void 0 ? _b : "",
        name: null,
        phone: null,
        email: null,
        city: null,
        state: null,
        onboarding_completed: false,
        avatar_url: null,
        about: null,
        date_of_birth: null,
        gender: null,
        kyc_status: null,
        id_document_url: null,
        id_document_type: null,
    })), { name: resolvedForm.name || null, phone: resolvedForm.phone || null, email: resolvedForm.email || null, city: resolvedForm.city || null, state: resolvedForm.state || null, about: resolvedForm.about || null, date_of_birth: resolvedForm.dob || null, gender: resolvedForm.gender || null }));
    var emailLocked = Boolean((user === null || user === void 0 ? void 0 : user.email) || (profile === null || profile === void 0 ? void 0 : profile.email));
    var phoneLocked = Boolean((user === null || user === void 0 ? void 0 : user.phone) || (profile === null || profile === void 0 ? void 0 : profile.phone));
    function handleAvatarUpload(event) {
        return __awaiter(this, void 0, void 0, function () {
            var file, formData, response, data_1, error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        file = (_a = event.target.files) === null || _a === void 0 ? void 0 : _a[0];
                        if (!file)
                            return [2 /*return*/];
                        setUploading(true);
                        setMessage(null);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, 5, 6]);
                        if (!file.type.startsWith("image/")) {
                            throw new Error("Please upload an image file.");
                        }
                        if (file.size > upload_limits_1.MAX_IMAGE_UPLOAD_BYTES) {
                            throw new Error("Image must be ".concat((0, upload_limits_1.formatImageUploadLimitLabel)(), " or smaller."));
                        }
                        formData = new FormData();
                        formData.append("file", file);
                        formData.append("folder", "guest-profile");
                        return [4 /*yield*/, fetch("/api/onboarding/home/upload", {
                                method: "POST",
                                body: formData,
                            })];
                    case 2:
                        response = _b.sent();
                        return [4 /*yield*/, readJsonOrText(response)];
                    case 3:
                        data_1 = _b.sent();
                        if (!response.ok || typeof data_1.url !== "string") {
                            throw new Error(typeof data_1.error === "string" ? data_1.error : "Upload failed.");
                        }
                        setDraft(function (current) { return (__assign(__assign({}, current), { avatarUrl: data_1.url })); });
                        return [3 /*break*/, 6];
                    case 4:
                        error_1 = _b.sent();
                        setMessage({
                            type: "error",
                            text: error_1 instanceof Error ? error_1.message : "Upload failed.",
                        });
                        return [3 /*break*/, 6];
                    case 5:
                        setUploading(false);
                        event.target.value = "";
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    }
    function handleSubmit(event) {
        return __awaiter(this, void 0, void 0, function () {
            var session, response, data, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        event.preventDefault();
                        if (!user) {
                            setMessage({ type: "error", text: "Please sign in first." });
                            return [2 /*return*/];
                        }
                        if (!resolvedForm.phone && !resolvedForm.email) {
                            setMessage({ type: "error", text: "Add at least one contact method: phone or email." });
                            return [2 /*return*/];
                        }
                        setSaving(true);
                        setMessage(null);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 8, 9, 10]);
                        return [4 /*yield*/, supabase.auth.getSession()];
                    case 2:
                        session = (_a.sent()).data.session;
                        return [4 /*yield*/, fetch("/api/user/profile", {
                                method: "POST",
                                headers: __assign(__assign(__assign({ "Content-Type": "application/json" }, ((session === null || session === void 0 ? void 0 : session.access_token) ? { Authorization: "Bearer ".concat(session.access_token) } : {})), ((user === null || user === void 0 ? void 0 : user.id) ? { "x-famlo-user-id": user.id } : {})), (resolvedForm.email ? { "x-famlo-user-email": resolvedForm.email } : {})),
                                body: JSON.stringify({
                                    userId: user.id,
                                    email: resolvedForm.email || null,
                                    phone: resolvedForm.phone || null,
                                    name: resolvedForm.name,
                                    city: resolvedForm.city,
                                    state: resolvedForm.state,
                                    about: resolvedForm.about,
                                    dob: resolvedForm.dob,
                                    gender: resolvedForm.gender,
                                    avatarUrl: resolvedForm.avatarUrl || null,
                                }),
                            })];
                    case 3:
                        response = _a.sent();
                        return [4 /*yield*/, readJsonOrText(response)];
                    case 4:
                        data = _a.sent();
                        if (!response.ok || data.error) {
                            throw new Error(typeof data.error === "string" ? data.error : "Profile save failed.");
                        }
                        return [4 /*yield*/, refreshProfile()];
                    case 5:
                        _a.sent();
                        if (!onSuccess) return [3 /*break*/, 7];
                        return [4 /*yield*/, onSuccess()];
                    case 6:
                        _a.sent();
                        _a.label = 7;
                    case 7:
                        setManualEditMode(false);
                        setMessage({
                            type: "success",
                            text: "Profile saved. You can continue to booking now.",
                        });
                        return [3 /*break*/, 10];
                    case 8:
                        error_2 = _a.sent();
                        setMessage({
                            type: "error",
                            text: error_2 instanceof Error ? error_2.message : "Profile save failed.",
                        });
                        return [3 /*break*/, 10];
                    case 9:
                        setSaving(false);
                        return [7 /*endfinally*/];
                    case 10: return [2 /*return*/];
                }
            });
        });
    }
    if (profileComplete && !manualEditMode) {
        return (<section className="panel detail-box account-verification-form" style={{
                padding: compact ? "20px" : "28px",
                display: "grid",
                gap: "20px",
            }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.7 }}>{description}</p>
          </div>
          <span style={{
                padding: "8px 12px",
                borderRadius: 999,
                background: "#dcfce7",
                color: "#166534",
                fontSize: 12,
                fontWeight: 800,
            }}>
            Profile saved
          </span>
        </div>

        <div className="dashboard-form-grid">
          <div>
            <span className="eyebrow">Name</span>
            <p style={{ margin: "8px 0 0" }}>{resolvedForm.name || "Not added"}</p>
          </div>
          <div>
            <span className="eyebrow">Phone</span>
            <p style={{ margin: "8px 0 0" }}>{resolvedForm.phone || "Not added"}</p>
          </div>
          <div>
            <span className="eyebrow">Email</span>
            <p style={{ margin: "8px 0 0" }}>{resolvedForm.email || "Not added"}</p>
          </div>
          <div>
            <span className="eyebrow">Location</span>
            <p style={{ margin: "8px 0 0" }}>{[resolvedForm.city, resolvedForm.state].filter(Boolean).join(", ") || "Not added"}</p>
          </div>
          <div>
            <span className="eyebrow">Gender</span>
            <p style={{ margin: "8px 0 0" }}>{resolvedForm.gender || "Not added"}</p>
          </div>
          <div>
            <span className="eyebrow">Date of birth</span>
            <p style={{ margin: "8px 0 0" }}>{resolvedForm.dob || "Not added"}</p>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span className="eyebrow">About you</span>
            <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{resolvedForm.about || "Not added"}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="button-like account-submit-btn" type="button" onClick={function () { return setManualEditMode(true); }}>
            Edit profile
          </button>
        </div>

        {message ? (<div style={{
                    borderRadius: 14,
                    padding: "12px 14px",
                    background: message.type === "success" ? "#dcfce7" : "#fee2e2",
                    color: message.type === "success" ? "#166534" : "#b91c1c",
                    fontWeight: 700,
                }}>
            {message.text}
          </div>) : null}
      </section>);
    }
    return (<form className="panel detail-box account-verification-form" onSubmit={function (event) { return void handleSubmit(event); }} style={{
            padding: compact ? "24px" : "32px",
            display: "grid",
            gap: "24px",
            borderRadius: "24px",
            border: "1px solid #f1f5f9",
            boxShadow: "0 10px 30px rgba(14, 43, 87, 0.04)",
        }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.7 }}>{description}</p>
        </div>
        <span style={{
            padding: "8px 12px",
            borderRadius: 999,
            background: profileComplete ? "#dcfce7" : "#e2e8f0",
            color: profileComplete ? "#166534" : "#334155",
            fontSize: 12,
            fontWeight: 800,
        }}>
          {profileComplete ? "Ready to book" : "Profile required"}
        </span>
      </div>

      <div className="account-avatar-stage">
        <button className="account-avatar-picker" type="button" onClick={function () { var _a; return (_a = avatarInputRef.current) === null || _a === void 0 ? void 0 : _a.click(); }}>
          {resolvedForm.avatarUrl ? (<img src={resolvedForm.avatarUrl} alt="Guest profile" className="account-avatar-preview"/>) : (<div className="account-avatar-fallback">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21a8 8 0 0 0-16 0"/>
                <circle cx="12" cy="8" r="4"/>
              </svg>
            </div>)}
          {uploading ? (<div className="account-avatar-overlay">
              <strong>Uploading...</strong>
            </div>) : null}
        </button>
        <input ref={avatarInputRef} className="account-hidden-file" type="file" accept="image/*" onChange={function (event) { return void handleAvatarUpload(event); }}/>
        <p className="account-upload-note" style={{ margin: 0 }}>
          Profile photo is optional. Add one if you want hosts to recognize you faster.
        </p>
      </div>

      <div className="dashboard-form-grid">
        <label>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "2px", display: "block" }}>Full name</span>
          <input className="text-input" required value={resolvedForm.name} onChange={function (event) { return setDraft(function (current) { return (__assign(__assign({}, current), { name: event.target.value })); }); }} placeholder="Aryan Krishan"/>
        </label>

        <label style={{ position: "relative" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "2px", display: "block" }}>Gender</span>
          <div style={{ position: "relative" }}>
            <select className="text-input" style={{ appearance: "none", paddingRight: "40px" }} required value={resolvedForm.gender} onChange={function (event) { return setDraft(function (current) { return (__assign(__assign({}, current), { gender: event.target.value })); }); }}>
              <option value="">Select gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            <lucide_react_1.ChevronDown size={18} style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", opacity: 0.5 }}/>
          </div>
        </label>

        <label style={{ position: "relative" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "2px", display: "block" }}>Date of birth</span>
          <div style={{ position: "relative" }}>
            <input className="text-input" required type="date" value={resolvedForm.dob} onChange={function (event) { return setDraft(function (current) { return (__assign(__assign({}, current), { dob: event.target.value })); }); }}/>
            <lucide_react_1.Calendar size={18} style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", opacity: 0.5 }}/>
          </div>
        </label>

        <label>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "2px", display: "block" }}>City</span>
          <input className="text-input" required value={resolvedForm.city} onChange={function (event) { return setDraft(function (current) { return (__assign(__assign({}, current), { city: event.target.value })); }); }} placeholder="Hisar"/>
        </label>

        <label>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "2px", display: "block" }}>State</span>
          <input className="text-input" required value={resolvedForm.state} onChange={function (event) { return setDraft(function (current) { return (__assign(__assign({}, current), { state: event.target.value })); }); }} placeholder="Haryana"/>
        </label>

        <label>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "2px", display: "block" }}>Phone</span>
          <input className="text-input" type="tel" value={resolvedForm.phone} disabled={phoneLocked} onChange={function (event) { return setDraft(function (current) { return (__assign(__assign({}, current), { phone: event.target.value })); }); }} placeholder="+91 XXXXX XXXXX"/>
        </label>

        <label>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "2px", display: "block" }}>Email</span>
          <input className="text-input" type="email" value={resolvedForm.email} disabled={emailLocked} onChange={function (event) { return setDraft(function (current) { return (__assign(__assign({}, current), { email: event.target.value })); }); }} placeholder="name@example.com"/>
        </label>

        <label className="full-span" style={{ marginTop: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "2px", display: "block" }}>About you</span>
          <textarea className="text-input" required rows={4} value={resolvedForm.about} onChange={function (event) { return setDraft(function (current) { return (__assign(__assign({}, current), { about: event.target.value })); }); }} placeholder="Tell Famlo hosts a little about yourself and why you travel." style={{ resize: "none", lineHeight: 1.6 }}/>
        </label>
      </div>

      {message ? (<div style={{
                borderRadius: 14,
                padding: "12px 14px",
                background: message.type === "success" ? "#dcfce7" : "#fee2e2",
                color: message.type === "success" ? "#166534" : "#b91c1c",
                fontWeight: 700,
            }}>
          {message.text}
        </div>) : null}

      <button className="button-like account-submit-btn" disabled={saving || uploading} type="submit">
        {saving ? "Saving..." : buttonLabel}
      </button>
    </form>);
}
