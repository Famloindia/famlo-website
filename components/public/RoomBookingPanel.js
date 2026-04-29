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
exports.RoomBookingPanel = RoomBookingPanel;
var image_1 = require("next/image");
var link_1 = require("next/link");
var react_1 = require("react");
var script_1 = require("next/script");
var lucide_react_1 = require("lucide-react");
var AuthModal_1 = require("@/components/auth/AuthModal");
var user_profile_1 = require("@/lib/user-profile");
var UserContext_1 = require("@/components/auth/UserContext");
var booking_time_1 = require("@/lib/booking-time");
var supabase_1 = require("@/lib/supabase");
var WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function asString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function parseDateString(value) {
    return new Date("".concat(value, "T00:00:00"));
}
function toDateString(value) {
    var year = value.getFullYear();
    var month = String(value.getMonth() + 1).padStart(2, "0");
    var day = String(value.getDate()).padStart(2, "0");
    return "".concat(year, "-").concat(month, "-").concat(day);
}
function compareDateStrings(a, b) {
    var timeA = parseDateString(a).getTime();
    var timeB = parseDateString(b).getTime();
    if (timeA === timeB)
        return 0;
    return timeA < timeB ? -1 : 1;
}
function addMonths(date, months) {
    var next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
}
function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}
function monthLabel(date) {
    return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
}
function buildMonthCells(monthDate) {
    var firstDay = startOfMonth(monthDate);
    var firstWeekday = firstDay.getDay();
    var totalDays = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    var cells = [];
    for (var index = 0; index < firstWeekday; index += 1) {
        cells.push(null);
    }
    for (var day = 1; day <= totalDays; day += 1) {
        cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
    }
    while (cells.length % 7 !== 0) {
        cells.push(null);
    }
    return cells;
}
function formatRangeLabel(startDate, endDate) {
    if (!startDate)
        return "Choose your stay dates";
    if (startDate === endDate) {
        return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parseDateString(startDate));
    }
    var start = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(parseDateString(startDate));
    var end = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parseDateString(endDate));
    return "".concat(start, " \u2192 ").concat(end);
}
function getRupeeLabel(value) {
    return value.toLocaleString("en-IN");
}
function resolveRoomPrice(room) {
    if (room.quarterEnabled && room.priceAfternoon > 0) {
        return room.priceAfternoon;
    }
    return room.priceFullday > 0
        ? room.priceFullday
        : room.priceMorning > 0
            ? room.priceMorning
            : room.priceAfternoon > 0
                ? room.priceAfternoon
                : room.priceEvening > 0
                    ? room.priceEvening
                    : 0;
}
function normalizeBlockedDateToken(token) {
    var _a;
    return (_a = token.split("::", 1)[0]) !== null && _a !== void 0 ? _a : token;
}
function formatTimeLabel(value, fallback) {
    var trimmed = asString(value);
    if (!trimmed)
        return fallback;
    return trimmed;
}
function ensureRazorpayCheckout() {
    if (typeof window === "undefined")
        return Promise.resolve();
    if (window.Razorpay)
        return Promise.resolve();
    return new Promise(function (resolve, reject) {
        var existing = document.querySelector('script[data-razorpay-checkout="true"]');
        if (existing) {
            existing.addEventListener("load", function () { return resolve(); }, { once: true });
            existing.addEventListener("error", function () { return reject(new Error("Failed to load Razorpay Checkout.")); }, { once: true });
            return;
        }
        var script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.dataset.razorpayCheckout = "true";
        script.onload = function () { return resolve(); };
        script.onerror = function () { return reject(new Error("Failed to load Razorpay Checkout.")); };
        document.body.appendChild(script);
    });
}
function warmRazorpayCheckout() {
    if (typeof window === "undefined")
        return;
    var scheduleWarmup = function () {
        void ensureRazorpayCheckout().catch(function () {
            // Ignore warmup failures and retry on the real checkout tap.
        });
    };
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(scheduleWarmup, { timeout: 1500 });
        return;
    }
    window.setTimeout(scheduleWarmup, 250);
}
function RoomBookingPanel(_a) {
    var _this = this;
    var home = _a.home, room = _a.room, areaLabel = _a.areaLabel;
    var supabase = (0, react_1.useMemo)(function () { return (0, supabase_1.createBrowserSupabaseClient)(); }, []);
    var _b = (0, UserContext_1.useUser)(), user = _b.user, profile = _b.profile, loading = _b.loading, refreshProfile = _b.refreshProfile;
    var _c = (0, react_1.useState)(false), showAuthModal = _c[0], setShowAuthModal = _c[1];
    var _d = (0, react_1.useState)(function () { return (0, booking_time_1.addIndiaDays)((0, booking_time_1.getTodayInIndia)(), 1); }), checkIn = _d[0], setCheckIn = _d[1];
    var _e = (0, react_1.useState)(function () { return (0, booking_time_1.addIndiaDays)((0, booking_time_1.getTodayInIndia)(), 1); }), checkOut = _e[0], setCheckOut = _e[1];
    var _f = (0, react_1.useState)(function () { return startOfMonth(parseDateString((0, booking_time_1.addIndiaDays)((0, booking_time_1.getTodayInIndia)(), 1))); }), anchorMonth = _f[0], setAnchorMonth = _f[1];
    var _g = (0, react_1.useState)(false), calendarTouched = _g[0], setCalendarTouched = _g[1];
    var _h = (0, react_1.useState)(1), guests = _h[0], setGuests = _h[1];
    var _j = (0, react_1.useState)(false), submitting = _j[0], setSubmitting = _j[1];
    var _k = (0, react_1.useState)(null), bookingError = _k[0], setBookingError = _k[1];
    var _l = (0, react_1.useState)(null), successMessage = _l[0], setSuccessMessage = _l[1];
    var _m = (0, react_1.useState)(null), receipt = _m[0], setReceipt = _m[1];
    var _o = (0, react_1.useState)(false), scriptReady = _o[0], setScriptReady = _o[1];
    var _p = (0, react_1.useState)(false), bookHovered = _p[0], setBookHovered = _p[1];
    var _q = (0, react_1.useState)([]), optimisticBlockedDates = _q[0], setOptimisticBlockedDates = _q[1];
    (0, react_1.useEffect)(function () {
        warmRazorpayCheckout();
    }, []);
    var releasePendingBooking = function (bookingId) { return __awaiter(_this, void 0, void 0, function () {
        var normalizedBookingId, authSession, authHeaders, response, payload;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    normalizedBookingId = bookingId.trim();
                    if (!normalizedBookingId)
                        return [2 /*return*/];
                    return [4 /*yield*/, supabase.auth.getSession()];
                case 1:
                    authSession = (_b.sent()).data.session;
                    authHeaders = {
                        "Content-Type": "application/json",
                    };
                    if (authSession === null || authSession === void 0 ? void 0 : authSession.access_token)
                        authHeaders.Authorization = "Bearer ".concat(authSession.access_token);
                    if (user === null || user === void 0 ? void 0 : user.id)
                        authHeaders["x-famlo-user-id"] = user.id;
                    if (user === null || user === void 0 ? void 0 : user.email)
                        authHeaders["x-famlo-user-email"] = user.email;
                    return [4 /*yield*/, fetch("/api/bookings/cancel", {
                            method: "POST",
                            headers: authHeaders,
                            body: JSON.stringify({
                                bookingId: normalizedBookingId,
                                action: "cancel",
                            }),
                        })];
                case 2:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 4];
                    return [4 /*yield*/, response.json().catch(function () { return null; })];
                case 3:
                    payload = (_b.sent());
                    throw new Error((_a = payload === null || payload === void 0 ? void 0 : payload.error) !== null && _a !== void 0 ? _a : "Could not release the unpaid booking hold.");
                case 4: return [2 /*return*/];
            }
        });
    }); };
    var price = resolveRoomPrice(room);
    var blockedDateTokens = (0, react_1.useMemo)(function () {
        var _a, _b;
        return new Set(__spreadArray(__spreadArray(__spreadArray([], ((_a = home.blockedDates) !== null && _a !== void 0 ? _a : []), true), ((_b = room.blockedDates) !== null && _b !== void 0 ? _b : []), true), optimisticBlockedDates, true).filter(function (value) { return value.length > 0; }));
    }, [home.blockedDates, optimisticBlockedDates, room.blockedDates]);
    var blockedDateSet = (0, react_1.useMemo)(function () { return new Set(Array.from(blockedDateTokens).flatMap(function (token) { return [token, normalizeBlockedDateToken(token)]; })); }, [blockedDateTokens]);
    var guestLimit = Math.max(1, room.maxGuests || 1);
    var guestOptions = (0, react_1.useMemo)(function () { return Array.from({ length: guestLimit }, function (_, index) { return index + 1; }); }, [guestLimit]);
    var selectedStartDate = checkIn;
    var selectedEndDate = checkOut || checkIn;
    var selectedBookingDates = (0, react_1.useMemo)(function () {
        var startTime = parseDateString(selectedStartDate).getTime();
        var endTime = parseDateString(selectedEndDate).getTime();
        var dates = [];
        var cursor = new Date(startTime);
        while (cursor.getTime() <= endTime) {
            dates.push(toDateString(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        return dates;
    }, [selectedStartDate, selectedEndDate]);
    var selectedDays = Math.max(1, Math.round((parseDateString(selectedEndDate).getTime() - parseDateString(selectedStartDate).getTime()) / 86400000) + 1);
    var estimatedTotal = price * selectedDays;
    var isSelectedDateBookable = compareDateStrings(selectedStartDate, (0, booking_time_1.getTodayInIndia)()) >= 0;
    var hasBlockedSelection = selectedBookingDates.some(function (date) { return blockedDateSet.has(date) || blockedDateSet.has("".concat(date, "::fullday")); });
    var hasUser = Boolean(user);
    var profileComplete = (0, user_profile_1.isGuestProfileComplete)(profile);
    var profileName = asString(profile === null || profile === void 0 ? void 0 : profile.name) || (user === null || user === void 0 ? void 0 : user.email) || "Guest";
    var profileCity = asString(profile === null || profile === void 0 ? void 0 : profile.city) || asString(profile === null || profile === void 0 ? void 0 : profile.last_location_label) || home.city || "";
    var rangeLabel = formatRangeLabel(selectedStartDate, selectedEndDate);
    var monthOne = anchorMonth;
    var selectedGuests = Math.min(Math.max(1, guests), guestLimit);
    function pickDate(dateString) {
        var today = (0, booking_time_1.getTodayInIndia)();
        if (compareDateStrings(dateString, today) < 0)
            return;
        if (!calendarTouched) {
            setCheckIn(dateString);
            setCheckOut(dateString);
            setCalendarTouched(true);
            return;
        }
        if (compareDateStrings(dateString, selectedStartDate) < 0) {
            setCheckIn(dateString);
            setCheckOut(dateString);
            return;
        }
        if (selectedStartDate === selectedEndDate && compareDateStrings(dateString, selectedStartDate) > 0) {
            setCheckOut(dateString);
            return;
        }
        if (compareDateStrings(dateString, selectedStartDate) < 0 || compareDateStrings(dateString, selectedEndDate) > 0) {
            setCheckIn(dateString);
            setCheckOut(dateString);
            return;
        }
        if (compareDateStrings(dateString, selectedStartDate) === 0) {
            setCheckOut(selectedStartDate);
            return;
        }
        if (compareDateStrings(dateString, selectedEndDate) === 0) {
            return;
        }
        setCheckOut(dateString);
    }
    function isSelectedDay(dateString) {
        return dateString === selectedStartDate || dateString === selectedEndDate;
    }
    function isInRange(dateString) {
        return compareDateStrings(dateString, selectedStartDate) > 0 && compareDateStrings(dateString, selectedEndDate) < 0;
    }
    function isBlockedDay(dateString) {
        return blockedDateSet.has(dateString) || blockedDateSet.has("".concat(dateString, "::fullday"));
    }
    function renderCalendar(monthDate) {
        var monthCells = buildMonthCells(monthDate);
        return (<div style={{ borderRadius: 20, border: "1px solid rgba(24,144,255,0.12)", background: "#fff", padding: 14, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={function () { return setAnchorMonth(function (current) { return addMonths(current, -1); }); }} style={{
                border: "1px solid rgba(14,43,87,0.12)",
                background: "#fff",
                borderRadius: 12,
                padding: "8px 10px",
                cursor: "pointer",
                fontWeight: 800,
                color: "#0f172a",
            }}>
            ←
          </button>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>{monthLabel(monthDate)}</div>
          <button type="button" onClick={function () { return setAnchorMonth(function (current) { return addMonths(current, 1); }); }} style={{
                border: "1px solid rgba(14,43,87,0.12)",
                background: "#fff",
                borderRadius: 12,
                padding: "8px 10px",
                cursor: "pointer",
                fontWeight: 800,
                color: "#0f172a",
            }}>
            →
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, fontSize: 11, fontWeight: 900, color: "#64748b" }}>
          {WEEKDAY_LABELS.map(function (label) { return (<div key={label} style={{ textAlign: "center" }}>{label}</div>); })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
          {monthCells.map(function (cell, index) {
                if (!cell) {
                    return <div key={"empty-".concat(index)} style={{ aspectRatio: "1 / 1", borderRadius: 12, background: "transparent" }}/>;
                }
                var dateString = toDateString(cell);
                var beforeToday = compareDateStrings(dateString, (0, booking_time_1.getTodayInIndia)()) < 0;
                var selected = isSelectedDay(dateString);
                var inRange = isInRange(dateString);
                var blocked = isBlockedDay(dateString);
                return (<button key={dateString} type="button" onClick={function () { return pickDate(dateString); }} disabled={beforeToday || blocked} style={{
                        aspectRatio: "1 / 1",
                        borderRadius: 14,
                        border: selected
                            ? "1px solid #1890ff"
                            : blocked
                                ? "1px solid rgba(220,38,38,0.22)"
                                : "1px solid rgba(14,43,87,0.10)",
                        background: selected
                            ? "#1890ff"
                            : blocked
                                ? "linear-gradient(180deg, #fff1f2, #ffe4e6)"
                                : inRange
                                    ? "rgba(24,144,255,0.12)"
                                    : beforeToday
                                        ? "#f8fafc"
                                        : "#fff",
                        color: selected ? "#fff" : blocked ? "#991b1b" : beforeToday ? "#cbd5e1" : "#0f172a",
                        fontWeight: selected ? 900 : 700,
                        cursor: beforeToday || blocked ? "not-allowed" : "pointer",
                        boxShadow: selected ? "0 8px 18px rgba(24,144,255,0.24)" : "none",
                        display: "grid",
                        placeItems: "center",
                    }} title={blocked ? "Booked" : undefined}>
                <span style={{ display: "grid", gap: 3, justifyItems: "center", lineHeight: 1 }}>
                  <span>{cell.getDate()}</span>
                </span>
              </button>);
            })}
        </div>
      </div>);
    }
    function handleBooking() {
        return __awaiter(this, void 0, void 0, function () {
            var session, currentUserId, authSession, authHeaders, response, payload, paymentIntentPayload, order_1, checkout, error_1;
            var _this = this;
            var _a, _b, _c, _d, _e, _f, _g, _h;
            return __generator(this, function (_j) {
                switch (_j.label) {
                    case 0:
                        if (!hasUser) {
                            setShowAuthModal(true);
                            return [2 /*return*/];
                        }
                        if (!profileComplete) {
                            setBookingError("Complete your guest profile first so the host can review your booking.");
                            return [2 /*return*/];
                        }
                        if (!home.isActive || !home.isAccepting) {
                            setBookingError("This host is not accepting bookings right now.");
                            return [2 /*return*/];
                        }
                        if (!room.isActive) {
                            setBookingError("This room is currently closed by the host.");
                            return [2 /*return*/];
                        }
                        if (!isSelectedDateBookable) {
                            setBookingError("This booking date has already passed. Please choose another date.");
                            return [2 /*return*/];
                        }
                        if (hasBlockedSelection) {
                            setBookingError("This room is already booked for one or more selected dates.");
                            return [2 /*return*/];
                        }
                        setSubmitting(true);
                        setBookingError(null);
                        _j.label = 1;
                    case 1:
                        _j.trys.push([1, 10, 11, 12]);
                        return [4 /*yield*/, supabase.auth.getUser()];
                    case 2:
                        session = (_j.sent()).data;
                        currentUserId = (_b = (_a = session.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : user === null || user === void 0 ? void 0 : user.id;
                        if (!currentUserId) {
                            setShowAuthModal(true);
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, supabase.auth.getSession()];
                    case 3:
                        authSession = (_j.sent()).data.session;
                        authHeaders = {
                            "Content-Type": "application/json",
                        };
                        if (authSession === null || authSession === void 0 ? void 0 : authSession.access_token)
                            authHeaders.Authorization = "Bearer ".concat(authSession.access_token);
                        if (user === null || user === void 0 ? void 0 : user.id)
                            authHeaders["x-famlo-user-id"] = user.id;
                        if (user === null || user === void 0 ? void 0 : user.email)
                            authHeaders["x-famlo-user-email"] = user.email;
                        return [4 /*yield*/, fetch("/api/bookings/create", {
                                method: "POST",
                                headers: authHeaders,
                                body: JSON.stringify({
                                    bookingType: "host_stay",
                                    userId: currentUserId,
                                    hostId: home.hostId,
                                    legacyFamilyId: home.legacyFamilyId,
                                    stayUnitId: room.id,
                                    quarterType: "fullday",
                                    quarterTime: "Full day",
                                    startDate: selectedStartDate,
                                    endDate: selectedEndDate,
                                    guestsCount: selectedGuests,
                                    unitPrice: price,
                                    commissionPct: home.platformCommissionPct,
                                    guestName: profileName,
                                    guestCity: profileCity || null,
                                    listingName: (_c = home.listingTitle) !== null && _c !== void 0 ? _c : home.name,
                                    hostArea: areaLabel,
                                    hostUserId: home.hostUserId,
                                    welcomeMessage: "Welcome to ".concat((_d = home.listingTitle) !== null && _d !== void 0 ? _d : home.name, ". Booking created from the room page."),
                                    requestPaymentIntent: true,
                                    gateway: "razorpay",
                                }),
                            })];
                    case 4:
                        response = _j.sent();
                        return [4 /*yield*/, response.json()];
                    case 5:
                        payload = _j.sent();
                        if (!response.ok || payload.error) {
                            throw new Error((_e = payload.error) !== null && _e !== void 0 ? _e : "Could not create booking.");
                        }
                        if (!payload.bookingId) return [3 /*break*/, 9];
                        paymentIntentPayload = payload.paymentIntent;
                        if (!!paymentIntentPayload) return [3 /*break*/, 6];
                        setReceipt(null);
                        setSuccessMessage("Payment setup needs one more retry, so this room has not been booked yet.");
                        return [3 /*break*/, 9];
                    case 6:
                        if (!(paymentIntentPayload.integrationStatus === "razorpay_ready" && paymentIntentPayload.order)) return [3 /*break*/, 8];
                        return [4 /*yield*/, ensureRazorpayCheckout()];
                    case 7:
                        _j.sent();
                        if (!window.Razorpay) {
                            throw new Error("Razorpay Checkout is unavailable.");
                        }
                        order_1 = paymentIntentPayload.order;
                        checkout = new window.Razorpay({
                            key: order_1.keyId,
                            amount: order_1.amount,
                            currency: order_1.currency,
                            name: "Famlo",
                            description: "Booking for ".concat((_f = home.listingTitle) !== null && _f !== void 0 ? _f : home.name),
                            order_id: order_1.orderId,
                            prefill: {
                                name: profileName,
                                email: (_h = (_g = profile === null || profile === void 0 ? void 0 : profile.email) !== null && _g !== void 0 ? _g : user === null || user === void 0 ? void 0 : user.email) !== null && _h !== void 0 ? _h : undefined,
                            },
                            notes: {
                                booking_id: order_1.bookingId,
                                payment_row_id: order_1.paymentRowId,
                            },
                            handler: function (paymentResponse) {
                                void (function () { return __awaiter(_this, void 0, void 0, function () {
                                    var verifyResponse, verifyPayload;
                                    var _a;
                                    return __generator(this, function (_b) {
                                        switch (_b.label) {
                                            case 0: return [4 /*yield*/, fetch("/api/payments/verify", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({
                                                        bookingId: order_1.bookingId,
                                                        paymentRowId: order_1.paymentRowId,
                                                        razorpay_payment_id: paymentResponse.razorpay_payment_id,
                                                        razorpay_order_id: paymentResponse.razorpay_order_id,
                                                        razorpay_signature: paymentResponse.razorpay_signature,
                                                    }),
                                                })];
                                            case 1:
                                                verifyResponse = _b.sent();
                                                return [4 /*yield*/, verifyResponse.json()];
                                            case 2:
                                                verifyPayload = _b.sent();
                                                if (!verifyResponse.ok || verifyPayload.error) {
                                                    throw new Error((_a = verifyPayload.error) !== null && _a !== void 0 ? _a : "Payment verification failed.");
                                                }
                                                setOptimisticBlockedDates(function (current) { return Array.from(new Set(__spreadArray(__spreadArray([], current, true), selectedBookingDates, true))); });
                                                setReceipt({
                                                    bookingId: order_1.bookingId,
                                                    paymentId: order_1.paymentRowId,
                                                    totalLabel: "\u20B9".concat(getRupeeLabel(order_1.amount / 100)),
                                                });
                                                setSuccessMessage(home.bookingRequiresHostApproval
                                                    ? "Your booking is under approval. Check it out on My Bookings."
                                                    : "Your booking is confirmed. Check it out on My Bookings.");
                                                void refreshProfile();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })().catch(function (error) {
                                    setBookingError(error instanceof Error ? error.message : "Payment verification failed.");
                                });
                            },
                            modal: {
                                ondismiss: function () {
                                    void releasePendingBooking(order_1.bookingId).catch(function (cancelError) {
                                        console.error("[room-booking-panel] release_pending_booking_failed", cancelError);
                                    });
                                    setReceipt(null);
                                    setSuccessMessage("Payment was not completed, so this room was not booked.");
                                },
                            },
                            theme: {
                                color: "#1890ff",
                            },
                        });
                        checkout.on("payment.failed", function (failureResponse) {
                            var _a, _b, _c, _d;
                            void releasePendingBooking(order_1.bookingId).catch(function (cancelError) {
                                console.error("[room-booking-panel] release_pending_booking_failed", cancelError);
                            });
                            setReceipt(null);
                            setBookingError((_d = (_b = (_a = failureResponse.error) === null || _a === void 0 ? void 0 : _a.description) !== null && _b !== void 0 ? _b : (_c = failureResponse.error) === null || _c === void 0 ? void 0 : _c.reason) !== null && _d !== void 0 ? _d : "Payment failed, so the booking was not saved.");
                        });
                        checkout.open();
                        setReceipt(null);
                        setSuccessMessage("Complete payment in the Razorpay window to confirm this booking.");
                        return [3 /*break*/, 9];
                    case 8:
                        setReceipt(null);
                        setSuccessMessage("Payment setup is pending on the server, so this room is not booked yet.");
                        _j.label = 9;
                    case 9: return [3 /*break*/, 12];
                    case 10:
                        error_1 = _j.sent();
                        setBookingError(error_1 instanceof Error ? error_1.message : "Booking failed.");
                        return [3 /*break*/, 12];
                    case 11:
                        setSubmitting(false);
                        return [7 /*endfinally*/];
                    case 12: return [2 /*return*/];
                }
            });
        });
    }
    return (<>
      {submitting ? (<div className="famlo-booking-loader" role="status" aria-live="polite" aria-label="Opening booking checkout">
          <div className="famlo-booking-loader-card">
            <div className="famlo-booking-loader-logo-wrap">
              <image_1.default className="famlo-booking-loader-logo" src="/logo-blue.png" alt="Famlo" width={1024} height={344} sizes="120px"/>
              <div className="famlo-booking-loader-wave"/>
            </div>
            <div className="famlo-booking-loader-title">Opening your booking</div>
            <div className="famlo-booking-loader-copy">
              We are preparing your room and payment checkout.
            </div>
          </div>
        </div>) : null}

      <section style={{
            background: "rgba(255,255,255,0.96)",
            borderRadius: 24,
            border: "1px solid rgba(24,144,255,0.16)",
            padding: 20,
            boxShadow: "0 16px 35px rgba(15,23,42,0.08)",
            display: "grid",
            gap: 16,
            position: "sticky",
            top: 104,
            alignSelf: "start",
            maxHeight: "calc(100vh - 128px)",
            overflowY: "auto",
            zIndex: 4,
        }}>
        <script_1.default src="https://checkout.razorpay.com/v1/checkout.js" onLoad={function () { return setScriptReady(true); }}/>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1890ff" }}>
            Booking
          </div>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0f172a" }}>Book this room here</h3>
        </div>
        <div style={{ padding: "8px 12px", borderRadius: 999, background: "#eff6ff", color: "#165dcc", fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Stay here
        </div>
      </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ borderRadius: 16, border: "1px solid rgba(14,43,87,0.16)", padding: "12px 14px", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0e2b57", marginBottom: 6 }}>
                Check-in time
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <lucide_react_1.CalendarDays size={18} color="#1890ff"/>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{formatTimeLabel(home.checkInTime, "11:00 AM")}</div>
              </div>
            </div>
            <div style={{ borderRadius: 16, border: "1px solid rgba(14,43,87,0.16)", padding: "12px 14px", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0e2b57", marginBottom: 6 }}>
                Check-out time
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <lucide_react_1.CalendarDays size={18} color="#1890ff"/>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{formatTimeLabel(home.checkOutTime, "1:00 PM")}</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(15,23,42,0.68)", lineHeight: 1.6 }}>
            {rangeLabel}. Booked dates are blocked for this specific room.
          </div>
        </div>

        {renderCalendar(monthOne)}

        <label style={{ display: "grid", gap: 8, fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0e2b57" }}>
          <span>Guests</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 16, border: "1px solid rgba(14,43,87,0.16)", padding: "12px 14px" }}>
            <lucide_react_1.Users size={18} color="#1890ff"/>
            <select aria-label={"Guests, up to ".concat(guestLimit)} value={selectedGuests} onChange={function (event) { return setGuests(Math.max(1, Math.min(guestLimit, Number(event.target.value) || 1))); }} style={{
            border: "none",
            outline: "none",
            width: "100%",
            fontSize: 15,
            fontWeight: 700,
            color: "#0f172a",
            background: "transparent",
            appearance: "none",
            cursor: "pointer",
        }}>
              {guestOptions.map(function (count) { return (<option key={count} value={count}>
                  {count} guest{count === 1 ? "" : "s"}
                </option>); })}
            </select>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(15,23,42,0.6)", textTransform: "none", letterSpacing: 0 }}>
            Up to {guestLimit} guest{guestLimit === 1 ? "" : "s"} allowed for this room. Guests do not change room price.
          </div>
        </label>
      </div>

      <div style={{ display: "grid", gap: 8, background: "#f8fbff", border: "1px solid rgba(24,144,255,0.12)", borderRadius: 18, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0e2b57" }}>
            Estimated total
          </span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "#165dcc" }}>
            <lucide_react_1.IndianRupee size={16} style={{ display: "inline", verticalAlign: "-2px" }}/>
            {getRupeeLabel(estimatedTotal)}
          </span>
        </div>
        <div style={{ display: "grid", gap: 8, fontSize: 12, fontWeight: 700, color: "rgba(15,23,42,0.68)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Room price per day</span>
            <span>₹{getRupeeLabel(price)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Stay dates</span>
            <span>{rangeLabel}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Selected days</span>
            <span>{selectedDays}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Guests</span>
            <span>{selectedGuests}</span>
          </div>
          {hasBlockedSelection ? (<div style={{ color: "#b91c1c", fontWeight: 800 }}>
              One or more selected dates are already booked for this room.
            </div>) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, fontWeight: 700, color: "rgba(15,23,42,0.68)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <lucide_react_1.MapPin size={14} color="#1890ff"/>
            {areaLabel}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <lucide_react_1.ShieldCheck size={14} color="#1890ff"/>
            {home.isAccepting ? "Accepting bookings" : "Closed"}
          </span>
        </div>
      </div>

      {bookingError ? (<div style={{ borderRadius: 16, padding: "12px 14px", background: "#fef2f2", color: "#991b1b", fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
          {bookingError}
        </div>) : null}

      {successMessage ? (<div style={{ borderRadius: 16, padding: "12px 14px", background: "#ecfdf5", color: "#166534", fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
          {successMessage}
          {receipt ? (<div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                Booking #{receipt.bookingId.slice(0, 8)} • Total {receipt.totalLabel}
              </div>
              <link_1.default href="/bookings" style={{
                    display: "inline-flex",
                    width: "fit-content",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "#166534",
                    color: "#fff",
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 800,
                }}>
                My Bookings
              </link_1.default>
            </div>) : null}
        </div>) : null}

      {!hasUser ? (<button type="button" onClick={function () { return setShowAuthModal(true); }} style={{
                border: "none",
                borderRadius: 16,
                background: "linear-gradient(135deg, #0e2b57, #1890ff)",
                color: "#fff",
                padding: "14px 16px",
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 10px 24px rgba(24, 144, 255, 0.28)",
            }}>
          Sign in to book
        </button>) : (<button type="button" onClick={function () { return void handleBooking(); }} onMouseEnter={function () { return setBookHovered(true); }} onMouseLeave={function () { return setBookHovered(false); }} disabled={submitting || loading || !room.isActive} style={{
                border: "none",
                borderRadius: 16,
                background: submitting
                    ? "linear-gradient(135deg, #93c5fd, #60a5fa)"
                    : "linear-gradient(120deg, #0e2b57 0%, #1890ff 50%, #0e2b57 100%)",
                backgroundSize: "220% 100%",
                backgroundPosition: bookHovered ? "100% 0" : "0% 0",
                color: "#fff",
                padding: "14px 16px",
                fontSize: 16,
                fontWeight: 900,
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: "0 10px 24px rgba(24, 144, 255, 0.28)",
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                transition: "background-position 220ms ease, transform 180ms ease, box-shadow 180ms ease",
            }}>
          {submitting ? "Creating booking..." : room.isActive ? "Book Now" : "Room closed"}
          <lucide_react_1.ChevronRight size={18}/>
        </button>)}

        <AuthModal_1.AuthModal isOpen={showAuthModal} onClose={function () { return setShowAuthModal(false); }}/>
      </section>

      <style jsx>{"\n        .famlo-booking-loader {\n          position: fixed;\n          inset: 0;\n          z-index: 1200;\n          display: grid;\n          place-items: center;\n          background: rgba(255, 255, 255, 0.76);\n          backdrop-filter: blur(10px);\n        }\n\n        .famlo-booking-loader-card {\n          width: min(360px, calc(100vw - 32px));\n          border-radius: 28px;\n          padding: 28px 24px;\n          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(239,246,255,0.96));\n          border: 1px solid rgba(24, 144, 255, 0.16);\n          box-shadow: 0 24px 64px rgba(14, 43, 87, 0.18);\n          display: grid;\n          justify-items: center;\n          gap: 14px;\n          text-align: center;\n        }\n\n        .famlo-booking-loader-logo-wrap {\n          position: relative;\n          overflow: hidden;\n          border-radius: 18px;\n          padding: 14px 22px;\n          background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(219,234,254,0.76));\n        }\n\n        .famlo-booking-loader-logo {\n          position: relative;\n          z-index: 1;\n          height: 44px;\n          width: auto;\n          display: block;\n          filter: saturate(1.08);\n        }\n\n        .famlo-booking-loader-wave {\n          position: absolute;\n          inset: 0;\n          transform: translateX(-120%);\n          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 28%, rgba(255,255,255,0.92) 52%, rgba(255,255,255,0.18) 74%, rgba(255,255,255,0) 100%);\n          animation: famloLoaderWave 1.45s ease-in-out infinite;\n        }\n\n        .famlo-booking-loader-title {\n          font-size: 22px;\n          font-weight: 900;\n          color: #0f172a;\n          letter-spacing: -0.03em;\n        }\n\n        .famlo-booking-loader-copy {\n          font-size: 13px;\n          line-height: 1.7;\n          font-weight: 700;\n          color: rgba(15, 23, 42, 0.68);\n          max-width: 260px;\n        }\n\n        @keyframes famloLoaderWave {\n          0% {\n            transform: translateX(-120%);\n          }\n          100% {\n            transform: translateX(120%);\n          }\n        }\n      "}</style>
    </>);
}
