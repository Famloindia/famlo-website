"use client";
"use strict";
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
exports.AuthModal = AuthModal;
var react_1 = require("react");
var supabase_1 = require("@/lib/supabase");
var UserContext_1 = require("./UserContext");
var ProfileCompletionForm_1 = require("@/components/account/ProfileCompletionForm");
var user_profile_1 = require("@/lib/user-profile");
var site_url_1 = require("@/lib/site-url");
function AuthModal(_a) {
    var _this = this;
    var isOpen = _a.isOpen, onClose = _a.onClose, _b = _a.skipProfileStep, skipProfileStep = _b === void 0 ? false : _b;
    var _c = (0, UserContext_1.useUser)(), user = _c.user, profile = _c.profile, refreshAuth = _c.refreshAuth;
    var supabase = (0, react_1.useMemo)(function () { return (0, supabase_1.createBrowserSupabaseClient)(); }, []);
    var _d = (0, react_1.useState)("phone"), type = _d[0], setType = _d[1];
    var _e = (0, react_1.useState)(""), value = _e[0], setValue = _e[1];
    var _f = (0, react_1.useState)(""), otp = _f[0], setOtp = _f[1];
    var _g = (0, react_1.useState)("enter"), step = _g[0], setStep = _g[1];
    var _h = (0, react_1.useState)(false), loading = _h[0], setLoading = _h[1];
    var _j = (0, react_1.useState)(""), error = _j[0], setError = _j[1];
    var _k = (0, react_1.useState)(""), sessionId = _k[0], setSessionId = _k[1];
    (0, react_1.useEffect)(function () {
        if (isOpen && user && (skipProfileStep || (0, user_profile_1.isGuestProfileComplete)(profile))) {
            onClose();
        }
    }, [isOpen, onClose, profile, skipProfileStep, user]);
    if (!isOpen)
        return null;
    var currentStep = skipProfileStep
        ? step
        : (user && !(0, user_profile_1.isGuestProfileComplete)(profile)) ? "profile" : step;
    var handleGoogleAuth = function () { return __awaiter(_this, void 0, void 0, function () {
        var nextPath, oauthError, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setLoading(true);
                    setError("");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    nextPath = "".concat(window.location.pathname).concat(window.location.search);
                    return [4 /*yield*/, supabase.auth.signInWithOAuth({
                            provider: "google",
                            options: {
                                redirectTo: (0, site_url_1.buildOAuthCallbackUrl)(nextPath),
                            },
                        })];
                case 2:
                    oauthError = (_a.sent()).error;
                    if (oauthError)
                        throw oauthError;
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    setError(err_1.message);
                    setLoading(false);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    var handleSendOtp = function (e) { return __awaiter(_this, void 0, void 0, function () {
        var res, data, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    setLoading(true);
                    setError("");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, fetch("/api/auth/otp/send", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ type: type, value: value }),
                        })];
                case 2:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _a.sent();
                    if (data.error)
                        throw new Error(data.error);
                    setSessionId(data.sessionId || "");
                    setStep("verify");
                    return [3 /*break*/, 6];
                case 4:
                    err_2 = _a.sent();
                    setError(err_2.message);
                    return [3 /*break*/, 6];
                case 5:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    var handleVerifyOtp = function (e) { return __awaiter(_this, void 0, void 0, function () {
        var res, data, signInError, signInError, err_3;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    e.preventDefault();
                    setLoading(true);
                    setError("");
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 11, 12, 13]);
                    return [4 /*yield*/, fetch("/api/auth/otp/verify", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ type: type, value: value, otp: otp, sessionId: sessionId }),
                        })];
                case 2:
                    res = _e.sent();
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _e.sent();
                    if (data.error)
                        throw new Error(data.error);
                    if (!data.session) return [3 /*break*/, 5];
                    return [4 /*yield*/, supabase.auth.setSession(data.session)];
                case 4:
                    _e.sent();
                    return [3 /*break*/, 9];
                case 5:
                    if (!(((_a = data.sessionCredentials) === null || _a === void 0 ? void 0 : _a.phone) && ((_b = data.sessionCredentials) === null || _b === void 0 ? void 0 : _b.password))) return [3 /*break*/, 7];
                    return [4 /*yield*/, supabase.auth.signInWithPassword({
                            phone: data.sessionCredentials.phone,
                            password: data.sessionCredentials.password,
                        })];
                case 6:
                    signInError = (_e.sent()).error;
                    if (signInError)
                        throw signInError;
                    return [3 /*break*/, 9];
                case 7:
                    if (!(((_c = data.sessionCredentials) === null || _c === void 0 ? void 0 : _c.email) && ((_d = data.sessionCredentials) === null || _d === void 0 ? void 0 : _d.password))) return [3 /*break*/, 9];
                    return [4 /*yield*/, supabase.auth.signInWithPassword({
                            email: data.sessionCredentials.email,
                            password: data.sessionCredentials.password,
                        })];
                case 8:
                    signInError = (_e.sent()).error;
                    if (signInError)
                        throw signInError;
                    _e.label = 9;
                case 9: return [4 /*yield*/, refreshAuth()];
                case 10:
                    _e.sent();
                    if (skipProfileStep) {
                        onClose();
                    }
                    else {
                        setStep("profile");
                    }
                    return [3 /*break*/, 13];
                case 11:
                    err_3 = _e.sent();
                    setError(err_3.message);
                    return [3 /*break*/, 13];
                case 12:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 13: return [2 /*return*/];
            }
        });
    }); };
    return (<div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={function (e) { return e.stopPropagation(); }}>
        <button className="close-btn" onClick={onClose}>&times;</button>
        
        {currentStep === "enter" && (<form className="auth-form" onSubmit={handleSendOtp}>
            <h2>{type === "phone" ? "Enter Mobile Number" : "Enter Email Address"}</h2>
            <p className="auth-subtitle">
              We will send a 6-digit OTP to verify your account.
            </p>

            <button type="button" className="google-btn" disabled={loading} onClick={function () { return void handleGoogleAuth(); }}>
              {loading ? "Opening Google..." : "Continue with Google"}
            </button>

            <div className="auth-divider"><span>or</span></div>
            
            <div className="type-toggle">
              <button type="button" className={type === "phone" ? "active" : ""} onClick={function () { return setType("phone"); }}>Phone</button>
              <button type="button" className={type === "email" ? "active" : ""} onClick={function () { return setType("email"); }}>Email</button>
            </div>

            <input type={type === "phone" ? "tel" : "email"} placeholder={type === "phone" ? "+91 XXXXX XXXXX" : "name@example.com"} value={value} onChange={function (e) { return setValue(e.target.value); }} className="auth-input" required/>
            
            {error && <p className="error-msg">{error}</p>}
            
            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? "Please wait..." : "Send OTP"}
            </button>
          </form>)}

        {currentStep === "verify" && (<form className="auth-form" onSubmit={handleVerifyOtp}>
            <h2>Verify code</h2>
            <p className="auth-subtitle">Sent to {value}</p>
            {type === "phone" ? <p className="auth-note">OTP may arrive on a phone call as well.</p> : null}
            
            <input type="text" placeholder="123 456" maxLength={6} value={otp} onChange={function (e) { return setOtp(e.target.value); }} className="auth-input otp-input" required/>

            {error && <p className="error-msg">{error}</p>}
            
            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? "Verifying..." : "Confirm & Login"}
            </button>
            <button type="button" className="back-btn" onClick={function () { return setStep("enter"); }}>Change Phone/Email</button>
          </form>)}

        {currentStep === "profile" && (<ProfileCompletionForm_1.ProfileCompletionForm title="Complete your profile" description="Save your guest profile before you continue to booking." buttonLabel="Save and continue" onSuccess={onClose}/>)}
      </div>

      <style jsx>{"\n        .modal-overlay {\n          position: fixed;\n          top: 0;\n          left: 0;\n          right: 0;\n          bottom: 0;\n          background: rgba(0, 0, 0, 0.4);\n          backdrop-filter: blur(5px);\n          z-index: 2000;\n          display: flex;\n          align-items: center;\n          justify-content: center;\n          padding: 1rem;\n        }\n\n        .modal-content {\n          background: #fff;\n          width: 100%;\n          max-width: 450px;\n          border-radius: 24px;\n          padding: 2.5rem;\n          position: relative;\n          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);\n        }\n\n        .close-btn {\n          position: absolute;\n          top: 1.5rem;\n          right: 1.5rem;\n          background: none;\n          border: none;\n          font-size: 2rem;\n          line-height: 1;\n          cursor: pointer;\n          color: #999;\n          transition: color 0.2s;\n        }\n\n        .close-btn:hover {\n          color: #333;\n        }\n\n        .auth-form h2 {\n          font-size: 1.75rem;\n          font-weight: 700;\n          margin-bottom: 0.5rem;\n          letter-spacing: -0.5px;\n        }\n\n        .auth-subtitle {\n          color: #666;\n          margin-bottom: 2rem;\n        }\n\n        .auth-note {\n          color: #64748b;\n          margin: -1rem 0 1rem;\n          font-size: 0.92rem;\n          line-height: 1.4;\n        }\n\n        .type-toggle {\n          display: flex;\n          background: #f0f0f0;\n          border-radius: 12px;\n          padding: 0.25rem;\n          margin-bottom: 1.5rem;\n        }\n\n        .type-toggle button {\n          flex: 1;\n          border: none;\n          background: none;\n          padding: 0.6rem;\n          border-radius: 8px;\n          font-weight: 600;\n          font-size: 0.9rem;\n          cursor: pointer;\n          transition: all 0.2s;\n        }\n\n        .type-toggle button.active {\n          background: #fff;\n          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);\n        }\n\n        .google-btn {\n          width: 100%;\n          border: 1px solid #dbe5ff;\n          background: #f8fbff;\n          color: #0f172a;\n          border-radius: 12px;\n          padding: 0.95rem 1rem;\n          font-size: 0.98rem;\n          font-weight: 700;\n          cursor: pointer;\n          margin-bottom: 1rem;\n        }\n\n        .auth-divider {\n          display: flex;\n          align-items: center;\n          gap: 12px;\n          color: #94a3b8;\n          font-size: 0.85rem;\n          margin-bottom: 1rem;\n        }\n\n        .auth-divider::before,\n        .auth-divider::after {\n          content: \"\";\n          flex: 1;\n          height: 1px;\n          background: #e2e8f0;\n        }\n\n        .auth-input {\n          width: 100%;\n          padding: 1rem 1.25rem;\n          border-radius: 12px;\n          border: 1px solid #ddd;\n          font-size: 1rem;\n          margin-bottom: 1.5rem;\n          outline: none;\n          transition: border-color 0.2s;\n        }\n\n        .auth-input:focus {\n          border-color: #000;\n        }\n\n        .otp-input {\n          text-align: center;\n          letter-spacing: 0.5rem;\n          font-weight: 700;\n          font-size: 1.5rem;\n        }\n\n        .submit-btn {\n          width: 100%;\n          padding: 1.1rem;\n          border-radius: 12px;\n          background: #000;\n          color: #fff;\n          border: none;\n          font-weight: 600;\n          font-size: 1rem;\n          cursor: pointer;\n          transition: transform 0.2s, background 0.2s;\n        }\n\n        .submit-btn:hover {\n          background: #333;\n          transform: translateY(-2px);\n        }\n\n        .submit-btn:disabled {\n          background: #999;\n          transform: none;\n        }\n\n        .error-msg {\n          color: #e53e3e;\n          margin-bottom: 1.5rem;\n          font-size: 0.9rem;\n        }\n\n        .back-btn {\n          width: 100%;\n          background: none;\n          border: none;\n          color: #666;\n          margin-top: 1rem;\n          font-size: 0.9rem;\n          text-decoration: underline;\n          cursor: pointer;\n        }\n      "}</style>
    </div>);
}
