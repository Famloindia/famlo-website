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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = BookingsTab;
var react_1 = require("react");
var supabase_1 = require("@/lib/supabase");
var dashboard_module_css_1 = require("../dashboard.module.css");
var lucide_react_1 = require("lucide-react");
function formatDate(value) {
    if (typeof value !== "string" || value.length === 0)
        return "—";
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return value;
    return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatKycStatus(value) {
    if (typeof value !== "string" || value.length === 0)
        return "Profile pending";
    return value.replaceAll("_", " ");
}
function formatAge(dateOfBirth) {
    if (typeof dateOfBirth !== "string" || dateOfBirth.length === 0)
        return "Not added";
    var birthDate = new Date("".concat(dateOfBirth, "T00:00:00"));
    if (Number.isNaN(birthDate.getTime()))
        return "Not added";
    var today = new Date();
    var age = today.getFullYear() - birthDate.getFullYear();
    var monthDelta = today.getMonth() - birthDate.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
        age -= 1;
    }
    return age > 0 ? "".concat(age, " years") : "Not added";
}
function isCheckInWindowOpen(booking) {
    if (typeof (booking === null || booking === void 0 ? void 0 : booking.date_from) !== "string" || booking.date_from.length === 0)
        return false;
    var start = new Date("".concat(booking.date_from, "T00:00:00+05:30"));
    var end = typeof (booking === null || booking === void 0 ? void 0 : booking.date_to) === "string" && booking.date_to.length > 0
        ? new Date("".concat(booking.date_to, "T23:59:59+05:30"))
        : new Date("".concat(booking.date_from, "T23:59:59+05:30"));
    var windowStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    var windowEnd = new Date(end.getTime() + 12 * 60 * 60 * 1000);
    var now = Date.now();
    return now >= windowStart.getTime() && now <= windowEnd.getTime();
}
var guestBehaviorTags = [
    "respectful",
    "clean",
    "followed house rules",
    "good communication",
    "late without notice",
    "mess created",
    "rude behavior",
    "safety concern",
];
function BookingsTab(_a) {
    var bookingRows = _a.bookingRows, onOpenChat = _a.onOpenChat, _b = _a.loading, loading = _b === void 0 ? false : _b;
    var supabase = (0, supabase_1.createBrowserSupabaseClient)();
    var _c = (0, react_1.useState)(bookingRows), localRows = _c[0], setLocalRows = _c[1];
    var _d = (0, react_1.useState)({}), pendingActionById = _d[0], setPendingActionById = _d[1];
    var _e = (0, react_1.useState)({}), feedback = _e[0], setFeedback = _e[1];
    var _f = (0, react_1.useState)({}), checkInCodeById = _f[0], setCheckInCodeById = _f[1];
    var _g = (0, react_1.useState)({}), guestFeedbackDraftById = _g[0], setGuestFeedbackDraftById = _g[1];
    (0, react_1.useEffect)(function () {
        setLocalRows(bookingRows);
    }, [bookingRows]);
    if (loading && localRows.length === 0) {
        return (<div style={{ display: "flex", minHeight: "320px", alignItems: "center", justifyContent: "center" }}>
        <lucide_react_1.Loader2 className={dashboard_module_css_1.default.spin} size={32} color="#165dcc"/>
      </div>);
    }
    function getAuthHeaders() {
        return __awaiter(this, void 0, void 0, function () {
            var session, accessToken, headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, supabase.auth.getSession()];
                    case 1:
                        session = (_a.sent()).data.session;
                        accessToken = session === null || session === void 0 ? void 0 : session.access_token;
                        headers = {};
                        if (accessToken)
                            headers.Authorization = "Bearer ".concat(accessToken);
                        return [2 /*return*/, headers];
                }
            });
        });
    }
    function normalizeStatus(booking) {
        var _a;
        var status = String((_a = booking.status) !== null && _a !== void 0 ? _a : "");
        if (booking.checked_in_at) {
            return "checked_in";
        }
        if (status === "cancelled" || status === "cancelled_by_user" || status === "cancelled_by_partner" || status === "rejected") {
            return status;
        }
        return booking.payment_status === "paid" ? "confirmed" : status;
    }
    function getStatusLabel(status) {
        if (status === "checked_in")
            return "Checked in";
        if (status === "cancelled_by_user")
            return "Cancelled";
        if (status === "cancelled_by_partner")
            return "Cancelled";
        if (status === "cancelled")
            return "Cancelled";
        if (status === "rejected")
            return "Rejected";
        if (status === "confirmed")
            return "Confirmed";
        if (status === "accepted")
            return "Accepted";
        if (status === "pending")
            return "Pending";
        return status.replaceAll("_", " ");
    }
    function updateBookingStatus(bookingId, familyId, status) {
        return __awaiter(this, void 0, void 0, function () {
            var response, payload, error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        setPendingActionById(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = status, _a)));
                        });
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = { type: "success", text: "" }, _a)));
                        });
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, 5, 6]);
                        return [4 /*yield*/, fetch("/api/host/bookings/status", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ bookingId: bookingId, familyId: familyId, status: status }),
                            })];
                    case 2:
                        response = _b.sent();
                        return [4 /*yield*/, response.json()];
                    case 3:
                        payload = (_b.sent());
                        if (!response.ok) {
                            throw new Error((_a = payload.error) !== null && _a !== void 0 ? _a : "Could not update booking.");
                        }
                        setLocalRows(function (current) {
                            return current.map(function (row) { return (String(row.id) === bookingId ? __assign(__assign({}, row), { status: status }) : row); });
                        });
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = {
                                type: "success",
                                text: "Booking marked ".concat(String(status).replaceAll("_", " "), "."),
                            }, _a)));
                        });
                        return [3 /*break*/, 6];
                    case 4:
                        error_1 = _b.sent();
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = {
                                type: "error",
                                text: error_1 instanceof Error ? error_1.message : "Could not update booking.",
                            }, _a)));
                        });
                        return [3 /*break*/, 6];
                    case 5:
                        setPendingActionById(function (current) {
                            var next = __assign({}, current);
                            delete next[bookingId];
                            return next;
                        });
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    }
    function confirmGuestCheckIn(booking) {
        return __awaiter(this, void 0, void 0, function () {
            var bookingId, familyId, code, response, _a, _b, _c, payload, error_2;
            var _d;
            var _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        bookingId = String(booking.id);
                        familyId = String((_e = booking.family_id) !== null && _e !== void 0 ? _e : "");
                        code = String((_f = checkInCodeById[bookingId]) !== null && _f !== void 0 ? _f : "");
                        if (!code) {
                            setFeedback(function (current) {
                                var _a;
                                return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = { type: "error", text: "Please ask the guest for their code first." }, _a)));
                            });
                            return [2 /*return*/];
                        }
                        setPendingActionById(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = "guest_check_in", _a)));
                        });
                        _h.label = 1;
                    case 1:
                        _h.trys.push([1, 5, 6, 7]);
                        _a = fetch;
                        _b = ["/api/host/bookings/check-in"];
                        _d = {
                            method: "POST"
                        };
                        _c = [{ "Content-Type": "application/json" }];
                        return [4 /*yield*/, getAuthHeaders()];
                    case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_d.headers = __assign.apply(void 0, _c.concat([(_h.sent())])),
                                _d.body = JSON.stringify({ bookingId: bookingId, familyId: familyId, code: code }),
                                _d)]))];
                    case 3:
                        response = _h.sent();
                        return [4 /*yield*/, response.json()];
                    case 4:
                        payload = (_h.sent());
                        if (!response.ok || payload.error) {
                            throw new Error((_g = payload.error) !== null && _g !== void 0 ? _g : "Could not confirm guest check-in.");
                        }
                        setLocalRows(function (current) {
                            return current.map(function (row) { return (String(row.id) === bookingId ? __assign(__assign({}, row), { status: "checked_in" }) : row); });
                        });
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = { type: "success", text: "Guest check-in confirmed." }, _a)));
                        });
                        return [3 /*break*/, 7];
                    case 5:
                        error_2 = _h.sent();
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = {
                                type: "error",
                                text: error_2 instanceof Error ? error_2.message : "Could not confirm guest check-in.",
                            }, _a)));
                        });
                        return [3 /*break*/, 7];
                    case 6:
                        setPendingActionById(function (current) {
                            var next = __assign({}, current);
                            delete next[bookingId];
                            return next;
                        });
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    }
    function completeGuestStay(booking) {
        return __awaiter(this, void 0, void 0, function () {
            var bookingId, familyId, response, _a, _b, _c, payload, error_3;
            var _d;
            var _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        bookingId = String(booking.id);
                        familyId = String((_e = booking.family_id) !== null && _e !== void 0 ? _e : "");
                        setPendingActionById(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = "guest_checkout", _a)));
                        });
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 5, 6, 7]);
                        _a = fetch;
                        _b = ["/api/host/bookings/checkout"];
                        _d = {
                            method: "POST"
                        };
                        _c = [{ "Content-Type": "application/json" }];
                        return [4 /*yield*/, getAuthHeaders()];
                    case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_d.headers = __assign.apply(void 0, _c.concat([(_g.sent())])),
                                _d.body = JSON.stringify({ bookingId: bookingId, familyId: familyId }),
                                _d)]))];
                    case 3:
                        response = _g.sent();
                        return [4 /*yield*/, response.json()];
                    case 4:
                        payload = (_g.sent());
                        if (!response.ok || payload.error) {
                            throw new Error((_f = payload.error) !== null && _f !== void 0 ? _f : "Could not complete checkout.");
                        }
                        setLocalRows(function (current) {
                            return current.map(function (row) { return (String(row.id) === bookingId ? __assign(__assign({}, row), { status: "completed" }) : row); });
                        });
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = { type: "success", text: "Stay marked complete." }, _a)));
                        });
                        return [3 /*break*/, 7];
                    case 5:
                        error_3 = _g.sent();
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = {
                                type: "error",
                                text: error_3 instanceof Error ? error_3.message : "Could not complete checkout.",
                            }, _a)));
                        });
                        return [3 /*break*/, 7];
                    case 6:
                        setPendingActionById(function (current) {
                            var next = __assign({}, current);
                            delete next[bookingId];
                            return next;
                        });
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    }
    function saveGuestFeedback(booking) {
        return __awaiter(this, void 0, void 0, function () {
            var bookingId, familyId, draft, response, _a, _b, _c, payload, error_4;
            var _d;
            var _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        bookingId = String(booking.id);
                        familyId = String((_e = booking.family_id) !== null && _e !== void 0 ? _e : "");
                        draft = (_f = guestFeedbackDraftById[bookingId]) !== null && _f !== void 0 ? _f : { wouldHostAgain: true, tags: [], note: "" };
                        setPendingActionById(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = "guest_feedback", _a)));
                        });
                        _h.label = 1;
                    case 1:
                        _h.trys.push([1, 5, 6, 7]);
                        _a = fetch;
                        _b = ["/api/host/bookings/guest-feedback"];
                        _d = {
                            method: "POST"
                        };
                        _c = [{ "Content-Type": "application/json" }];
                        return [4 /*yield*/, getAuthHeaders()];
                    case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_d.headers = __assign.apply(void 0, _c.concat([(_h.sent())])),
                                _d.body = JSON.stringify({
                                    bookingId: bookingId,
                                    familyId: familyId,
                                    wouldHostAgain: draft.wouldHostAgain,
                                    behaviorTags: draft.tags,
                                    note: draft.note,
                                }),
                                _d)]))];
                    case 3:
                        response = _h.sent();
                        return [4 /*yield*/, response.json()];
                    case 4:
                        payload = (_h.sent());
                        if (!response.ok || payload.error) {
                            throw new Error((_g = payload.error) !== null && _g !== void 0 ? _g : "Could not save guest feedback.");
                        }
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = { type: "success", text: "Guest feedback saved." }, _a)));
                        });
                        return [3 /*break*/, 7];
                    case 5:
                        error_4 = _h.sent();
                        setFeedback(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[bookingId] = {
                                type: "error",
                                text: error_4 instanceof Error ? error_4.message : "Could not save guest feedback.",
                            }, _a)));
                        });
                        return [3 /*break*/, 7];
                    case 6:
                        setPendingActionById(function (current) {
                            var next = __assign({}, current);
                            delete next[bookingId];
                            return next;
                        });
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    }
    return (<div className={"".concat(dashboard_module_css_1.default.flexCol, " ").concat(dashboard_module_css_1.default.animateIn)}>
      <div style={{
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderBottom: "2px solid #f1f5f9",
            paddingBottom: "16px",
        }}>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: 900, margin: "0 0 4px", color: "#0e2b57" }}>
            Bookings Ledger
          </h2>
          <p style={{ fontSize: "13px", margin: 0, color: "rgba(14,43,87,0.6)", fontWeight: 600 }}>
            Real-time guest synchronization from the mobile app.
          </p>
        </div>
        <div style={{ background: "#f4f8ff", padding: "8px 16px", borderRadius: "12px", fontSize: "12px", fontWeight: 800, color: "#165dcc" }}>
          {localRows.length} Total Records
        </div>
      </div>

      <div className={dashboard_module_css_1.default.flexCol} style={{ gap: "20px" }}>
        {localRows.length === 0 ? (<div className={dashboard_module_css_1.default.glassCard} style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ color: "#cbd5e1", display: "flex", justifyContent: "center", marginBottom: "24px" }}>
              <lucide_react_1.Compass size={64}/>
            </div>
            <h3 style={{ fontSize: "20px", fontWeight: 900, margin: "0 0 8px", color: "#0e2b57" }}>
              No current bookings
            </h3>
            <p style={{ fontSize: "14px", color: "rgba(14,43,87,0.6)", margin: 0, maxWidth: "400px", alignSelf: "center", lineHeight: 1.5 }}>
              When guests choose your home in the Famlo app, their reservations will appear here
              automatically with the guest profile they saved in Famlo.
            </p>
          </div>) : (localRows.map(function (booking) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
            var userData = booking.users || {};
            var realName = String(userData.name || "Verified Guest");
            var propertyName = typeof booking.property_name === "string" && booking.property_name.length > 0 ? booking.property_name : "Famlo Stay";
            var propertyLocation = typeof booking.property_location === "string" ? booking.property_location : "";
            var guestCity = typeof userData.city === "string" ? userData.city : null;
            var guestState = typeof userData.state === "string" ? userData.state : null;
            var guestGender = typeof userData.gender === "string" ? userData.gender : null;
            var guestAge = formatAge(userData.date_of_birth);
            var guestAbout = typeof userData.about === "string" ? userData.about : "";
            var stayVibe = typeof booking.vibe === "string" ? booking.vibe : "";
            var quarterLabel = String((_b = (_a = booking.quarter_type) !== null && _a !== void 0 ? _a : booking.quarter_time) !== null && _b !== void 0 ? _b : "Reservation");
            var normalizedStatus = normalizeStatus(booking);
            var isConfirmed = normalizedStatus === "confirmed" || normalizedStatus === "completed" || normalizedStatus === "checked_in" || normalizedStatus === "accepted";
            var isPending = normalizedStatus === "pending";
            var isCheckedIn = normalizedStatus === "checked_in";
            var isCompleted = normalizedStatus === "completed";
            var isRejected = normalizedStatus === "rejected";
            var isCancelled = normalizedStatus === "cancelled_by_user" || normalizedStatus === "cancelled" || normalizedStatus === "cancelled_by_partner";
            var actionPending = pendingActionById[String(booking.id)];
            var displayAmount = Number(booking.family_payout) > 0
                ? Number(booking.family_payout)
                : Number(booking.total_price) || 0;
            return (<div key={String(booking.id)} className={dashboard_module_css_1.default.glassCard} style={{
                    padding: "24px",
                    border: isPending ? "2px solid #fef3c7" : isCancelled ? "2px solid #fecaca" : "1px solid rgba(14,43,87,0.06)",
                }}>
                <div className={dashboard_module_css_1.default.flexRow} style={{ alignItems: "flex-start", marginBottom: "24px", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                    <div style={{ position: "relative" }}>
                        <div style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #165dcc, #0e2b57)",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "3px solid white",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                }}>
                          <lucide_react_1.User size={24}/>
                        </div>
                      {isConfirmed && !isCancelled && (<div style={{
                        position: "absolute",
                        bottom: -2,
                        right: -2,
                        background: "#10b981",
                        borderRadius: "50%",
                        padding: "2px",
                        border: "2px solid white",
                    }}>
                          <lucide_react_1.CheckCircle2 size={12} color="white"/>
                        </div>)}
                    </div>

                    <div>
                      <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#165dcc", marginBottom: "6px" }}>
                        {propertyName}
                      </div>
                      <h4 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 900, color: "#0e2b57" }}>
                        {realName}
                      </h4>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <span style={{ color: "#165dcc", background: "#f4f8ff", padding: "2px 8px", borderRadius: "4px" }}>
                          {quarterLabel}
                        </span>
                        <span style={{ color: "rgba(14,43,87,0.4)" }}>•</span>
                        <span style={{ color: "rgba(14,43,87,0.6)" }}>
                          ID: {String((_c = booking.user_id) !== null && _c !== void 0 ? _c : "").slice(0, 8)}
                        </span>
                        {guestCity && (<>
                            <span style={{ color: "rgba(14,43,87,0.4)" }}>•</span>
                            <span style={{ color: "rgba(14,43,87,0.6)" }}>{[guestCity, guestState].filter(Boolean).join(", ")}</span>
                          </>)}
                        {propertyLocation ? (<>
                            <span style={{ color: "rgba(14,43,87,0.4)" }}>•</span>
                            <span style={{ color: "rgba(14,43,87,0.6)" }}>{propertyLocation}</span>
                          </>) : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    {!isPending && (<div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        background: isCancelled ? "#fef2f2" : isConfirmed ? "#f0fdf4" : "#f8fafc",
                        color: isCancelled ? "#b91c1c" : isConfirmed ? "#15803d" : "#64748b",
                        fontSize: "11px",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        borderRadius: "8px",
                        border: "1px solid ".concat(isCancelled ? "#fecaca" : isConfirmed ? "#bbf7d0" : "#e2e8f0"),
                    }}>
                        {getStatusLabel(normalizedStatus)}
                      </div>)}
                    <h3 style={{ margin: "12px 0 0", fontSize: "24px", fontWeight: 900, color: "#0e2b57" }}>
                      ₹{displayAmount.toLocaleString("en-IN")}
                    </h3>
                    <div style={{ fontSize: "10px", color: "rgba(14,43,87,0.4)", fontWeight: 700, marginTop: "2px" }}>
                      {Number(booking.family_payout) > 0 ? "Your payout" : "Booking total"}
                    </div>
                  </div>
                </div>

                <div className={dashboard_module_css_1.default.flexRow} style={{ background: "#f8fafc", padding: "20px", borderRadius: "18px", border: "1px solid #f1f5f9" }}>
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(14,43,87,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>
                        Stay Dates
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 900, color: "#0e2b57" }}>
                        {formatDate(booking.date_from)}
                        {booking.date_to && booking.date_to !== booking.date_from && (<span style={{ opacity: 0.5 }}> → {formatDate(booking.date_to)}</span>)}
                      </div>
                    </div>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(14,43,87,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>
                          Group Info
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 900, color: "#0e2b57" }}>
                        {String(booking.guests_count || 1)} Guest{Number(booking.guests_count) > 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                  <div style={{ display: "grid", gap: "12px", justifyItems: "end" }}>
                    {/* Removed Pending/KYC status badge as per request */}
                    {isConfirmed && !isCancelled ? (<button onClick={function () { return onOpenChat && onOpenChat(String(booking.conversation_id || booking.id)); }} className={dashboard_module_css_1.default.primaryBtn} style={{
                        width: "auto",
                        background: "#0e2b57",
                        padding: "14px 28px",
                        fontSize: "14px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontWeight: 900,
                        borderRadius: "14px",
                    }}>
                        <lucide_react_1.MessageCircle size={18}/> Open Chat
                      </button>) : (<div style={{
                        background: "#f1f5f9",
                        color: "#94a3b8",
                        padding: "14px 28px",
                        fontSize: "13px",
                        fontWeight: 800,
                        borderRadius: "14px",
                        cursor: "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px dashed #cbd5e1",
                    }}>
                        <div style={{ width: "8px", height: "8px", background: "#94a3b8", borderRadius: "50%" }}/>
                        {isCancelled ? "Guest cancelled" : "Unlocks after acceptance"}
                      </div>)}
                  </div>
                </div>

                <div style={{ marginTop: "14px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  {isPending ? (<>
                      <button type="button" className={dashboard_module_css_1.default.primaryBtn} onClick={function () { return void updateBookingStatus(String(booking.id), String(booking.family_id), "accepted"); }} disabled={Boolean(actionPending)} style={{ width: "auto", padding: "12px 18px", borderRadius: "12px" }}>
                        {actionPending === "accepted" ? <lucide_react_1.Loader2 className={dashboard_module_css_1.default.spin} size={16}/> : "Accept booking"}
                      </button>
                      <button type="button" onClick={function () { return void updateBookingStatus(String(booking.id), String(booking.family_id), "rejected"); }} disabled={Boolean(actionPending)} style={{
                        padding: "12px 18px",
                        borderRadius: "12px",
                        border: "1px solid #fecaca",
                        background: "#fff1f2",
                        color: "#be123c",
                        fontWeight: 800,
                        cursor: "pointer",
                    }}>
                        {actionPending === "rejected" ? "Rejecting..." : "Reject booking"}
                      </button>
                    </>) : null}

                  {isConfirmed && !isCheckedIn && !isCompleted && !isRejected && !isCancelled && isCheckInWindowOpen(booking) ? (<div style={{
                        display: "grid",
                        gap: 10,
                        padding: "16px",
                        borderRadius: "16px",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        minWidth: "320px",
                        flex: 1,
                    }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: "12px", fontWeight: 900, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Confirm Guest Check-In
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#1e3a8a", lineHeight: 1.5 }}>
                          Ask the guest for their secret code, enter it here, and Famlo will confirm check-in.
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <input className="text-input" value={(_d = checkInCodeById[String(booking.id)]) !== null && _d !== void 0 ? _d : ""} onChange={function (event) {
                        return setCheckInCodeById(function (current) {
                            var _a;
                            return (__assign(__assign({}, current), (_a = {}, _a[String(booking.id)] = event.target.value, _a)));
                        });
                    }} placeholder="Enter guest code" inputMode="numeric" style={{ maxWidth: 180, letterSpacing: "0.2em", fontWeight: 900 }}/>
                        <button type="button" className={dashboard_module_css_1.default.primaryBtn} onClick={function () { return void confirmGuestCheckIn(booking); }} disabled={Boolean(actionPending)} style={{ width: "auto", padding: "12px 18px", borderRadius: "12px" }}>
                          {actionPending === "guest_check_in" ? <lucide_react_1.Loader2 className={dashboard_module_css_1.default.spin} size={16}/> : "Confirm check-in"}
                        </button>
                      </div>
                    </div>) : null}

                  {isCheckedIn ? (<button type="button" onClick={function () { return void completeGuestStay(booking); }} disabled={Boolean(actionPending)} style={{
                        padding: "12px 18px",
                        borderRadius: "12px",
                        border: "1px solid #bbf7d0",
                        background: "#ecfdf5",
                        color: "#047857",
                        fontWeight: 800,
                        cursor: "pointer",
                    }}>
                      {actionPending === "guest_checkout" ? "Updating..." : "Mark checked out"}
                    </button>) : null}

                  {((_e = feedback[String(booking.id)]) === null || _e === void 0 ? void 0 : _e.text) ? (<span style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: ((_f = feedback[String(booking.id)]) === null || _f === void 0 ? void 0 : _f.type) === "error" ? "#b91c1c" : "#166534",
                    }}>
                      {(_g = feedback[String(booking.id)]) === null || _g === void 0 ? void 0 : _g.text}
                    </span>) : null}

                  {isCompleted ? (<div style={{
                        width: "100%",
                        display: "grid",
                        gap: 10,
                        padding: "16px",
                        borderRadius: "16px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                        marginTop: "6px",
                    }}>
                      <div style={{ fontSize: "12px", fontWeight: 900, color: "#0e2b57", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Internal guest feedback
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button type="button" className="button-like" onClick={function () {
                        return setGuestFeedbackDraftById(function (current) {
                            var _a;
                            var _b;
                            return (__assign(__assign({}, current), (_a = {}, _a[String(booking.id)] = __assign(__assign({}, ((_b = current[String(booking.id)]) !== null && _b !== void 0 ? _b : { wouldHostAgain: true, tags: [], note: "" })), { wouldHostAgain: true }), _a)));
                        });
                    }} style={{ background: ((_j = (_h = guestFeedbackDraftById[String(booking.id)]) === null || _h === void 0 ? void 0 : _h.wouldHostAgain) !== null && _j !== void 0 ? _j : true) ? "#165dcc" : "#e2e8f0" }}>
                          Would host again
                        </button>
                        <button type="button" className="button-like" onClick={function () {
                        return setGuestFeedbackDraftById(function (current) {
                            var _a;
                            var _b;
                            return (__assign(__assign({}, current), (_a = {}, _a[String(booking.id)] = __assign(__assign({}, ((_b = current[String(booking.id)]) !== null && _b !== void 0 ? _b : { wouldHostAgain: true, tags: [], note: "" })), { wouldHostAgain: false }), _a)));
                        });
                    }} style={{ background: ((_l = (_k = guestFeedbackDraftById[String(booking.id)]) === null || _k === void 0 ? void 0 : _k.wouldHostAgain) !== null && _l !== void 0 ? _l : true) ? "#e2e8f0" : "#dc2626" }}>
                          Review required
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {guestBehaviorTags.map(function (tag) {
                        var _a, _b;
                        var selected = ((_b = (_a = guestFeedbackDraftById[String(booking.id)]) === null || _a === void 0 ? void 0 : _a.tags) !== null && _b !== void 0 ? _b : []).includes(tag);
                        return (<button key={tag} type="button" onClick={function () {
                                return setGuestFeedbackDraftById(function (current) {
                                    var _a;
                                    var _b;
                                    var currentDraft = (_b = current[String(booking.id)]) !== null && _b !== void 0 ? _b : { wouldHostAgain: true, tags: [], note: "" };
                                    var tags = selected
                                        ? currentDraft.tags.filter(function (value) { return value !== tag; })
                                        : __spreadArray(__spreadArray([], currentDraft.tags, true), [tag], false);
                                    return __assign(__assign({}, current), (_a = {}, _a[String(booking.id)] = __assign(__assign({}, currentDraft), { tags: tags }), _a));
                                });
                            }} style={{
                                padding: "8px 10px",
                                borderRadius: "999px",
                                border: selected ? "1px solid #165dcc" : "1px solid #cbd5e1",
                                background: selected ? "#eff6ff" : "#fff",
                                fontWeight: 700,
                                fontSize: "12px",
                                cursor: "pointer",
                            }}>
                              {tag}
                            </button>);
                    })}
                      </div>
                      <textarea className="text-input" rows={3} placeholder="Optional private note about this guest" value={(_o = (_m = guestFeedbackDraftById[String(booking.id)]) === null || _m === void 0 ? void 0 : _m.note) !== null && _o !== void 0 ? _o : ""} onChange={function (event) {
                        return setGuestFeedbackDraftById(function (current) {
                            var _a;
                            var _b;
                            return (__assign(__assign({}, current), (_a = {}, _a[String(booking.id)] = __assign(__assign({}, ((_b = current[String(booking.id)]) !== null && _b !== void 0 ? _b : { wouldHostAgain: true, tags: [], note: "" })), { note: event.target.value }), _a)));
                        });
                    }}/>
                      <button type="button" className="button-like" onClick={function () { return void saveGuestFeedback(booking); }} disabled={Boolean(actionPending)} style={{ width: "fit-content" }}>
                        {actionPending === "guest_feedback" ? "Saving..." : "Save guest feedback"}
                      </button>
                    </div>) : null}

                  <a href={"/api/bookings/receipt?bookingId=".concat(String(booking.id))} target="_blank" rel="noreferrer" style={{
                    padding: "12px 18px",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#0e2b57",
                    fontWeight: 800,
                    textDecoration: "none",
                }}>
                    Guest receipt
                  </a>

                  {typeof booking.payout_id === "string" && booking.payout_id.length > 0 ? (<a href={"/api/host/payouts/statement?payoutId=".concat(String(booking.payout_id))} target="_blank" rel="noreferrer" style={{
                        padding: "12px 18px",
                        borderRadius: "12px",
                        border: "1px solid #bbf7d0",
                        background: "#f0fdf4",
                        color: "#047857",
                        fontWeight: 800,
                        textDecoration: "none",
                    }}>
                      Host receipt
                    </a>) : null}
                            <div style={{
                    marginTop: "16px",
                }}>
                    <div style={{ padding: "20px", borderRadius: "18px", background: "#ffffff", border: "1px solid #f1f5f9", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#165dcc", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>
                      Guest snapshot
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", color: "#0e2b57", fontWeight: 900, marginBottom: "10px" }}>
                      <lucide_react_1.MapPin size={16}/>
                      <span style={{ fontSize: "14px" }}>{[guestCity, guestState].filter(Boolean).join(", ") || "Location on profile"}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                      <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0e2b57", fontSize: "12px", fontWeight: 800 }}>
                        Age: {guestAge}
                      </span>
                      <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0e2b57", fontSize: "12px", fontWeight: 800 }}>
                        Gender: {guestGender || "Not added"}
                      </span>
                      <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0e2b57", fontSize: "12px", fontWeight: 800 }}>
                        State: {guestState || "Not added"}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: "rgba(14,43,87,0.7)", fontSize: "14px", lineHeight: 1.6, fontWeight: 600 }}>
                      {guestAbout || "This guest has not added an about section yet."}
                    </p>
                  </div>
                </div>      </div>
              </div>);
        }))}
      </div>
    </div>);
}
