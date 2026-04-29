//components/public/HomeBookingPreview.tsx
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
exports.HomeBookingPreview = HomeBookingPreview;
var react_1 = require("react");
var lucide_react_1 = require("lucide-react");
var booking_time_1 = require("@/lib/booking-time");
var ProfileCompletionForm_1 = require("@/components/account/ProfileCompletionForm");
var host_stay_availability_1 = require("@/lib/host-stay-availability");
var platform_utils_1 = require("@/lib/platform-utils");
var user_profile_1 = require("@/lib/user-profile");
var navigation_1 = require("next/navigation");
var UserContext_1 = require("@/components/auth/UserContext");
var AuthModal_1 = require("@/components/auth/AuthModal");
var host_interactions_1 = require("@/lib/host-interactions");
var supabase_1 = require("@/lib/supabase");
function ensureRazorpayCheckout() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (typeof window === "undefined")
                        return [2 /*return*/];
                    if (window.Razorpay)
                        return [2 /*return*/];
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
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
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
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
function HomeBookingPreview(_a) {
    var _this = this;
    var _b, _c, _d, _e;
    var homeId = _a.homeId, hostId = _a.hostId, legacyFamilyId = _a.legacyFamilyId, hostUserId = _a.hostUserId, homeName = _a.homeName, publicLocation = _a.publicLocation, googleMapsLink = _a.googleMapsLink, maxGuests = _a.maxGuests, _f = _a.platformCommissionPct, platformCommissionPct = _f === void 0 ? 18 : _f, quarterOptions = _a.quarterOptions, _g = _a.blockedDates, blockedDates = _g === void 0 ? [] : _g, _h = _a.existingBookings, existingBookings = _h === void 0 ? [] : _h, _j = _a.sticky, sticky = _j === void 0 ? false : _j;
    var router = (0, navigation_1.useRouter)();
    var _k = (0, UserContext_1.useUser)(), user = _k.user, profile = _k.profile, loading = _k.loading, refreshProfile = _k.refreshProfile;
    var supabase = (0, react_1.useMemo)(function () { return (0, supabase_1.createBrowserSupabaseClient)(); }, []);
    var _l = (0, react_1.useState)(false), showAuth = _l[0], setShowAuth = _l[1];
    var pendingContinueRef = (0, react_1.useRef)(false);
    var availableQuarters = quarterOptions.filter(function (quarter) { return quarter.price > 0; });
    var _m = (0, react_1.useState)((_c = (_b = availableQuarters[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : ""), selectedQuarterId = _m[0], setSelectedQuarterId = _m[1];
    var _o = (0, react_1.useState)(1), guestCount = _o[0], setGuestCount = _o[1];
    var _p = (0, react_1.useState)(""), selectedDate = _p[0], setSelectedDate = _p[1];
    var _q = (0, react_1.useState)(""), selectedEndDate = _q[0], setSelectedEndDate = _q[1];
    var dateInputRef = (0, react_1.useRef)(null);
    var endDateInputRef = (0, react_1.useRef)(null);
    var _r = (0, react_1.useState)(false), submitting = _r[0], setSubmitting = _r[1];
    var _s = (0, react_1.useState)(null), feedback = _s[0], setFeedback = _s[1];
    var _t = (0, react_1.useState)(false), showProfileGate = _t[0], setShowProfileGate = _t[1];
    var _u = (0, react_1.useState)(false), profileUnlocked = _u[0], setProfileUnlocked = _u[1];
    var _v = (0, react_1.useState)(false), resumeAfterProfileSave = _v[0], setResumeAfterProfileSave = _v[1];
    (0, react_1.useEffect)(function () {
        warmRazorpayCheckout();
    }, []);
    var releasePendingBooking = (0, react_1.useCallback)(function (bookingId) { return __awaiter(_this, void 0, void 0, function () {
        var normalizedBookingId, session, authHeaders, response, payload;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    normalizedBookingId = bookingId.trim();
                    if (!normalizedBookingId)
                        return [2 /*return*/];
                    return [4 /*yield*/, supabase.auth.getSession()];
                case 1:
                    session = (_b.sent()).data.session;
                    authHeaders = {
                        "Content-Type": "application/json",
                    };
                    if (session === null || session === void 0 ? void 0 : session.access_token)
                        authHeaders.Authorization = "Bearer ".concat(session.access_token);
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
    }); }, [supabase, user === null || user === void 0 ? void 0 : user.email, user === null || user === void 0 ? void 0 : user.id]);
    var selectedQuarter = (_d = availableQuarters.find(function (quarter) { return quarter.id === selectedQuarterId; })) !== null && _d !== void 0 ? _d : null;
    var isFullDay = (selectedQuarter === null || selectedQuarter === void 0 ? void 0 : selectedQuarter.id) === "fullday";
    var today = (0, booking_time_1.getTodayInIndia)();
    var occupancy = (0, react_1.useMemo)(function () { return (0, host_stay_availability_1.buildHostStayOccupancy)(existingBookings); }, [existingBookings]);
    var minimumDate = !selectedQuarter || !(0, booking_time_1.isBookingSlotExpired)({ date: today, quarterType: selectedQuarter.id })
        ? today
        : (0, booking_time_1.addIndiaDays)(today, 1);
    var effectiveDate = selectedDate || minimumDate;
    var effectiveEndDate = selectedEndDate || effectiveDate;
    var bookingDayCount = (0, react_1.useMemo)(function () {
        if (!isFullDay)
            return 1;
        return Math.max(1, (0, platform_utils_1.enumerateDateRange)(effectiveDate, effectiveEndDate).length);
    }, [effectiveDate, effectiveEndDate, isFullDay]);
    var total = selectedQuarter ? selectedQuarter.price * guestCount * bookingDayCount : 0;
    var guestLimit = Math.max(1, maxGuests !== null && maxGuests !== void 0 ? maxGuests : 1);
    var canBook = availableQuarters.length > 0;
    var profileReady = profileUnlocked || (0, user_profile_1.isGuestProfileComplete)(profile);
    var selectedDateHasExpired = Boolean(selectedDate) &&
        Boolean(selectedQuarter) &&
        (0, booking_time_1.isBookingSlotExpired)({ date: selectedDate, quarterType: selectedQuarter === null || selectedQuarter === void 0 ? void 0 : selectedQuarter.id });
    var formatDisplayDate = function (value) {
        if (!value)
            return "Select a date";
        try {
            return new Date("".concat(value, "T00:00:00")).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
            });
        }
        catch (_a) {
            return value;
        }
    };
    var getDateConflictMessage = (0, react_1.useCallback)(function (dateStr) {
        var _a;
        if (!dateStr)
            return null;
        if (blockedDates.includes(dateStr) || blockedDates.includes("".concat(dateStr, "::fullday"))) {
            return "This date is blocked by the host.";
        }
        if (!selectedQuarter) {
            return null;
        }
        var dayOccupancy = occupancy[dateStr];
        if (!dayOccupancy) {
            return null;
        }
        if (selectedQuarter.id === "fullday") {
            return dayOccupancy.anyBooking ? "This day is already booked. Please choose another date." : null;
        }
        if (dayOccupancy.fullDayGuests > 0) {
            return "This day is already booked for a full-day stay.";
        }
        var bookedGuests = (_a = dayOccupancy.quarterGuests[selectedQuarter.id]) !== null && _a !== void 0 ? _a : 0;
        if (bookedGuests + guestCount > guestLimit) {
            return "This ".concat(selectedQuarter.label.toLowerCase(), " slot is full for this date.");
        }
        return null;
    }, [blockedDates, guestCount, guestLimit, occupancy, selectedQuarter]);
    var openPicker = function (ref) {
        var _a, _b;
        var input = ref.current;
        if (input && "showPicker" in input) {
            (_b = (_a = input).showPicker) === null || _b === void 0 ? void 0 : _b.call(_a);
        }
        else {
            input === null || input === void 0 ? void 0 : input.click();
        }
    };
    var handleContinue = (0, react_1.useCallback)(function () {
        var args_1 = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args_1[_i] = arguments[_i];
        }
        return __awaiter(_this, __spreadArray([], args_1, true), void 0, function (fromAuth) {
            var bookingDate, bookingEndDate, conflictMessage, welcomeMessage, session, authHeaders, bookingResponse, bookingPayload, bookingSavedMessage, paymentIntentPayload, order_1, RazorpayCheckout, checkout, error_1;
            var _this = this;
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (fromAuth === void 0) { fromAuth = false; }
            return __generator(this, function (_j) {
                switch (_j.label) {
                    case 0:
                        bookingDate = selectedDate || minimumDate;
                        bookingEndDate = selectedQuarterId === "fullday" ? (selectedEndDate || bookingDate) : bookingDate;
                        conflictMessage = getDateConflictMessage(bookingDate);
                        if (!selectedDate) {
                            setSelectedDate(bookingDate);
                        }
                        if (selectedQuarterId === "fullday" && !selectedEndDate) {
                            setSelectedEndDate(bookingEndDate);
                        }
                        if (conflictMessage) {
                            setFeedback({ type: "error", text: conflictMessage });
                            return [2 /*return*/];
                        }
                        if (!user) {
                            pendingContinueRef.current = true;
                            setShowAuth(true);
                            return [2 /*return*/];
                        }
                        if (!selectedQuarter) {
                            setFeedback({ type: "error", text: "Choose a visit slot first." });
                            return [2 /*return*/];
                        }
                        if (selectedDateHasExpired) {
                            setFeedback({ type: "error", text: "The selected date is no longer available. Please choose the next available date." });
                            return [2 /*return*/];
                        }
                        if (!profileReady) {
                            setShowProfileGate(true);
                            if (!fromAuth) {
                                setFeedback({ type: "error", text: "Complete your guest profile once, then you can pay and confirm the booking here." });
                            }
                            return [2 /*return*/];
                        }
                        setFeedback(null);
                        setSubmitting(true);
                        _j.label = 1;
                    case 1:
                        _j.trys.push([1, 7, 8, 9]);
                        welcomeMessage = "Hi ".concat((_a = profile === null || profile === void 0 ? void 0 : profile.name) !== null && _a !== void 0 ? _a : "guest", ",\n\nWelcome to the Famlo family.\n\nYou are about to experience the real ").concat(publicLocation || "India", ". We are thrilled to host your journey.\n\nYour stay details:\nHost area: ").concat(publicLocation || "Shared after booking", "\nProperty: ").concat(homeName, "\nMap pin: ").concat(googleMapsLink || "Shared securely inside Famlo after confirmation", "\n\nSafety first:\n- Keep all payments and communication on Famlo\n- Please avoid sharing personal contact details in chat\n- Famlo may monitor chats for fraud prevention and safety\n\nNeed help during your stay? Use the Famlo assistance path from your booking thread. If it is urgent, open the emergency support option in your booking dashboard and our team can help right away.");
                        return [4 /*yield*/, supabase.auth.getSession()];
                    case 2:
                        session = (_j.sent()).data.session;
                        authHeaders = {
                            "Content-Type": "application/json",
                        };
                        if (session === null || session === void 0 ? void 0 : session.access_token)
                            authHeaders.Authorization = "Bearer ".concat(session.access_token);
                        if (user.id)
                            authHeaders["x-famlo-user-id"] = user.id;
                        if (user.email)
                            authHeaders["x-famlo-user-email"] = user.email;
                        return [4 /*yield*/, fetch("/api/bookings/create", {
                                method: "POST",
                                headers: authHeaders,
                                body: JSON.stringify({
                                    bookingType: "host_stay",
                                    userId: user.id,
                                    hostId: hostId !== null && hostId !== void 0 ? hostId : null,
                                    legacyFamilyId: legacyFamilyId !== null && legacyFamilyId !== void 0 ? legacyFamilyId : null,
                                    quarterType: selectedQuarter.id,
                                    quarterTime: selectedQuarter.time,
                                    startDate: bookingDate,
                                    endDate: bookingEndDate,
                                    guestsCount: guestCount,
                                    unitPrice: selectedQuarter.price,
                                    commissionPct: platformCommissionPct !== null && platformCommissionPct !== void 0 ? platformCommissionPct : 18,
                                    couponCode: null,
                                    vibe: "cultural",
                                    guestName: (_c = (_b = profile === null || profile === void 0 ? void 0 : profile.name) !== null && _b !== void 0 ? _b : user.email) !== null && _c !== void 0 ? _c : "Guest",
                                    guestCity: (_d = profile === null || profile === void 0 ? void 0 : profile.city) !== null && _d !== void 0 ? _d : null,
                                    listingName: homeName,
                                    hostArea: publicLocation || "Shared after booking",
                                    hostUserId: hostUserId !== null && hostUserId !== void 0 ? hostUserId : null,
                                    welcomeMessage: welcomeMessage,
                                    requestPaymentIntent: true,
                                    gateway: "razorpay",
                                }),
                            })];
                    case 3:
                        bookingResponse = _j.sent();
                        return [4 /*yield*/, bookingResponse.json()];
                    case 4:
                        bookingPayload = _j.sent();
                        if (!bookingResponse.ok || bookingPayload.error) {
                            throw new Error((_e = bookingPayload.error) !== null && _e !== void 0 ? _e : "Could not create booking.");
                        }
                        void (0, host_interactions_1.recordHostInteractionEvent)({
                            eventType: "booking_request",
                            hostId: hostId !== null && hostId !== void 0 ? hostId : null,
                            legacyFamilyId: legacyFamilyId !== null && legacyFamilyId !== void 0 ? legacyFamilyId : null,
                            pagePath: typeof window !== "undefined" ? window.location.pathname : null,
                            metadata: {
                                bookingId: typeof bookingPayload.bookingId === "string" ? bookingPayload.bookingId : null,
                                homeId: homeId,
                                guestCount: guestCount,
                                quarterType: selectedQuarter.id,
                            },
                        });
                        bookingSavedMessage = "Booking created and saved in Famlo. Opening secure payment now.";
                        paymentIntentPayload = bookingPayload.paymentIntent;
                        if (!paymentIntentPayload) {
                            setFeedback({
                                type: "success",
                                text: "".concat(bookingSavedMessage, " Payment setup needs one more retry, so please complete it from your bookings dashboard."),
                            });
                            router.push("/bookings");
                            return [2 /*return*/];
                        }
                        if (!(paymentIntentPayload.integrationStatus === "razorpay_ready" && paymentIntentPayload.order)) return [3 /*break*/, 6];
                        return [4 /*yield*/, ensureRazorpayCheckout()];
                    case 5:
                        _j.sent();
                        order_1 = paymentIntentPayload.order;
                        RazorpayCheckout = window.Razorpay;
                        if (!RazorpayCheckout) {
                            throw new Error("Razorpay Checkout is unavailable.");
                        }
                        checkout = new RazorpayCheckout({
                            key: order_1.keyId,
                            amount: order_1.amount,
                            currency: order_1.currency,
                            name: "Famlo",
                            description: "Booking for ".concat(homeName),
                            order_id: order_1.orderId,
                            prefill: {
                                name: (_f = profile === null || profile === void 0 ? void 0 : profile.name) !== null && _f !== void 0 ? _f : undefined,
                                email: (_h = (_g = profile === null || profile === void 0 ? void 0 : profile.email) !== null && _g !== void 0 ? _g : user.email) !== null && _h !== void 0 ? _h : undefined,
                            },
                            notes: {
                                booking_id: order_1.bookingId,
                                payment_row_id: order_1.paymentRowId,
                            },
                            handler: function (paymentResponse) {
                                void (function () { return __awaiter(_this, void 0, void 0, function () {
                                    var verifyResponse, verifyPayload, verifyError_1;
                                    var _a;
                                    return __generator(this, function (_b) {
                                        switch (_b.label) {
                                            case 0:
                                                _b.trys.push([0, 3, 4, 5]);
                                                return [4 /*yield*/, fetch("/api/payments/verify", {
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
                                                void (0, host_interactions_1.recordHostInteractionEvent)({
                                                    eventType: "booking_confirmed",
                                                    hostId: hostId !== null && hostId !== void 0 ? hostId : null,
                                                    legacyFamilyId: legacyFamilyId !== null && legacyFamilyId !== void 0 ? legacyFamilyId : null,
                                                    pagePath: typeof window !== "undefined" ? window.location.pathname : null,
                                                    metadata: {
                                                        bookingId: order_1.bookingId,
                                                        paymentRowId: order_1.paymentRowId,
                                                        homeId: homeId,
                                                        quarterType: selectedQuarter.id,
                                                    },
                                                });
                                                setFeedback({
                                                    type: "success",
                                                    text: "Payment verified and booking confirmed. The host has been notified in Famlo.",
                                                });
                                                router.push("/bookings");
                                                return [3 /*break*/, 5];
                                            case 3:
                                                verifyError_1 = _b.sent();
                                                setFeedback({
                                                    type: "error",
                                                    text: verifyError_1 instanceof Error ? verifyError_1.message : "Payment verification failed.",
                                                });
                                                return [3 /*break*/, 5];
                                            case 4:
                                                setSubmitting(false);
                                                return [7 /*endfinally*/];
                                            case 5: return [2 /*return*/];
                                        }
                                    });
                                }); })();
                            },
                            modal: {
                                ondismiss: function () {
                                    void releasePendingBooking(order_1.bookingId).catch(function (cancelError) {
                                        console.error("[home-booking-preview] release_pending_booking_failed", cancelError);
                                    });
                                    setSubmitting(false);
                                    setFeedback({
                                        type: "error",
                                        text: "Payment was not completed, so this stay was not booked.",
                                    });
                                },
                            },
                            theme: {
                                color: "#165dcc",
                            },
                        });
                        checkout.on("payment.failed", function (failureResponse) {
                            var _a, _b, _c, _d;
                            void releasePendingBooking(order_1.bookingId).catch(function (cancelError) {
                                console.error("[home-booking-preview] release_pending_booking_failed", cancelError);
                            });
                            setSubmitting(false);
                            setFeedback({
                                type: "error",
                                text: (_d = (_b = (_a = failureResponse.error) === null || _a === void 0 ? void 0 : _a.description) !== null && _b !== void 0 ? _b : (_c = failureResponse.error) === null || _c === void 0 ? void 0 : _c.reason) !== null && _d !== void 0 ? _d : "Payment failed, so the booking was not saved.",
                            });
                        });
                        checkout.open();
                        return [2 /*return*/];
                    case 6:
                        setFeedback({
                            type: "success",
                            text: "Booking created. Live payment keys are not fully configured, so payment is pending for now.",
                        });
                        return [3 /*break*/, 9];
                    case 7:
                        error_1 = _j.sent();
                        setFeedback({
                            type: "error",
                            text: error_1 instanceof Error ? error_1.message : "Booking failed.",
                        });
                        return [3 /*break*/, 9];
                    case 8:
                        setSubmitting(false);
                        return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        });
    }, [
        guestCount,
        hostId,
        homeName,
        googleMapsLink,
        hostUserId,
        legacyFamilyId,
        minimumDate,
        platformCommissionPct,
        profile === null || profile === void 0 ? void 0 : profile.city,
        profile === null || profile === void 0 ? void 0 : profile.email,
        profile === null || profile === void 0 ? void 0 : profile.name,
        publicLocation,
        router,
        selectedDate,
        selectedDateHasExpired,
        selectedEndDate,
        selectedQuarter,
        selectedQuarterId,
        getDateConflictMessage,
        supabase,
        user,
        profileReady,
    ]);
    (0, react_1.useEffect)(function () {
        if (!pendingContinueRef.current || loading || !user) {
            return;
        }
        pendingContinueRef.current = false;
        void handleContinue(true);
    }, [handleContinue, loading, user]);
    (0, react_1.useEffect)(function () {
        if (!resumeAfterProfileSave || !profileUnlocked) {
            return;
        }
        setResumeAfterProfileSave(false);
        void handleContinue(true);
    }, [handleContinue, profileUnlocked, resumeAfterProfileSave]);
    return (<div className="booking-preview famlo-preview-card" id="booking-panel" style={sticky ? { position: "sticky", top: 120 } : undefined}>
      <div className="famlo-preview-head">
        <h2>Choose your visit</h2>
        <p>Select a slot, date, and number of guests</p>
      </div>

      <div className="famlo-preview-slots">
        {availableQuarters.map(function (quarter) { return (<button className={"famlo-preview-slot ".concat(selectedQuarterId === quarter.id ? "is-selected" : "")} key={quarter.id} onClick={function () { return setSelectedQuarterId(quarter.id); }} type="button">
            <div className="famlo-preview-slot-icon">{quarter.icon}</div>
            <div className="famlo-preview-slot-copy">
              <strong>{quarter.label}</strong>
              <span>{quarter.time}</span>
              <small>{quarter.meal}</small>
            </div>
            <div className="famlo-preview-slot-price">
              <strong>₹{quarter.price.toLocaleString("en-IN")}</strong>
              <span>/ guest</span>
            </div>
            <div className="famlo-preview-slot-radio"/>
          </button>); })}
      </div>

      <div className="famlo-preview-fields">
        <label className="famlo-preview-field">
          <span className="famlo-preview-label">{isFullDay ? "Visit date" : "Visit date"}</span>
          <input ref={dateInputRef} className="text-input booking-field-input" min={minimumDate} onChange={function (event) {
            var nextDate = event.target.value;
            setSelectedDate(nextDate);
            if (isFullDay && (!selectedEndDate || selectedEndDate < nextDate)) {
                setSelectedEndDate(nextDate);
            }
        }} type="date" value={selectedDate} style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}/>
          <button type="button" className="famlo-preview-picker" onClick={function () { return openPicker(dateInputRef); }}>
            <lucide_react_1.CalendarDays size={16}/>
            <span>{formatDisplayDate(effectiveDate)}</span>
            <lucide_react_1.ChevronDown size={16}/>
          </button>
        </label>
        {selectedDate ? (<p className="booking-note" style={{ marginTop: 0 }}>
            {(_e = getDateConflictMessage(selectedDate)) !== null && _e !== void 0 ? _e : "This date is available for the selected slot."}
          </p>) : null}
        {isFullDay ? (<label className="famlo-preview-field">
            <span className="famlo-preview-label">Until</span>
            <input ref={endDateInputRef} className="text-input booking-field-input" min={selectedDate || minimumDate} onChange={function (event) { return setSelectedEndDate(event.target.value); }} type="date" value={selectedEndDate} style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}/>
            <button type="button" className="famlo-preview-picker" onClick={function () { return openPicker(endDateInputRef); }}>
              <lucide_react_1.CalendarDays size={16}/>
              <span>{formatDisplayDate(effectiveEndDate)}</span>
              <lucide_react_1.ChevronDown size={16}/>
            </button>
          </label>) : null}
        <div className="famlo-preview-field">
          <span className="famlo-preview-label">Guests</span>
          <div className="famlo-preview-counter">
            <span>Guests</span>
            <div className="famlo-preview-counter-controls">
              <button onClick={function () { return setGuestCount(function (count) { return Math.max(1, count - 1); }); }} type="button">
                <lucide_react_1.Minus size={14}/>
              </button>
              <strong>{guestCount}</strong>
              <button onClick={function () { return setGuestCount(function (count) { return Math.min(guestLimit, count + 1); }); }} type="button">
                <lucide_react_1.Plus size={14}/>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="famlo-preview-total">
        <div>
          <small>
            Total for {guestCount} guest{guestCount > 1 ? "s" : ""}{isFullDay ? " \u00B7 ".concat(bookingDayCount, " day").concat(bookingDayCount > 1 ? "s" : "") : ""}
          </small>
          <strong>₹{total.toLocaleString("en-IN")}</strong>
        </div>
        <div>
          <small>{isFullDay ? "per stay" : "per slot"}</small>
          <span>No hidden fees</span>
        </div>
      </div>

      <button className="famlo-preview-cta" disabled={!canBook || submitting} onClick={function () { return void handleContinue(); }}>
        {submitting ? "Processing..." : "Get it now"}
      </button>
      <div className="famlo-preview-certified">Famlo certified home</div>
      {feedback ? (<p style={{
                margin: "10px 18px 0",
                fontSize: 13,
                color: feedback.type === "error" ? "#b91c1c" : "#166534",
                fontWeight: 700,
            }}>
          {feedback.text}
        </p>) : null}
      {!canBook ? (<p style={{ margin: "10px 0 0", fontSize: 13, color: "#b91c1c", fontWeight: 700 }}>
          Pricing is not configured for this home yet, so booking is temporarily unavailable.
        </p>) : selectedDateHasExpired ? (<p style={{ margin: "10px 0 0", fontSize: 13, color: "#b45309", fontWeight: 700 }}>
          The selected date is no longer available for this slot in India time. Please pick the next available date.
        </p>) : null}

      {showAuth ? (<AuthModal_1.AuthModal isOpen={showAuth} onClose={function () {
                setShowAuth(false);
            }}/>) : null}

      {showProfileGate ? (<div style={{ padding: "18px" }}>
          <ProfileCompletionForm_1.ProfileCompletionForm compact title="Complete guest profile first" description="Save your guest profile here. Once done, you can pay directly from this page." buttonLabel="Save profile" onSuccess={function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, refreshProfile()];
                        case 1:
                            _a.sent();
                            setProfileUnlocked(true);
                            setShowProfileGate(false);
                            setResumeAfterProfileSave(true);
                            setFeedback({
                                type: "success",
                                text: "Profile saved. Payment can continue now.",
                            });
                            return [2 /*return*/];
                    }
                });
            }); }}/>
        </div>) : null}
    </div>);
}
