//components/public/HomeBookingFlow.tsx
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
exports.HomeBookingFlow = HomeBookingFlow;
var image_1 = require("next/image");
var link_1 = require("next/link");
var navigation_1 = require("next/navigation");
var react_1 = require("react");
var lucide_react_1 = require("lucide-react");
var ProfileCompletionForm_1 = require("@/components/account/ProfileCompletionForm");
var AuthModal_1 = require("@/components/auth/AuthModal");
var user_profile_1 = require("@/lib/user-profile");
var booking_time_1 = require("@/lib/booking-time");
var host_interactions_1 = require("@/lib/host-interactions");
var supabase_1 = require("@/lib/supabase");
var host_stay_availability_1 = require("@/lib/host-stay-availability");
var DEFAULT_ACTIVE_QUARTERS = ["morning", "afternoon", "evening", "fullday"];
var QUARTERS = [
    { id: "morning", label: "Morning", time: "7AM - 12PM", meal: "Breakfast included", price: 0, icon: <lucide_react_1.Sunrise size={18} strokeWidth={2.2}/> },
    { id: "afternoon", label: "Afternoon", time: "12PM - 5PM", meal: "Lunch included", price: 0, icon: <lucide_react_1.Sun size={18} strokeWidth={2.2}/> },
    { id: "evening", label: "Evening", time: "5PM - 10PM", meal: "Dinner included", price: 0, icon: <lucide_react_1.Sunset size={18} strokeWidth={2.2}/> },
    { id: "fullday", label: "Full Day", time: "7AM - 10PM", meal: "All meals included", price: 0, icon: <lucide_react_1.SunMoon size={18} strokeWidth={2.2}/> }
];
function getToday() {
    return (0, booking_time_1.getTodayInIndia)();
}
function slotToken(dateStr, slotKey) {
    return "".concat(dateStr, "::").concat(slotKey);
}
function enumerateDates(from, to) {
    var _a;
    var start = new Date("".concat(from, "T00:00:00Z"));
    var end = new Date("".concat(to, "T00:00:00Z"));
    var output = [];
    while (start <= end) {
        output.push((_a = start.toISOString().split("T")[0]) !== null && _a !== void 0 ? _a : from);
        start.setUTCDate(start.getUTCDate() + 1);
    }
    return output;
}
function compareDateStrings(left, right) {
    return left.localeCompare(right);
}
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
function HomeBookingFlow(_a) {
    var _this = this;
    var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    var home = _a.home, _t = _a.existingBookings, existingBookings = _t === void 0 ? [] : _t, _u = _a.stayUnits, stayUnits = _u === void 0 ? [] : _u;
    var supabase = (0, react_1.useMemo)(function () { return (0, supabase_1.createBrowserSupabaseClient)(); }, []);
    var searchParams = (0, navigation_1.useSearchParams)();
    var inlineWidgetRef = (0, react_1.useRef)(null);
    var resumeStepRef = (0, react_1.useRef)("quarter");
    var _v = (0, react_1.useState)(null), currentUserId = _v[0], setCurrentUserId = _v[1];
    var _w = (0, react_1.useState)(null), currentUserEmail = _w[0], setCurrentUserEmail = _w[1];
    var _x = (0, react_1.useState)(null), guestName = _x[0], setGuestName = _x[1];
    var _y = (0, react_1.useState)(null), guestCity = _y[0], setGuestCity = _y[1];
    var _z = (0, react_1.useState)(false), profileComplete = _z[0], setProfileComplete = _z[1];
    var _0 = (0, react_1.useState)(false), sessionChecked = _0[0], setSessionChecked = _0[1];
    var _1 = (0, react_1.useState)(false), authReady = _1[0], setAuthReady = _1[1];
    var _2 = (0, react_1.useState)(true), loadingAuth = _2[0], setLoadingAuth = _2[1];
    var _3 = (0, react_1.useState)("login"), step = _3[0], setStep = _3[1];
    var _4 = (0, react_1.useState)(null), authError = _4[0], setAuthError = _4[1];
    var _5 = (0, react_1.useState)(false), submitting = _5[0], setSubmitting = _5[1];
    var _6 = (0, react_1.useState)(null), bookingError = _6[0], setBookingError = _6[1];
    var _7 = (0, react_1.useState)(null), successMessage = _7[0], setSuccessMessage = _7[1];
    var _8 = (0, react_1.useState)(null), bookingReceipt = _8[0], setBookingReceipt = _8[1];
    var _9 = (0, react_1.useState)(""), couponCode = _9[0], setCouponCode = _9[1];
    var _10 = (0, react_1.useState)(null), quote = _10[0], setQuote = _10[1];
    var _11 = (0, react_1.useState)(false), quoteLoading = _11[0], setQuoteLoading = _11[1];
    var _12 = (0, react_1.useState)(false), showAuthModal = _12[0], setShowAuthModal = _12[1];
    var _13 = (0, react_1.useState)(false), saved = _13[0], setSaved = _13[1];
    var _14 = (0, react_1.useState)(false), aboutExpanded = _14[0], setAboutExpanded = _14[1];
    var requestedStep = searchParams.get("step");
    var requestedEntry = searchParams.get("entry");
    var requestedStayUnitId = searchParams.get("stay_unit_id");
    var activeStayUnits = (0, react_1.useMemo)(function () { return stayUnits.filter(function (unit) { return unit.isActive; }); }, [stayUnits]);
    var activeStayUnitCount = activeStayUnits.length;
    var hasAnyActiveStayUnits = activeStayUnitCount > 0;
    var hasClosedRooms = stayUnits.some(function (unit) { return !unit.isActive; });
    var primaryStayUnitId = (0, react_1.useMemo)(function () { var _a, _b, _c, _d; return (_d = (_b = (_a = stayUnits.find(function (unit) { return unit.isPrimary; })) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : (_c = stayUnits[0]) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null; }, [stayUnits]);
    var _15 = (0, react_1.useState)((_e = (_c = (_b = activeStayUnits[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : (_d = stayUnits[0]) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : ""), selectedStayUnitId = _15[0], setSelectedStayUnitId = _15[1];
    var selectedStayUnit = (0, react_1.useMemo)(function () { var _a, _b; return (_b = (_a = activeStayUnits.find(function (unit) { return unit.id === selectedStayUnitId; })) !== null && _a !== void 0 ? _a : activeStayUnits[0]) !== null && _b !== void 0 ? _b : null; }, [activeStayUnits, selectedStayUnitId]);
    var effectiveBlockedDates = (0, react_1.useMemo)(function () { var _a, _b; return Array.from(new Set(__spreadArray(__spreadArray([], ((_a = home.blockedDates) !== null && _a !== void 0 ? _a : []), true), ((_b = selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.blockedDates) !== null && _b !== void 0 ? _b : []), true))); }, [home.blockedDates, selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.blockedDates]);
    var isAuthStateLoading = loadingAuth || !sessionChecked || !authReady;
    var getAuthHeaders = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var session, headers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase.auth.getSession()];
                case 1:
                    session = (_a.sent()).data.session;
                    headers = {};
                    if (session === null || session === void 0 ? void 0 : session.access_token)
                        headers.Authorization = "Bearer ".concat(session.access_token);
                    if (currentUserId)
                        headers["x-famlo-user-id"] = currentUserId;
                    if (currentUserEmail)
                        headers["x-famlo-user-email"] = currentUserEmail;
                    return [2 /*return*/, headers];
            }
        });
    }); }, [currentUserEmail, currentUserId, supabase]);
    var releasePendingBooking = (0, react_1.useCallback)(function (bookingId) { return __awaiter(_this, void 0, void 0, function () {
        var normalizedBookingId, response, _a, _b, _c, payload;
        var _d;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    normalizedBookingId = bookingId.trim();
                    if (!normalizedBookingId)
                        return [2 /*return*/];
                    _a = fetch;
                    _b = ["/api/bookings/cancel"];
                    _d = {
                        method: "POST"
                    };
                    _c = [{ "Content-Type": "application/json" }];
                    return [4 /*yield*/, getAuthHeaders()];
                case 1: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_d.headers = __assign.apply(void 0, _c.concat([(_f.sent())])),
                            _d.body = JSON.stringify({
                                bookingId: normalizedBookingId,
                                action: "cancel",
                            }),
                            _d)]))];
                case 2:
                    response = _f.sent();
                    if (!!response.ok) return [3 /*break*/, 4];
                    return [4 /*yield*/, response.json().catch(function () { return null; })];
                case 3:
                    payload = (_f.sent());
                    throw new Error((_e = payload === null || payload === void 0 ? void 0 : payload.error) !== null && _e !== void 0 ? _e : "Could not release the unpaid booking hold.");
                case 4: return [2 /*return*/];
            }
        });
    }); }, [getAuthHeaders]);
    (0, react_1.useEffect)(function () {
        warmRazorpayCheckout();
    }, []);
    (0, react_1.useEffect)(function () {
        if (requestedStayUnitId && stayUnits.some(function (unit) { return unit.id === requestedStayUnitId && unit.isActive; })) {
            setSelectedStayUnitId(requestedStayUnitId);
            return;
        }
        if (!selectedStayUnitId && activeStayUnits[0]) {
            setSelectedStayUnitId(activeStayUnits[0].id);
            return;
        }
        if (selectedStayUnitId && !stayUnits.some(function (unit) { return unit.id === selectedStayUnitId && unit.isActive; }) && activeStayUnits[0]) {
            setSelectedStayUnitId(activeStayUnits[0].id);
        }
    }, [activeStayUnits, requestedStayUnitId, selectedStayUnitId, stayUnits]);
    var quarterOptions = (0, react_1.useMemo)(function () {
        var activeQuarters = home.activeQuarters.length > 0 ? home.activeQuarters : DEFAULT_ACTIVE_QUARTERS;
        var quarterPriceMap = {
            morning: (selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.priceMorning) && selectedStayUnit.priceMorning > 0 ? selectedStayUnit.priceMorning : home.priceMorning,
            afternoon: (selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.priceAfternoon) && selectedStayUnit.priceAfternoon > 0 ? selectedStayUnit.priceAfternoon : home.priceAfternoon,
            evening: (selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.priceEvening) && selectedStayUnit.priceEvening > 0 ? selectedStayUnit.priceEvening : home.priceEvening,
            fullday: (selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.priceFullday) && selectedStayUnit.priceFullday > 0 ? selectedStayUnit.priceFullday : home.priceFullday
        };
        return QUARTERS.map(function (quarter) { return (__assign(__assign({}, quarter), { price: quarterPriceMap[quarter.id] })); }).filter(function (quarter) { return activeQuarters.includes(quarter.id) && quarter.price > 0; });
    }, [home, selectedStayUnit]);
    var _16 = (0, react_1.useState)((_g = (_f = quarterOptions[0]) === null || _f === void 0 ? void 0 : _f.id) !== null && _g !== void 0 ? _g : ""), selectedQuarterId = _16[0], setSelectedQuarterId = _16[1];
    var _17 = (0, react_1.useState)(getToday()), dateFrom = _17[0], setDateFrom = _17[1];
    var _18 = (0, react_1.useState)(getToday()), dateTo = _18[0], setDateTo = _18[1];
    var dateFromRef = (0, react_1.useRef)(null);
    var dateToRef = (0, react_1.useRef)(null);
    var _19 = (0, react_1.useState)(1), guestCount = _19[0], setGuestCount = _19[1];
    var _20 = (0, react_1.useState)("cultural"), vibe = _20[0], setVibe = _20[1];
    var occupancyRows = (0, react_1.useMemo)(function () {
        if (!selectedStayUnit) {
            return existingBookings;
        }
        return existingBookings.filter(function (booking) {
            if (booking.stayUnitId) {
                return booking.stayUnitId === selectedStayUnit.id;
            }
            return primaryStayUnitId ? selectedStayUnit.id === primaryStayUnitId : true;
        });
    }, [existingBookings, primaryStayUnitId, selectedStayUnit]);
    var occupancy = (0, react_1.useMemo)(function () { return (0, host_stay_availability_1.buildHostStayOccupancy)(occupancyRows); }, [occupancyRows]);
    var selectedQuarter = (0, react_1.useMemo)(function () { var _a; return (_a = quarterOptions.find(function (quarter) { return quarter.id === selectedQuarterId; })) !== null && _a !== void 0 ? _a : null; }, [quarterOptions, selectedQuarterId]);
    var guestFitStayUnits = (0, react_1.useMemo)(function () {
        return activeStayUnits
            .filter(function (unit) { return unit.maxGuests >= guestCount; })
            .sort(function (left, right) { return left.maxGuests - right.maxGuests || left.priceFullday - right.priceFullday || left.sortOrder - right.sortOrder; });
    }, [activeStayUnits, guestCount]);
    var selectedRoomTooSmall = Boolean(selectedStayUnit && guestCount > selectedStayUnit.maxGuests);
    var earliestSelectableDate = (0, react_1.useMemo)(function () { return getToday(); }, []);
    var isFullDayBooking = (selectedQuarter === null || selectedQuarter === void 0 ? void 0 : selectedQuarter.id) === "fullday";
    var guestLimit = Math.max(1, (_j = (_h = selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.maxGuests) !== null && _h !== void 0 ? _h : home.maxGuests) !== null && _j !== void 0 ? _j : 1);
    var publicLocation = [home.village, home.city, home.state].filter(Boolean).join(", ");
    var bookingDays = isFullDayBooking ? enumerateDates(dateFrom, dateTo) : [dateFrom];
    var estimatedTotalPrice = selectedQuarter ? selectedQuarter.price * Math.max(1, bookingDays.length) : 0;
    var bookingDayLabel = isFullDayBooking
        ? "".concat(Math.max(1, bookingDays.length), " day").concat(Math.max(1, bookingDays.length) > 1 ? "s" : "")
        : "slot";
    var hostDisplayName = home.name.replace(/'s Home$/i, "").trim() || home.listingTitle || "Famlo host";
    var hostInitial = hostDisplayName.charAt(0).toUpperCase() || "F";
    var heroImages = (home.imageUrls.length > 0 ? home.imageUrls : [(_k = home.hostPhotoUrl) !== null && _k !== void 0 ? _k : ""]).filter(Boolean).slice(0, 3);
    var displayImages = heroImages.length >= 3 ? heroImages : Array.from({ length: 3 }, function (_, index) { var _a, _b; return (_b = (_a = heroImages[index]) !== null && _a !== void 0 ? _a : heroImages[0]) !== null && _b !== void 0 ? _b : ""; });
    var aboutParagraphs = [
        home.description ||
            "Tucked into a warm neighborhood, this Famlo stay is designed for guests who want comfort, local connection, and a calm place to reset between journeys.",
        home.culturalOffering ||
            home.neighborhoodDesc ||
            "Expect a deeply local rhythm here, with familiar food, everyday stories, and a stay that feels more human than transactional.",
    ];
    var experienceCards = [
        {
            title: "Genuine connections",
            body: "Meet real hosts, not faceless inventory. Every stay is shaped by the family and neighborhood around it.",
            icon: <lucide_react_1.Users size={20}/>,
        },
        {
            title: "Home-cooked nutrition",
            body: "Quarter stays can include familiar meals and a softer, more affordable rhythm than hotel bookings.",
            icon: <lucide_react_1.UtensilsCrossed size={20}/>,
        },
        {
            title: "Verified and safe",
            body: "Famlo keeps host identity, booking, and support flows inside the platform for safer travel.",
            icon: <lucide_react_1.ShieldCheck size={20}/>,
        },
        {
            title: "Truly affordable",
            body: "Choose the exact part of the day you need instead of paying for more time than your trip requires.",
            icon: <lucide_react_1.IndianRupee size={20}/>,
        },
    ];
    var amenityIconMap = new Map([
        ["wifi", function () { return <lucide_react_1.Wifi size={18}/>; }],
        ["air conditioning", function () { return <lucide_react_1.Snowflake size={18}/>; }],
        ["ac", function () { return <lucide_react_1.Snowflake size={18}/>; }],
        ["hot shower", function () { return <lucide_react_1.Bath size={18}/>; }],
        ["charging points", function () { return <lucide_react_1.Zap size={18}/>; }],
        ["secure room", function () { return <lucide_react_1.Lock size={18}/>; }],
        ["chai included", function () { return <lucide_react_1.Coffee size={18}/>; }],
        ["parking", function () { return <lucide_react_1.ParkingCircle size={18}/>; }],
        ["near metro", function () { return <lucide_react_1.MapPin size={18}/>; }],
        ["common tv", function () { return <lucide_react_1.Tv size={18}/>; }],
        ["fresh linen", function () { return <lucide_react_1.BedDouble size={18}/>; }],
        ["24 hr water", function () { return <lucide_react_1.Bath size={18}/>; }],
    ]);
    var amenityItems = (home.amenities.length > 0
        ? home.amenities
        : [
            "Wi-Fi",
            "Air conditioning",
            "Hot shower",
            "Charging points",
            "Secure room",
            "Chai included",
            "Fresh linen",
            "24 hr water",
            "Common TV",
            "Near metro",
            "Toiletries",
            "Parking",
        ]).slice(0, 12);
    var includedItems = home.includedItems.length > 0 ? home.includedItems : ["Breakfast", "Tea", "Snacks", "Fresh linen"];
    var houseRules = home.houseRules.length > 0
        ? home.houseRules
        : [
            "Please keep the stay calm and respectful after evening hours.",
            "Outside visitors are allowed only with host approval.",
            "Smoking should stay outside the room and shared indoor areas.",
            "Use water and electricity thoughtfully during your stay.",
            "Exact address and host details are shared only after confirmed booking.",
            "Famlo support is available if anything feels unclear or unsafe.",
        ];
    var stories = [
        ["Arjun M.", "Mumbai", "Hospitality", "The stay felt personal in the best way. I came tired and left feeling looked after."],
        ["Sneha R.", "Chennai", "Safety + food", "I booked for a short window and still felt fully settled. The food and warmth made the difference."],
        ["Kiran P.", "Bengaluru", "Great value", "Quarter booking was perfect for my travel schedule. I paid only for the time I really needed."],
    ];
    var setupRows = [
        { title: "Private bedroom", body: "Cozy sleeping space for your stay", icon: lucide_react_1.BedDouble, badge: "Private" },
        { title: home.bathroomType || "Bathroom access", body: "Comfortable and practical for short stays", icon: lucide_react_1.Bath, badge: "Shared" },
        { title: "Home kitchen", body: "Meals and refreshments are host-led", icon: lucide_react_1.UtensilsCrossed, badge: "Host-run" },
        { title: "Common living area", body: "Warm shared corners for rest and conversation", icon: lucide_react_1.Home, badge: "Shared" },
    ];
    var requiresHostApproval = Boolean(home.bookingRequiresHostApproval);
    var selectedRoomLabel = (_m = (_l = selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.name) !== null && _l !== void 0 ? _l : home.listingTitle) !== null && _m !== void 0 ? _m : home.name;
    (0, react_1.useEffect)(function () {
        var _a, _b, _c;
        void (0, host_interactions_1.recordHostInteractionEvent)({
            eventType: "booking_page_open",
            hostId: (_a = home.hostId) !== null && _a !== void 0 ? _a : null,
            legacyFamilyId: (_b = home.legacyFamilyId) !== null && _b !== void 0 ? _b : null,
            pagePath: typeof window !== "undefined" ? window.location.pathname : null,
            metadata: {
                homeId: home.id,
                listingName: (_c = home.listingTitle) !== null && _c !== void 0 ? _c : home.name,
            },
        });
    }, [home.hostId, home.id, home.legacyFamilyId, home.listingTitle, home.name]);
    function formatDisplayDate(value) {
        if (!value)
            return "Select date";
        try {
            return new Date("".concat(value, "T00:00:00")).toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
            });
        }
        catch (_a) {
            return value;
        }
    }
    function openDatePicker(ref) {
        var _a, _b;
        var input = ref.current;
        if (input && "showPicker" in input) {
            (_b = (_a = input).showPicker) === null || _b === void 0 ? void 0 : _b.call(_a);
        }
        else {
            input === null || input === void 0 ? void 0 : input.click();
        }
    }
    function renderWidget(showInline) {
        var _this = this;
        var _a, _b, _c, _d, _e;
        if (showInline === void 0) { showInline = false; }
        return (<div className={"famlo-booking-widget ".concat(showInline ? "famlo-booking-widget-inline" : "")} ref={showInline ? inlineWidgetRef : undefined}>
        {isAuthStateLoading ? (<div className="famlo-state-card">
            <h3>Loading booking state</h3>
            <p>Checking your Famlo account and booking access.</p>
          </div>) : null}

        {!isAuthStateLoading && step === "login" ? (<div className="famlo-state-card">
            <h3>Sign in to continue</h3>
            <p>Use the same Famlo login flow. Your booking, payment, and messages will stay connected.</p>
            {authError ? <div className="auth-error">{authError}</div> : null}
            <button className="famlo-cta-button" onClick={function () {
                    setAuthError(null);
                    setShowAuthModal(true);
                }} type="button">
              Get it now
            </button>
          </div>) : null}

        {!isAuthStateLoading && step === "profile" ? (<div className="famlo-state-card">
            <h3>Complete your profile</h3>
            <p>
              Add your name, contact details, location, gender, date of birth, and about section once. Then you can continue with booking.
            </p>
            <ProfileCompletionForm_1.ProfileCompletionForm compact title="Complete guest profile" description="Save your guest details here. The host will receive them with your booking request." buttonLabel="Save profile" onSuccess={function () { return __awaiter(_this, void 0, void 0, function () {
                    var nextState;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, syncAuthState()];
                            case 1:
                                nextState = _a.sent();
                                if (nextState.userId && nextState.profileComplete) {
                                    setBookingError(null);
                                    setStep(resumeStepRef.current);
                                }
                                return [2 /*return*/];
                        }
                    });
                }); }}/>
          </div>) : null}

        {!isAuthStateLoading && profileComplete ? (<div className="booking-widget-shell famlo-booking-shell">
            <div className="famlo-widget-head">
              <span className="famlo-section-label">Choose your visit</span>
              <h2>Select a slot, date, and number of guests</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <span className="famlo-setup-badge">
                  {activeStayUnitCount > 0 ? "".concat(activeStayUnitCount, " active room").concat(activeStayUnitCount === 1 ? "" : "s") : "".concat(stayUnits.length, " room").concat(stayUnits.length === 1 ? "" : "s", " inactive")}
                </span>
                <span className="famlo-setup-badge">
                  {stayUnits.length > 0 ? "".concat(stayUnits.length, " total room").concat(stayUnits.length === 1 ? "" : "s") : "No room cards yet"}
                </span>
              </div>
            </div>
            {hasClosedRooms ? (<div className="famlo-state-card" style={{ marginBottom: 16, borderColor: "rgba(220, 38, 38, 0.2)", background: "linear-gradient(180deg, #fff1f2, #fff7ed)" }}>
                <h3>Rooms are closed right now</h3>
                <p>
                  The host has temporarily closed every room on this listing. Public room cards disappear while closed, and booking will return when at least one room is reopened.
                </p>
              </div>) : (<>
            {requiresHostApproval ? (<div className="famlo-state-card" style={{ marginBottom: 16, borderColor: "rgba(234, 179, 8, 0.35)", background: "linear-gradient(180deg, #fffbeb, #fff7ed)" }}>
                <h3>Host approval required</h3>
                <p>
                  This stay may be confirmed after the host reviews your booking request. Payment still stays inside Famlo, and the host will be notified immediately.
                </p>
              </div>) : null}

            {step === "quarter" ? (quarterOptions.length > 0 ? (<div className="famlo-slot-list">
                  {quarterOptions.map(function (quarter) { return (<button className={"famlo-slot-card ".concat(selectedQuarterId === quarter.id ? "is-selected" : "")} key={quarter.id} onClick={function () { return setSelectedQuarterId(quarter.id); }} type="button">
                      <span className="famlo-slot-icon">{quarter.icon}</span>
                      <span className="famlo-slot-copy">
                        <strong>{quarter.label}</strong>
                        <small>{quarter.time}</small>
                        <em>{quarter.meal}</em>
                      </span>
                      <span className="famlo-slot-price">Rs. {quarter.price.toLocaleString("en-IN")}</span>
                    </button>); })}
                </div>) : (<p>No active room pricing is available for this Home right now.</p>)) : null}

            {step === "date" ? (<div className="famlo-widget-fields">
                <label className="famlo-picker-field">
                  <span>Visit date</span>
                  <input ref={dateFromRef} className="text-input" min={earliestSelectableDate} onChange={function (event) { return setDateFrom(event.target.value); }} type="date" value={dateFrom} style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}/>
                  <button className="famlo-picker-button" onClick={function () { return openDatePicker(dateFromRef); }} type="button">
                    <lucide_react_1.CalendarDays size={18}/>
                    <span>{formatDisplayDate(dateFrom)}</span>
                    <lucide_react_1.ChevronDown size={16}/>
                  </button>
                </label>
                {dateFrom ? (<p style={{ margin: "-8px 0 0", fontSize: 12, fontWeight: 700, color: isUnavailableDate(dateFrom) ? "#b91c1c" : "#166534" }}>
                    {isUnavailableDate(dateFrom)
                                ? "This date is already booked for the selected slot."
                                : "This date is open for the selected slot."}
                  </p>) : null}

                {isFullDayBooking ? (<label className="famlo-picker-field">
                    <span>Until</span>
                    <input ref={dateToRef} className="text-input" min={dateFrom} onChange={function (event) { return setDateTo(event.target.value); }} type="date" value={dateTo} style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}/>
                    <button className="famlo-picker-button" onClick={function () { return openDatePicker(dateToRef); }} type="button">
                      <lucide_react_1.CalendarDays size={18}/>
                      <span>{formatDisplayDate(dateTo)}</span>
                      <lucide_react_1.ChevronDown size={16}/>
                    </button>
                  </label>) : null}
              </div>) : null}

            {step === "guests" ? (<div className="famlo-widget-fields">
                <div className="famlo-counter-field">
                  <span>Guests</span>
                  <div className="famlo-counter-controls">
                    <button onClick={function () { return setGuestCount(function (value) { return Math.max(1, value - 1); }); }} type="button">
                      <lucide_react_1.Minus size={16}/>
                    </button>
                    <strong>{guestCount}</strong>
                    <button onClick={function () { return setGuestCount(function (value) { return Math.min(guestLimit, value + 1); }); }} type="button">
                      <lucide_react_1.Plus size={16}/>
                    </button>
                  </div>
                </div>
                <label className="famlo-picker-field">
                  <span>Stay vibe</span>
                  <select className="famlo-select-field" onChange={function (event) { return setVibe(event.target.value); }} value={vibe}>
                    <option value="cultural">Cultural</option>
                    <option value="quiet">Quiet</option>
                  </select>
                </label>
              </div>) : null}

            {step === "confirm" ? (<div className="booking-summary famlo-booking-summary">
                <div className="booking-summary-row"><span>Staying with</span><strong>{(_a = home.listingTitle) !== null && _a !== void 0 ? _a : home.name}</strong></div>
                <div className="booking-summary-row"><span>Room</span><strong>{selectedRoomLabel}</strong></div>
                <div className="booking-summary-row"><span>Slot</span><strong>{selectedQuarter ? "".concat(selectedQuarter.label, " \u00B7 ").concat(selectedQuarter.time) : "Choose a booking slot"}</strong></div>
                <div className="booking-summary-row"><span>Date</span><strong>{isFullDayBooking ? "".concat(dateFrom, " to ").concat(dateTo) : dateFrom}</strong></div>
                <div className="booking-summary-row"><span>Guests</span><strong>{guestCount}</strong></div>
                <div className="booking-summary-row"><span>Coupon</span><strong>{(_b = quote === null || quote === void 0 ? void 0 : quote.couponCode) !== null && _b !== void 0 ? _b : (couponCode.trim() || "None")}</strong></div>
                {quote ? (<>
                    <div className="booking-summary-row"><span>Room amount</span><strong>Rs. {quote.subtotal.toLocaleString("en-IN")}</strong></div>
                    {quote.discountAmount > 0 ? (<div className="booking-summary-row"><span>Discount</span><strong>- Rs. {quote.discountAmount.toLocaleString("en-IN")}</strong></div>) : null}
                    <div className="booking-summary-row"><span>GST and taxes</span><strong>Rs. {quote.taxAmount.toLocaleString("en-IN")}</strong></div>
                  </>) : null}
                <label className="famlo-picker-field">
                  <span>Coupon code</span>
                  <input className="famlo-select-field" onChange={function (event) { return setCouponCode(event.target.value.toUpperCase()); }} placeholder="Optional coupon" value={couponCode}/>
                </label>
                {successMessage ? <div className="panel auth-pill">{successMessage}</div> : null}
              </div>) : null}

            {bookingError ? <div className="auth-error">{bookingError}</div> : null}

            <div className="famlo-widget-footer">
              <div>
                <small>{isFullDayBooking ? "Total for ".concat(bookingDayLabel) : "Total for booking"}</small>
                <strong>Rs. {((_c = quote === null || quote === void 0 ? void 0 : quote.totalPrice) !== null && _c !== void 0 ? _c : estimatedTotalPrice).toLocaleString("en-IN")}</strong>
              </div>
              <span>{quoteLoading ? "Updating..." : quote ? "GST included" : "Taxes calculated at checkout"}</span>
            </div>

            {step !== "confirm" ? (<div className="detail-actions famlo-widget-actions">
                {step !== "quarter" ? (<button className="button-like secondary" onClick={goBack} type="button">Back</button>) : null}
                <button className="famlo-cta-button" onClick={goNext} type="button">Get it now</button>
              </div>) : (<div className="detail-actions famlo-widget-actions">
                {!successMessage ? (<button className="button-like secondary" onClick={goBack} type="button">Back</button>) : null}
                <button className="famlo-cta-button" disabled={submitting || Boolean(successMessage)} onClick={function () { return void handleBooking(); }} type="button">
                  {submitting ? "Booking..." : successMessage ? "Booking confirmed" : "Get it now"}
                </button>
              </div>)}

            <div className="famlo-certified-line">
              <span className="famlo-certified-dot"/>
              <span>Famlo certified home</span>
            </div>

            {bookingReceipt ? (<div className="panel booking-confirmation-card">
                <div className="booking-confirmation-head">
                  <span className="eyebrow">What happens next</span>
                  <strong>{requiresHostApproval ? "Your host has been notified." : "Your booking is confirmed."}</strong>
                </div>
                <ul className="booking-confirmation-list">
                  <li>Your booking reference is <strong>{bookingReceipt.bookingId}</strong>.</li>
                  {bookingReceipt.paymentId ? <li>Your payment reference is <strong>{bookingReceipt.paymentId}</strong>.</li> : null}
                  {requiresHostApproval ? (<li>
                      We have notified <strong>{(_e = (_d = home.hostName) !== null && _d !== void 0 ? _d : home.listingTitle) !== null && _e !== void 0 ? _e : home.name}</strong> about you. They will approve soon as possible, and you can track updates in My Bookings.
                    </li>) : (<li>
                      Check it out on the booking page and then open My Bookings for the full stay details.
                    </li>)}
                </ul>
                <div className="detail-actions">
                  <link_1.default className="button-like secondary" href={"/bookings?bookingId=".concat(encodeURIComponent(bookingReceipt.bookingId))} target="_blank" rel="noreferrer">
                    Check booking page
                  </link_1.default>
                  <link_1.default className="button-like" href="/bookings">
                    My Bookings
                  </link_1.default>
                </div>
              </div>) : null}
            </>)}
          </div>) : null}
      </div>);
    }
    function resolveNextStep(userId, nextProfileComplete) {
        if (!userId) {
            return "login";
        }
        if (!nextProfileComplete) {
            return "profile";
        }
        return "quarter";
    }
    function isUnavailableDate(dateStr) {
        if (!dateStr) {
            return false;
        }
        if (effectiveBlockedDates.includes(dateStr) || effectiveBlockedDates.includes(slotToken(dateStr, "fullday"))) {
            return true;
        }
        if (!selectedQuarter) {
            return false;
        }
        if (compareDateStrings(dateStr, (0, booking_time_1.getTodayInIndia)()) < 0) {
            return true;
        }
        if (effectiveBlockedDates.includes(slotToken(dateStr, selectedQuarter.id))) {
            return true;
        }
        var dayOccupancy = occupancy[dateStr];
        if (!dayOccupancy) {
            return false;
        }
        return dayOccupancy.anyBooking;
    }
    var syncAuthState = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var user, userRow, nextProfileComplete, error_1;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    setLoadingAuth(true);
                    setAuthReady(false);
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, supabase.auth.getUser()];
                case 2:
                    user = (_d.sent()).data.user;
                    if (!user) {
                        setCurrentUserId(null);
                        setCurrentUserEmail(null);
                        setGuestName(null);
                        setGuestCity(null);
                        setProfileComplete(false);
                        setStep("login");
                        return [2 /*return*/, { userId: null, profileComplete: false }];
                    }
                    return [4 /*yield*/, supabase
                            .from("users")
                            .select("name, phone, email, city, state, about, date_of_birth, gender")
                            .eq("id", user.id)
                            .maybeSingle()];
                case 3:
                    userRow = (_d.sent()).data;
                    nextProfileComplete = (0, user_profile_1.isGuestProfileComplete)({
                        id: user.id,
                        name: typeof (userRow === null || userRow === void 0 ? void 0 : userRow.name) === "string" ? userRow.name : null,
                        phone: typeof (userRow === null || userRow === void 0 ? void 0 : userRow.phone) === "string" ? userRow.phone : (_a = user.phone) !== null && _a !== void 0 ? _a : null,
                        email: typeof (userRow === null || userRow === void 0 ? void 0 : userRow.email) === "string" ? userRow.email : (_b = user.email) !== null && _b !== void 0 ? _b : null,
                        city: typeof (userRow === null || userRow === void 0 ? void 0 : userRow.city) === "string" ? userRow.city : null,
                        state: typeof (userRow === null || userRow === void 0 ? void 0 : userRow.state) === "string" ? userRow.state : null,
                        onboarding_completed: false,
                        avatar_url: null,
                        about: typeof (userRow === null || userRow === void 0 ? void 0 : userRow.about) === "string" ? userRow.about : null,
                        date_of_birth: typeof (userRow === null || userRow === void 0 ? void 0 : userRow.date_of_birth) === "string" ? userRow.date_of_birth : null,
                        gender: typeof (userRow === null || userRow === void 0 ? void 0 : userRow.gender) === "string" ? userRow.gender : null,
                        kyc_status: null,
                        id_document_url: null,
                        id_document_type: null,
                    });
                    setCurrentUserId(user.id);
                    setCurrentUserEmail((_c = user.email) !== null && _c !== void 0 ? _c : null);
                    setGuestName(typeof (userRow === null || userRow === void 0 ? void 0 : userRow.name) === "string" ? userRow.name : null);
                    setGuestCity(typeof (userRow === null || userRow === void 0 ? void 0 : userRow.city) === "string" ? userRow.city : null);
                    setProfileComplete(nextProfileComplete);
                    setStep(resolveNextStep(user.id, nextProfileComplete));
                    return [2 /*return*/, { userId: user.id, profileComplete: nextProfileComplete }];
                case 4:
                    error_1 = _d.sent();
                    console.error("[booking.flow] failed to sync auth state", error_1);
                    setCurrentUserId(null);
                    setCurrentUserEmail(null);
                    setGuestName(null);
                    setGuestCity(null);
                    setProfileComplete(false);
                    setStep("login");
                    return [2 /*return*/, { userId: null, profileComplete: false }];
                case 5:
                    setSessionChecked(true);
                    setAuthReady(true);
                    setLoadingAuth(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); }, [supabase]);
    (0, react_1.useEffect)(function () {
        void syncAuthState();
        var subscription = supabase.auth.onAuthStateChange(function () {
            void syncAuthState();
        }).data.subscription;
        return function () {
            subscription === null || subscription === void 0 ? void 0 : subscription.unsubscribe();
        };
    }, [supabase, syncAuthState]);
    (0, react_1.useEffect)(function () {
        if (!selectedQuarterId && quarterOptions[0]) {
            setSelectedQuarterId(quarterOptions[0].id);
        }
    }, [quarterOptions, selectedQuarterId]);
    (0, react_1.useEffect)(function () {
        setGuestCount(function (value) { return Math.max(1, Math.min(value, guestLimit)); });
    }, [guestLimit]);
    (0, react_1.useEffect)(function () {
        if (dateFrom < earliestSelectableDate) {
            setDateFrom(earliestSelectableDate);
            if (!isFullDayBooking) {
                setDateTo(earliestSelectableDate);
            }
        }
    }, [dateFrom, earliestSelectableDate, isFullDayBooking]);
    (0, react_1.useEffect)(function () {
        var requestedQuarter = searchParams.get("quarter");
        var requestedDate = searchParams.get("date");
        var requestedDateTo = searchParams.get("date_to");
        var requestedGuests = Number(searchParams.get("guests"));
        if (requestedQuarter && quarterOptions.some(function (quarter) { return quarter.id === requestedQuarter; })) {
            setSelectedQuarterId(requestedQuarter);
        }
        if (requestedDate) {
            setDateFrom(requestedDate);
            setDateTo(requestedDateTo || requestedDate);
        }
        if (Number.isFinite(requestedGuests) && requestedGuests > 0) {
            setGuestCount(Math.min(Math.max(1, requestedGuests), guestLimit));
        }
    }, [guestLimit, quarterOptions, searchParams]);
    (0, react_1.useEffect)(function () {
        if (!sessionChecked || !authReady || loadingAuth || requestedStep !== "confirm" || requestedEntry !== "listing") {
            return;
        }
        if (!currentUserId) {
            setStep("login");
            return;
        }
        if (!profileComplete) {
            setStep("profile");
            return;
        }
        if (selectedQuarter && dateFrom) {
            setStep("confirm");
        }
    }, [authReady, currentUserId, dateFrom, loadingAuth, profileComplete, requestedEntry, requestedStep, selectedQuarter, sessionChecked]);
    (0, react_1.useEffect)(function () {
        if (step !== "login" && step !== "profile") {
            resumeStepRef.current = step;
        }
    }, [step]);
    (0, react_1.useEffect)(function () {
        if (!sessionChecked || !authReady || hasClosedRooms || !currentUserId || !selectedQuarter || !dateFrom) {
            setQuote(null);
            return;
        }
        var cancelled = false;
        function loadQuote() {
            return __awaiter(this, void 0, void 0, function () {
                var response, _a, _b, _c, data, _d;
                var _e;
                var _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
                return __generator(this, function (_s) {
                    switch (_s.label) {
                        case 0:
                            if (!selectedQuarter) {
                                setQuote(null);
                                setQuoteLoading(false);
                                return [2 /*return*/];
                            }
                            setQuoteLoading(true);
                            _s.label = 1;
                        case 1:
                            _s.trys.push([1, 5, 6, 7]);
                            _a = fetch;
                            _b = ["/api/bookings/quote"];
                            _e = {
                                method: "POST"
                            };
                            _c = [{ "Content-Type": "application/json" }];
                            return [4 /*yield*/, getAuthHeaders()];
                        case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_e.headers = __assign.apply(void 0, _c.concat([(_s.sent())])),
                                    _e.body = JSON.stringify({
                                        bookingType: "host_stay",
                                        userId: currentUserId,
                                        hostId: (_f = home.hostId) !== null && _f !== void 0 ? _f : home.id,
                                        legacyFamilyId: home.legacyFamilyId,
                                        stayUnitId: (_g = selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.id) !== null && _g !== void 0 ? _g : null,
                                        quarterType: selectedQuarter.id,
                                        quarterTime: selectedQuarter.time,
                                        startDate: dateFrom,
                                        endDate: isFullDayBooking ? dateTo : dateFrom,
                                        guestsCount: guestCount,
                                        unitPrice: selectedQuarter.price,
                                        commissionPct: home.platformCommissionPct,
                                        couponCode: couponCode.trim() || null,
                                    }),
                                    _e)]))];
                        case 3:
                            response = _s.sent();
                            return [4 /*yield*/, response.json()];
                        case 4:
                            data = _s.sent();
                            if (!response.ok || data.error) {
                                throw new Error((_h = data.error) !== null && _h !== void 0 ? _h : "Failed to calculate total.");
                            }
                            if (!cancelled) {
                                setQuote({
                                    subtotal: (_j = data.subtotal) !== null && _j !== void 0 ? _j : 0,
                                    discountAmount: (_k = data.discountAmount) !== null && _k !== void 0 ? _k : 0,
                                    taxAmount: (_l = data.taxAmount) !== null && _l !== void 0 ? _l : 0,
                                    totalPrice: (_m = data.totalPrice) !== null && _m !== void 0 ? _m : 0,
                                    partnerPayoutAmount: (_o = data.partnerPayoutAmount) !== null && _o !== void 0 ? _o : 0,
                                    platformFee: (_p = data.platformFee) !== null && _p !== void 0 ? _p : 0,
                                    couponCode: (_r = (_q = data.appliedCoupon) === null || _q === void 0 ? void 0 : _q.code) !== null && _r !== void 0 ? _r : null,
                                });
                            }
                            return [3 /*break*/, 7];
                        case 5:
                            _d = _s.sent();
                            if (!cancelled) {
                                setQuote(null);
                            }
                            return [3 /*break*/, 7];
                        case 6:
                            if (!cancelled) {
                                setQuoteLoading(false);
                            }
                            return [7 /*endfinally*/];
                        case 7: return [2 /*return*/];
                    }
                });
            });
        }
        void loadQuote();
        return function () {
            cancelled = true;
        };
    }, [
        authReady,
        couponCode,
        currentUserId,
        dateFrom,
        dateTo,
        guestCount,
        getAuthHeaders,
        hasClosedRooms,
        home.hostId,
        home.id,
        home.legacyFamilyId,
        home.platformCommissionPct,
        isFullDayBooking,
        sessionChecked,
        selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.id,
        selectedQuarter,
    ]);
    function goNext() {
        setBookingError(null);
        if (hasClosedRooms) {
            setBookingError("This home currently has no open rooms.");
            return;
        }
        if (step === "quarter") {
            if (!selectedQuarter) {
                setBookingError("No bookable quarter is available for this Home right now.");
                return;
            }
            setStep("date");
            return;
        }
        if (step === "date") {
            if (!dateFrom) {
                setBookingError("Choose a visit date first.");
                return;
            }
            if (isFullDayBooking && dateTo < dateFrom) {
                setBookingError("End date must be on or after the start date.");
                return;
            }
            if (bookingDays.some(function (date) { return isUnavailableDate(date); })) {
                setBookingError("One or more selected dates are unavailable or the booking time has already passed.");
                return;
            }
            setStep("guests");
            return;
        }
        if (step === "guests") {
            setStep("confirm");
        }
    }
    function goBack() {
        setBookingError(null);
        if (step === "date") {
            setStep("quarter");
            return;
        }
        if (step === "guests") {
            setStep("date");
            return;
        }
        if (step === "confirm") {
            setStep("guests");
        }
    }
    function handleBooking() {
        return __awaiter(this, void 0, void 0, function () {
            var dateToValue, welcomeMessage, response, _a, _b, _c, payload_1, paymentMessage, paymentIntentPayload, order_1, RazorpayCheckout, checkout, error_2;
            var _d;
            var _this = this;
            var _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
            return __generator(this, function (_r) {
                switch (_r.label) {
                    case 0:
                        if (hasClosedRooms || !currentUserId || !selectedQuarter || !dateFrom) {
                            return [2 /*return*/];
                        }
                        if (!home.isActive || !home.isAccepting) {
                            setBookingError("This Home listing is not accepting bookings right now.");
                            return [2 /*return*/];
                        }
                        if (!profileComplete) {
                            setBookingError("Complete your guest profile once, then you can continue to payment and booking.");
                            return [2 /*return*/];
                        }
                        if (guestCount > guestLimit) {
                            setBookingError("This room currently allows up to ".concat(guestLimit, " guests."));
                            return [2 /*return*/];
                        }
                        if (bookingDays.some(function (date) { return isUnavailableDate(date); })) {
                            setBookingError("One or more selected dates are unavailable or the booking time has already passed.");
                            return [2 /*return*/];
                        }
                        setSubmitting(true);
                        setBookingError(null);
                        dateToValue = isFullDayBooking ? dateTo : dateFrom;
                        _r.label = 1;
                    case 1:
                        _r.trys.push([1, 9, 10, 11]);
                        welcomeMessage = "Hi ".concat(guestName !== null && guestName !== void 0 ? guestName : "guest", ",\n\nWelcome to the Famlo family.\n\nYou are about to experience the real ").concat((_e = home.city) !== null && _e !== void 0 ? _e : "India", ". We are thrilled to host your journey.\n\nYour stay details:\nHost area: ").concat(publicLocation || "Shared after booking", "\nProperty: ").concat((_f = home.listingTitle) !== null && _f !== void 0 ? _f : home.name, "\nMap pin: ").concat(home.googleMapsLink || "Shared securely inside Famlo after confirmation", "\n\nSafety first:\n- Keep all payments and communication on Famlo\n- Please avoid sharing personal contact details in chat\n- Famlo may monitor chats for fraud prevention and safety\n\nNeed help during your stay? Use the Famlo assistance path from your booking thread. If it is urgent, open the emergency support option in your booking dashboard and our team can help right away.");
                        _a = fetch;
                        _b = ["/api/bookings/create"];
                        _d = {
                            method: "POST"
                        };
                        _c = [{ "Content-Type": "application/json" }];
                        return [4 /*yield*/, getAuthHeaders()];
                    case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_d.headers = __assign.apply(void 0, _c.concat([(_r.sent())])),
                                _d.body = JSON.stringify({
                                    bookingType: "host_stay",
                                    userId: currentUserId,
                                    hostId: (_g = home.hostId) !== null && _g !== void 0 ? _g : null,
                                    legacyFamilyId: home.legacyFamilyId,
                                    stayUnitId: (_h = selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.id) !== null && _h !== void 0 ? _h : null,
                                    quarterType: selectedQuarter.id,
                                    quarterTime: selectedQuarter.time,
                                    startDate: dateFrom,
                                    endDate: dateToValue,
                                    guestsCount: guestCount,
                                    unitPrice: selectedQuarter.price,
                                    commissionPct: home.platformCommissionPct,
                                    couponCode: couponCode.trim() || null,
                                    vibe: vibe,
                                    guestName: guestName,
                                    guestCity: guestCity,
                                    listingName: (_j = home.listingTitle) !== null && _j !== void 0 ? _j : home.name,
                                    hostArea: publicLocation || "Shared after booking",
                                    hostUserId: home.hostUserId,
                                    welcomeMessage: welcomeMessage,
                                    requestPaymentIntent: true,
                                    gateway: "razorpay",
                                }),
                                _d)]))];
                    case 3:
                        response = _r.sent();
                        return [4 /*yield*/, response.json()];
                    case 4:
                        payload_1 = _r.sent();
                        if (!response.ok || payload_1.error) {
                            throw new Error((_k = payload_1.error) !== null && _k !== void 0 ? _k : "Could not create booking.");
                        }
                        void (0, host_interactions_1.recordHostInteractionEvent)({
                            eventType: "booking_request",
                            hostId: (_l = home.hostId) !== null && _l !== void 0 ? _l : null,
                            legacyFamilyId: (_m = home.legacyFamilyId) !== null && _m !== void 0 ? _m : null,
                            pagePath: typeof window !== "undefined" ? window.location.pathname : null,
                            metadata: {
                                bookingId: typeof payload_1.bookingId === "string" ? payload_1.bookingId : null,
                                listingName: (_o = home.listingTitle) !== null && _o !== void 0 ? _o : home.name,
                                stayUnitId: (_p = selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.id) !== null && _p !== void 0 ? _p : null,
                                roomName: selectedRoomLabel,
                                guestCount: guestCount,
                                quarterType: selectedQuarter.id,
                            },
                        });
                        paymentMessage = "Your ".concat(selectedQuarter.label.toLowerCase(), " stay with ").concat(home.name, " is now created in the new Famlo booking system.");
                        if (!payload_1.bookingId) return [3 /*break*/, 8];
                        paymentIntentPayload = payload_1.paymentIntent;
                        if (!!paymentIntentPayload) return [3 /*break*/, 5];
                        paymentMessage =
                            "Your ".concat(selectedQuarter.label.toLowerCase(), " stay with ").concat(home.name, " is saved in Famlo, but payment setup needs one more retry. You can complete it from your bookings dashboard.");
                        return [3 /*break*/, 8];
                    case 5:
                        if (!(paymentIntentPayload.integrationStatus === "razorpay_ready" && paymentIntentPayload.order)) return [3 /*break*/, 7];
                        return [4 /*yield*/, ensureRazorpayCheckout()];
                    case 6:
                        _r.sent();
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
                            description: "Booking for ".concat((_q = home.listingTitle) !== null && _q !== void 0 ? _q : home.name),
                            order_id: order_1.orderId,
                            prefill: {
                                name: guestName !== null && guestName !== void 0 ? guestName : undefined,
                                email: currentUserEmail !== null && currentUserEmail !== void 0 ? currentUserEmail : undefined,
                            },
                            notes: {
                                booking_id: order_1.bookingId,
                                payment_row_id: order_1.paymentRowId,
                            },
                            handler: function (paymentResponse) {
                                void (function () { return __awaiter(_this, void 0, void 0, function () {
                                    var verifyResponse, verifyPayload, bookingPageUrl, bookingTab, hostLabel, verifyError_1;
                                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                                    return __generator(this, function (_l) {
                                        switch (_l.label) {
                                            case 0:
                                                _l.trys.push([0, 3, , 4]);
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
                                                verifyResponse = _l.sent();
                                                return [4 /*yield*/, verifyResponse.json()];
                                            case 2:
                                                verifyPayload = _l.sent();
                                                if (!verifyResponse.ok || verifyPayload.error) {
                                                    throw new Error((_a = verifyPayload.error) !== null && _a !== void 0 ? _a : "Payment verification failed.");
                                                }
                                                void (0, host_interactions_1.recordHostInteractionEvent)({
                                                    eventType: "booking_confirmed",
                                                    hostId: (_b = home.hostId) !== null && _b !== void 0 ? _b : null,
                                                    legacyFamilyId: (_c = home.legacyFamilyId) !== null && _c !== void 0 ? _c : null,
                                                    pagePath: typeof window !== "undefined" ? window.location.pathname : null,
                                                    metadata: {
                                                        bookingId: order_1.bookingId,
                                                        paymentRowId: order_1.paymentRowId,
                                                        stayUnitId: (_d = selectedStayUnit === null || selectedStayUnit === void 0 ? void 0 : selectedStayUnit.id) !== null && _d !== void 0 ? _d : null,
                                                        roomName: selectedRoomLabel,
                                                        quarterType: selectedQuarter.id,
                                                    },
                                                });
                                                bookingPageUrl = "/bookings?bookingId=".concat(encodeURIComponent(order_1.bookingId));
                                                bookingTab = window.open(bookingPageUrl, "_blank", "noopener,noreferrer");
                                                if (!bookingTab) {
                                                    window.location.href = bookingPageUrl;
                                                }
                                                hostLabel = (_f = (_e = home.hostName) !== null && _e !== void 0 ? _e : home.listingTitle) !== null && _f !== void 0 ? _f : home.name;
                                                setBookingReceipt({
                                                    bookingId: order_1.bookingId,
                                                    conversationId: (_g = payload_1.conversationId) !== null && _g !== void 0 ? _g : null,
                                                    paymentId: order_1.paymentRowId,
                                                    hostArea: publicLocation || "Shared after booking",
                                                    listingName: (_h = home.listingTitle) !== null && _h !== void 0 ? _h : home.name,
                                                    quarterLabel: selectedQuarter.label,
                                                    quarterTime: selectedQuarter.time,
                                                    visitDateLabel: isFullDayBooking ? "".concat(dateFrom, " to ").concat(dateToValue) : dateFrom,
                                                    guestsLabel: "".concat(guestCount, " guest").concat(guestCount > 1 ? "s" : ""),
                                                    totalLabel: "Rs. ".concat(Number((_k = (_j = payload_1.totalPrice) !== null && _j !== void 0 ? _j : quote === null || quote === void 0 ? void 0 : quote.totalPrice) !== null && _k !== void 0 ? _k : estimatedTotalPrice).toLocaleString("en-IN"))
                                                });
                                                setSuccessMessage(requiresHostApproval
                                                    ? "We have notified ".concat(hostLabel, " about you. They will approve soon as possible, and you can see the update in My Bookings.")
                                                    : "Your booking is confirmed. Check it out on the booking page, then open My Bookings for the full details.");
                                                return [3 /*break*/, 4];
                                            case 3:
                                                verifyError_1 = _l.sent();
                                                setBookingError(verifyError_1 instanceof Error ? verifyError_1.message : "Payment verification failed.");
                                                return [3 /*break*/, 4];
                                            case 4: return [2 /*return*/];
                                        }
                                    });
                                }); })();
                            },
                            modal: {
                                ondismiss: function () {
                                    void releasePendingBooking(order_1.bookingId).catch(function (cancelError) {
                                        console.error("[home-booking-flow] release_pending_booking_failed", cancelError);
                                    });
                                    setBookingReceipt(null);
                                    setSuccessMessage("Payment was not completed, so this stay was not booked. You can try again whenever you're ready.");
                                },
                            },
                            theme: {
                                color: "#165dcc",
                            },
                        });
                        checkout.on("payment.failed", function (failureResponse) {
                            var _a, _b, _c, _d;
                            void releasePendingBooking(order_1.bookingId).catch(function (cancelError) {
                                console.error("[home-booking-flow] release_pending_booking_failed", cancelError);
                            });
                            setBookingReceipt(null);
                            setBookingError((_d = (_b = (_a = failureResponse.error) === null || _a === void 0 ? void 0 : _a.description) !== null && _b !== void 0 ? _b : (_c = failureResponse.error) === null || _c === void 0 ? void 0 : _c.reason) !== null && _d !== void 0 ? _d : "Payment failed, so the booking was not saved.");
                        });
                        checkout.open();
                        paymentMessage = "Complete payment in the Razorpay window to confirm your ".concat(selectedQuarter.label.toLowerCase(), " stay with ").concat(home.name, ".");
                        return [3 /*break*/, 8];
                    case 7:
                        paymentMessage =
                            "Your booking is created and the payment record is ready, but live Razorpay keys are not configured yet.";
                        _r.label = 8;
                    case 8:
                        setSuccessMessage(paymentMessage);
                        setStep("confirm");
                        return [3 /*break*/, 11];
                    case 9:
                        error_2 = _r.sent();
                        setBookingError(error_2 instanceof Error ? error_2.message : "Booking failed.");
                        return [3 /*break*/, 11];
                    case 10:
                        setSubmitting(false);
                        return [7 /*endfinally*/];
                    case 11: return [2 /*return*/];
                }
            });
        });
    }
    return (<section className="famlo-booking-page">
      <nav className="famlo-booking-nav">
        <div className="famlo-booking-nav-side">
          <link_1.default href={home.href} className="famlo-nav-link">
            <span>←</span>
            <span>Back</span>
          </link_1.default>
        </div>
        <div className="famlo-booking-logo" aria-label="Famlo">
          <span>fam</span><span>lo</span>
        </div>
        <div className="famlo-booking-nav-side famlo-booking-nav-actions">
          <button className="famlo-nav-icon" onClick={function () { return setSaved(function (value) { return !value; }); }} type="button">
            <lucide_react_1.Heart size={16} fill={saved ? "#E53E3E" : "none"}/>
            <span>Save</span>
          </button>
          <button className="famlo-nav-icon" type="button">
            <lucide_react_1.Share2 size={16}/>
            <span>Share</span>
          </button>
        </div>
      </nav>

      <div className="famlo-booking-hero">
        <div className="famlo-hero-main">
          {displayImages[0] ? (<image_1.default src={displayImages[0]} alt={(_o = home.listingTitle) !== null && _o !== void 0 ? _o : home.name} width={1600} height={1000} sizes="(max-width: 768px) 100vw, 70vw"/>) : <div className="booking-hero-fallback"/>}
          <div className="famlo-hero-overlay">
            <span>Living room</span>
            <button type="button">View all photos</button>
          </div>
        </div>
        <div className="famlo-hero-side">
          {displayImages.slice(1, 3).map(function (image, index) {
            var _a;
            return (<div className="famlo-hero-side-card" key={"".concat(image, "-").concat(index)}>
              {image ? (<image_1.default src={image} alt={"".concat((_a = home.listingTitle) !== null && _a !== void 0 ? _a : home.name, " ").concat(index + 2)} width={900} height={600} sizes="(max-width: 768px) 100vw, 30vw"/>) : <div className="booking-hero-fallback"/>}
              <span>{index === 0 ? "Bedroom" : "Kitchen"}</span>
            </div>);
        })}
        </div>
      </div>

      <div className="famlo-booking-layout">
        <div className="famlo-booking-main">
          <section className="famlo-host-section famlo-reveal-block">
            <div className="famlo-host-row">
              <div className="famlo-avatar-wrap">
                <div className="famlo-avatar-ring"/>
                <div className="famlo-avatar">{hostInitial}</div>
              </div>
              <div className="famlo-host-copy">
                <h1>{hostDisplayName}</h1>
                <p>Hosting on Famlo • Stay Human</p>
                <div className="famlo-host-meta">
                  <span><lucide_react_1.MapPin size={14}/> {publicLocation || "Approximate area shown"}</span>
                  <span className="famlo-verified-badge"><lucide_react_1.ShieldCheck size={14}/> Verified host</span>
                </div>
                <div className="famlo-language-row">
                  {["Hindi", "English", (_p = home.city) !== null && _p !== void 0 ? _p : "Local tips"].slice(0, 4).map(function (item) { return (<span key={item}>{item}</span>); })}
                </div>
              </div>
            </div>
            <div className="famlo-stats-grid">
              <div><lucide_react_1.Heart size={18}/><strong>{Math.max(12, (_q = home.totalReviews) !== null && _q !== void 0 ? _q : 18)}</strong><span>Liked by guests</span></div>
              <div><lucide_react_1.Users size={18}/><strong>{guestLimit}</strong><span>Guests allowed</span></div>
              <div><lucide_react_1.MessageCircle size={18}/><strong>{Math.max(6, (_r = home.totalReviews) !== null && _r !== void 0 ? _r : 14)}</strong><span>Stories shared</span></div>
            </div>
          </section>

          {stayUnits.length > 0 ? (<>
              <div className="famlo-divider"/>
              <section className="famlo-reveal-block">
                <span className="famlo-section-label">Rooms</span>
                <h2 className="famlo-section-title">Pick your stay unit</h2>
                <p className="famlo-section-body" style={{ marginBottom: 18 }}>
                  Choose the room you want to book. We keep the first version simple: one selected room drives the booking capacity and pricing.
                </p>
                {!hasAnyActiveStayUnits ? (<div style={{ marginBottom: 16, padding: 12, borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>
                    <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rooms are inactive</div>
                    <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, fontWeight: 600 }}>
                      These rooms are currently not active for live booking. Closed rooms stay visible in gray, and the host needs to turn at least one room on before this stay is ready to book.
                    </p>
                  </div>) : null}
                <div style={{ display: "grid", gap: 12 }}>
                  {stayUnits.map(function (unit) {
                var isSelected = unit.id === selectedStayUnitId;
                var roomPrice = unit.priceFullday || unit.priceMorning || unit.priceAfternoon || unit.priceEvening;
                var photoCount = unit.photos.length;
                var isActive = unit.isActive;
                return (<button key={unit.id} type="button" onClick={function () {
                        if (!isActive)
                            return;
                        setSelectedStayUnitId(unit.id);
                    }} disabled={!isActive} style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 12,
                        width: "100%",
                        textAlign: "left",
                        borderRadius: 18,
                        border: isSelected ? "1px solid #0F172A" : "1px solid #E2E8F0",
                        background: isActive ? (isSelected ? "#F8FAFC" : "#FFFFFF") : "#F8FAFC",
                        padding: 16,
                        boxShadow: isSelected ? "0 10px 24px rgba(15, 23, 42, 0.08)" : "none",
                        opacity: isActive ? 1 : 0.58,
                        cursor: isActive ? "pointer" : "not-allowed",
                    }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
                            <strong style={{ color: "#0F172A", fontSize: 15 }}>{unit.name}</strong>
                            {isSelected ? <span className="famlo-setup-badge">Selected</span> : null}
                            {unit.isPrimary ? <span className="famlo-setup-badge">Primary</span> : null}
                            <span className="famlo-setup-badge">{isActive ? "Active" : "Inactive"}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
                            {unit.description || "A simple room option for your stay."}
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                            <span className="famlo-setup-badge">Up to {unit.maxGuests} guests</span>
                            {unit.bedInfo ? <span className="famlo-setup-badge">{unit.bedInfo}</span> : null}
                            {unit.bathroomType ? <span className="famlo-setup-badge">{unit.bathroomType}</span> : null}
                            <span className="famlo-setup-badge">
                              {photoCount > 0 ? "".concat(photoCount, " photo").concat(photoCount === 1 ? "" : "s") : "No photos yet"}
                            </span>
                            <span className="famlo-setup-badge">
                              {photoCount > 0 ? "Cover ready" : "Add cover photo"}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", display: "grid", gap: 6, alignContent: "start" }}>
                          <strong style={{ color: "#0F172A", fontSize: 18 }}>
                            {roomPrice > 0 ? "\u20B9".concat(roomPrice.toLocaleString("en-IN")) : "Price set by host"}
                          </strong>
                          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>{isActive ? (unit.quarterEnabled ? "Smart pricing on" : "Standard pricing only") : "Closed room"}</span>
                        </div>
                      </button>);
            })}
                </div>
                <div className="famlo-state-card" style={{ marginTop: 16 }}>
                  <h3 style={{ marginBottom: 6 }}>Selected room</h3>
                  <p style={{ margin: 0 }}>
                    {selectedRoomLabel} · up to {guestLimit} guests
                  </p>
                  {selectedRoomTooSmall ? (<div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                      <strong style={{ display: "block", marginBottom: 6, color: "#9a3412" }}>
                        This room is too small for {guestCount} guests
                      </strong>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#9a3412" }}>
                        Pick a room that can hold your group, or adjust guest count to continue with this room.
                      </p>
                      {guestFitStayUnits.length > 0 ? (<div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                          {guestFitStayUnits.slice(0, 3).map(function (unit) {
                        var roomPrice = unit.priceFullday || unit.priceMorning || unit.priceAfternoon || unit.priceEvening;
                        var isCurrentRoom = unit.id === selectedStayUnitId;
                        return (<button key={"suggested-".concat(unit.id)} type="button" onClick={function () { return setSelectedStayUnitId(unit.id); }} style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 12,
                                width: "100%",
                                borderRadius: 12,
                                border: isCurrentRoom ? "1px solid #0F172A" : "1px solid #fed7aa",
                                background: isCurrentRoom ? "#ffffff" : "#fffaf5",
                                padding: "10px 12px",
                                textAlign: "left",
                            }}>
                                <span style={{ minWidth: 0 }}>
                                  <strong style={{ display: "block", color: "#0F172A", fontSize: 13 }}>{unit.name}</strong>
                                  <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#7c2d12" }}>
                                    Up to {unit.maxGuests} guests
                                  </span>
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: "#7c2d12", whiteSpace: "nowrap" }}>
                                  {roomPrice > 0 ? "\u20B9".concat(roomPrice.toLocaleString("en-IN")) : "Price set by host"}
                                </span>
                              </button>);
                    })}
                        </div>) : null}
                    </div>) : null}
                </div>
              </section>
            </>) : null}

          <div className="famlo-divider"/>

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">About</span>
            <h2 className="famlo-section-title">A home with <em>real stories</em></h2>
            <p className="famlo-section-body">{aboutParagraphs[0]}</p>
            {aboutExpanded ? <p className="famlo-section-body">{aboutParagraphs[1]}</p> : null}
            <button className="famlo-inline-link" onClick={function () { return setAboutExpanded(function (value) { return !value; }); }} type="button">
              {aboutExpanded ? "Show less" : "Read more"}
            </button>
          </section>

          <div className="famlo-divider"/>

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">What sets us apart</span>
            <h2 className="famlo-section-title">The Famlo experience</h2>
            <div className="famlo-experience-grid">
              {experienceCards.map(function (card) { return (<article className="famlo-experience-card" key={card.title}>
                  <div className="famlo-experience-icon">{card.icon}</div>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>); })}
            </div>
          </section>

          <div className="famlo-divider"/>

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Facilities</span>
            <h2 className="famlo-section-title">Amenities</h2>
            <div className="famlo-amenities-grid">
              {amenityItems.map(function (item) {
            var _a;
            return (<div className="famlo-amenity-item" key={item}>
                  {((_a = amenityIconMap.get(item.trim().toLowerCase())) !== null && _a !== void 0 ? _a : (function () { return <lucide_react_1.Home size={18}/>; }))()}
                  <span>{item}</span>
                </div>);
        })}
            </div>
          </section>

          <div className="famlo-divider"/>

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Space</span>
            <h2 className="famlo-section-title">Home setup</h2>
            <div className="famlo-setup-list">
              {setupRows.map(function (row) {
            var Icon = row.icon;
            return (<div className="famlo-setup-row" key={row.title}>
                  <div className="famlo-setup-icon"><Icon size={18}/></div>
                  <div className="famlo-setup-copy">
                    <strong>{row.title}</strong>
                    <p>{row.body}</p>
                  </div>
                  <span className="famlo-setup-badge">{row.badge}</span>
                </div>);
        })}
            </div>
          </section>

          <div className="famlo-divider"/>

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Included</span>
            <h2 className="famlo-section-title">What is included</h2>
            <div className="famlo-included-banner">
              <div className="famlo-included-icon"><lucide_react_1.UtensilsCrossed size={26}/></div>
              <div>
                <h3>Meals, care, and a stay that feels human</h3>
                <p>{home.culturalOffering || "Depending on the quarter you choose, your visit can include food, conversation, and a softer local rhythm."}</p>
              </div>
            </div>
            <div className="famlo-food-grid">
              <article className="famlo-food-card"><span>Vegetarian</span><h3>Home-style plates</h3><p>Fresh meals prepared around the flow of the household and your booking slot.</p></article>
              <article className="famlo-food-card"><span>Comfort</span><h3>Tea and small extras</h3><p>Simple hospitality, from chai to familiar comforts that make a short stay easier.</p></article>
              <article className="famlo-food-card"><span>Cultural</span><h3>Local rhythm</h3><p>A stay designed around people, neighborhood pace, and the feeling of being welcomed in.</p></article>
            </div>
            <div className="famlo-extra-tags">
              {includedItems.map(function (item) { return <span key={item}>{item}</span>; })}
            </div>
          </section>

          <div className="famlo-divider"/>

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Policies</span>
            <h2 className="famlo-section-title">House rules</h2>
            <div className="famlo-rules-list">
              {houseRules.map(function (rule, index) { return (<div className="famlo-rule-row" key={"".concat(rule, "-").concat(index)}>
                  <span>{index + 1}</span>
                  <p>{rule}</p>
                </div>); })}
            </div>
          </section>

          <div className="famlo-divider famlo-mobile-only"/>
          <div className="famlo-mobile-only">{renderWidget(true)}</div>

          <div className="famlo-divider"/>

          <section className="famlo-reveal-block">
            <span className="famlo-section-label">Guest stories</span>
            <h2 className="famlo-section-title">Voices. No stars — <em>just words.</em></h2>
            <div className="famlo-story-grid">
              {stories.map(function (_a) {
            var name = _a[0], city = _a[1], tag = _a[2], quoteText = _a[3];
            return (<article className="famlo-story-card" key={name}>
                  <div className="famlo-story-head">
                    <div className="famlo-story-avatar">{String(name).charAt(0)}</div>
                    <div>
                      <strong>{name}</strong>
                      <span>{city}</span>
                    </div>
                  </div>
                  <blockquote>{quoteText}</blockquote>
                  <span className="famlo-story-tag">{tag}</span>
                </article>);
        })}
            </div>
          </section>
        </div>

        <aside className="famlo-booking-side">
          {renderWidget(false)}
        </aside>
      </div>

      <div className="famlo-mobile-cta">
        <div>
          <small>{isFullDayBooking ? "Total for ".concat(bookingDayLabel) : "Total for booking"}</small>
          <strong>Rs. {((_s = quote === null || quote === void 0 ? void 0 : quote.totalPrice) !== null && _s !== void 0 ? _s : estimatedTotalPrice).toLocaleString("en-IN")}</strong>
        </div>
        <button className="famlo-cta-button" onClick={function () { var _a; return (_a = inlineWidgetRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "start" }); }} type="button">
          Get it now
        </button>
      </div>
      {showAuthModal ? (<AuthModal_1.AuthModal isOpen={showAuthModal} onClose={function () {
                setShowAuthModal(false);
                void syncAuthState();
            }}/>) : null}
    </section>);
}
