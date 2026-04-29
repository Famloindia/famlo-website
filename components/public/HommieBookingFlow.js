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
exports.HommieBookingFlow = HommieBookingFlow;
var link_1 = require("next/link");
var react_1 = require("react");
var ProfileCompletionForm_1 = require("@/components/account/ProfileCompletionForm");
var AuthModal_1 = require("@/components/auth/AuthModal");
var supabase_1 = require("@/lib/supabase");
var user_profile_1 = require("@/lib/user-profile");
function getToday() {
    var _a;
    return (_a = new Date().toISOString().split("T")[0]) !== null && _a !== void 0 ? _a : "";
}
function parseGuideReceiverId(companion) {
    var _a, _b;
    return (_b = (_a = companion.guideUserId) !== null && _a !== void 0 ? _a : companion.guideId) !== null && _b !== void 0 ? _b : null;
}
function HommieBookingFlow(_a) {
    var _this = this;
    var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    var companion = _a.companion;
    var supabase = (0, react_1.useMemo)(function () { return (0, supabase_1.createBrowserSupabaseClient)(); }, []);
    var resumeStepRef = (0, react_1.useRef)("need");
    var _q = (0, react_1.useState)(null), currentUserId = _q[0], setCurrentUserId = _q[1];
    var _r = (0, react_1.useState)(null), guestName = _r[0], setGuestName = _r[1];
    var _s = (0, react_1.useState)(null), guestCity = _s[0], setGuestCity = _s[1];
    var _t = (0, react_1.useState)(false), profileComplete = _t[0], setProfileComplete = _t[1];
    var _u = (0, react_1.useState)(true), loadingAuth = _u[0], setLoadingAuth = _u[1];
    var _v = (0, react_1.useState)("login"), step = _v[0], setStep = _v[1];
    var _w = (0, react_1.useState)(null), authError = _w[0], setAuthError = _w[1];
    var _x = (0, react_1.useState)(false), submitting = _x[0], setSubmitting = _x[1];
    var _y = (0, react_1.useState)(null), bookingError = _y[0], setBookingError = _y[1];
    var _z = (0, react_1.useState)(null), successMessage = _z[0], setSuccessMessage = _z[1];
    var _0 = (0, react_1.useState)(""), couponCode = _0[0], setCouponCode = _0[1];
    var _1 = (0, react_1.useState)(null), quote = _1[0], setQuote = _1[1];
    var _2 = (0, react_1.useState)(false), quoteLoading = _2[0], setQuoteLoading = _2[1];
    var _3 = (0, react_1.useState)(false), showAuthModal = _3[0], setShowAuthModal = _3[1];
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
                    return [2 /*return*/, headers];
            }
        });
    }); }, [currentUserId, supabase]);
    var options = (0, react_1.useMemo)(function () {
        return companion.activities.length > 0
            ? companion.activities.slice(0, 6)
            : ["Local orientation", "City support", "Neighborhood walk"];
    }, [companion.activities]);
    var _4 = (0, react_1.useState)((_b = options[0]) !== null && _b !== void 0 ? _b : "Local orientation"), selectedNeed = _4[0], setSelectedNeed = _4[1];
    var _5 = (0, react_1.useState)(getToday()), dateFrom = _5[0], setDateFrom = _5[1];
    var _6 = (0, react_1.useState)(1), guestCount = _6[0], setGuestCount = _6[1];
    var _7 = (0, react_1.useState)("cultural"), vibe = _7[0], setVibe = _7[1];
    var guestLimit = Math.max(1, (_c = companion.maxGuests) !== null && _c !== void 0 ? _c : 1);
    var publicLocation = [companion.locality, companion.city, companion.state].filter(Boolean).join(", ");
    var previewPrice = (_e = (_d = companion.hourlyPrice) !== null && _d !== void 0 ? _d : companion.nightlyPrice) !== null && _e !== void 0 ? _e : 0;
    var estimatedTotalPrice = previewPrice > 0 ? previewPrice * guestCount : 0;
    function resolveNextStep(userId, nextProfileComplete) {
        if (!userId) {
            return "login";
        }
        if (!nextProfileComplete) {
            return "profile";
        }
        return "need";
    }
    var syncAuthState = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var user, userRow, nextProfileComplete;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    setLoadingAuth(true);
                    return [4 /*yield*/, supabase.auth.getUser()];
                case 1:
                    user = (_c.sent()).data.user;
                    if (!user) {
                        setCurrentUserId(null);
                        setGuestName(null);
                        setGuestCity(null);
                        setProfileComplete(false);
                        setStep("login");
                        setLoadingAuth(false);
                        return [2 /*return*/, { userId: null, profileComplete: false }];
                    }
                    return [4 /*yield*/, supabase
                            .from("users")
                            .select("name, phone, email, city, state, about, date_of_birth, gender")
                            .eq("id", user.id)
                            .maybeSingle()];
                case 2:
                    userRow = (_c.sent()).data;
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
                    setGuestName(typeof (userRow === null || userRow === void 0 ? void 0 : userRow.name) === "string" ? userRow.name : null);
                    setGuestCity(typeof (userRow === null || userRow === void 0 ? void 0 : userRow.city) === "string" ? userRow.city : null);
                    setProfileComplete(nextProfileComplete);
                    setStep(resolveNextStep(user.id, nextProfileComplete));
                    setLoadingAuth(false);
                    return [2 /*return*/, { userId: user.id, profileComplete: nextProfileComplete }];
            }
        });
    }); }, [supabase]);
    (0, react_1.useEffect)(function () {
        void syncAuthState();
        var subscription = supabase.auth.onAuthStateChange(function () {
            void syncAuthState();
        }).data.subscription;
        return function () {
            subscription.unsubscribe();
        };
    }, [supabase, syncAuthState]);
    (0, react_1.useEffect)(function () {
        if (!selectedNeed && options[0]) {
            setSelectedNeed(options[0]);
        }
    }, [options, selectedNeed]);
    (0, react_1.useEffect)(function () {
        if (step !== "login" && step !== "profile") {
            resumeStepRef.current = step;
        }
    }, [step]);
    (0, react_1.useEffect)(function () {
        if (!currentUserId || !companion.id || !dateFrom) {
            setQuote(null);
            return;
        }
        var cancelled = false;
        function loadQuote() {
            return __awaiter(this, void 0, void 0, function () {
                var response, _a, _b, _c, data, _d;
                var _e;
                var _f, _g, _h, _j, _k, _l, _m, _o, _p;
                return __generator(this, function (_q) {
                    switch (_q.label) {
                        case 0:
                            setQuoteLoading(true);
                            _q.label = 1;
                        case 1:
                            _q.trys.push([1, 5, 6, 7]);
                            _a = fetch;
                            _b = ["/api/bookings/quote"];
                            _e = {
                                method: "POST"
                            };
                            _c = [{ "Content-Type": "application/json" }];
                            return [4 /*yield*/, getAuthHeaders()];
                        case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_e.headers = __assign.apply(void 0, _c.concat([(_q.sent())])),
                                    _e.body = JSON.stringify({
                                        bookingType: "hommie_session",
                                        userId: currentUserId,
                                        hommieId: companion.id,
                                        legacyGuideId: companion.guideId,
                                        quarterType: "hommie_help",
                                        quarterTime: selectedNeed,
                                        startDate: dateFrom,
                                        endDate: dateFrom,
                                        guestsCount: guestCount,
                                        unitPrice: previewPrice,
                                        commissionPct: 18,
                                        couponCode: couponCode.trim() || null,
                                    }),
                                    _e)]))];
                        case 3:
                            response = _q.sent();
                            return [4 /*yield*/, response.json()];
                        case 4:
                            data = _q.sent();
                            if (!response.ok || data.error) {
                                throw new Error((_f = data.error) !== null && _f !== void 0 ? _f : "Failed to calculate total.");
                            }
                            if (!cancelled) {
                                setQuote({
                                    subtotal: (_g = data.subtotal) !== null && _g !== void 0 ? _g : 0,
                                    discountAmount: (_h = data.discountAmount) !== null && _h !== void 0 ? _h : 0,
                                    taxAmount: (_j = data.taxAmount) !== null && _j !== void 0 ? _j : 0,
                                    totalPrice: (_k = data.totalPrice) !== null && _k !== void 0 ? _k : 0,
                                    partnerPayoutAmount: (_l = data.partnerPayoutAmount) !== null && _l !== void 0 ? _l : 0,
                                    platformFee: (_m = data.platformFee) !== null && _m !== void 0 ? _m : 0,
                                    couponCode: (_p = (_o = data.appliedCoupon) === null || _o === void 0 ? void 0 : _o.code) !== null && _p !== void 0 ? _p : null,
                                });
                            }
                            return [3 /*break*/, 7];
                        case 5:
                            _d = _q.sent();
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
    }, [companion.guideId, companion.id, couponCode, currentUserId, dateFrom, getAuthHeaders, guestCount, previewPrice, selectedNeed]);
    function goNext() {
        setBookingError(null);
        if (step === "need") {
            if (!selectedNeed) {
                setBookingError("Choose a help type first.");
                return;
            }
            setStep("date");
            return;
        }
        if (step === "date") {
            if (!dateFrom) {
                setBookingError("Choose a date first.");
                return;
            }
            setStep("guests");
            return;
        }
        if (step === "guests") {
            if (guestCount > guestLimit) {
                setBookingError("This hommie currently allows up to ".concat(guestLimit, " guests."));
                return;
            }
            setStep("confirm");
        }
    }
    function goBack() {
        setBookingError(null);
        if (step === "date") {
            setStep("need");
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
            var receiverId, response, _a, _b, _c, payload, error_1;
            var _d;
            var _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        if (!currentUserId || !companion.id || !dateFrom) {
                            setBookingError("This hommie is not fully connected yet.");
                            return [2 /*return*/];
                        }
                        if (!companion.isActive) {
                            setBookingError("This hommie listing is not active right now.");
                            return [2 /*return*/];
                        }
                        if (!profileComplete) {
                            setBookingError("Complete your guest profile once, then you can continue to booking and payment.");
                            return [2 /*return*/];
                        }
                        if (guestCount > guestLimit) {
                            setBookingError("This hommie currently allows up to ".concat(guestLimit, " guests."));
                            return [2 /*return*/];
                        }
                        setSubmitting(true);
                        setBookingError(null);
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 5, 6, 7]);
                        receiverId = parseGuideReceiverId(companion);
                        _a = fetch;
                        _b = ["/api/bookings/create"];
                        _d = {
                            method: "POST"
                        };
                        _c = [{ "Content-Type": "application/json" }];
                        return [4 /*yield*/, getAuthHeaders()];
                    case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([(_d.headers = __assign.apply(void 0, _c.concat([(_f.sent())])),
                                _d.body = JSON.stringify({
                                    bookingType: "hommie_session",
                                    userId: currentUserId,
                                    hommieId: companion.id,
                                    legacyGuideId: companion.guideId,
                                    quarterType: "hommie_help",
                                    quarterTime: selectedNeed,
                                    startDate: dateFrom,
                                    endDate: dateFrom,
                                    guestsCount: guestCount,
                                    unitPrice: previewPrice,
                                    commissionPct: 18,
                                    couponCode: couponCode.trim() || null,
                                    vibe: vibe,
                                    guestName: guestName,
                                    guestCity: guestCity,
                                    listingName: companion.title,
                                    guideUserId: receiverId,
                                }),
                                _d)]))];
                    case 3:
                        response = _f.sent();
                        return [4 /*yield*/, response.json()];
                    case 4:
                        payload = _f.sent();
                        if (!response.ok || payload.error) {
                            throw new Error((_e = payload.error) !== null && _e !== void 0 ? _e : "Could not create hommie booking.");
                        }
                        setSuccessMessage("Your request for ".concat(selectedNeed.toLowerCase(), " with ").concat(companion.title, " is now in the shared Famlo v2 booking and chat flow."));
                        setStep("confirm");
                        return [3 /*break*/, 7];
                    case 5:
                        error_1 = _f.sent();
                        setBookingError(error_1 instanceof Error ? error_1.message : "Booking failed.");
                        return [3 /*break*/, 7];
                    case 6:
                        setSubmitting(false);
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    }
    return (<section className="panel detail-page">
      <div className="detail-topbar">
        <link_1.default href={"/hommies/".concat(companion.id)}>Back to listing</link_1.default>
        <span className="status">App-connected hommie booking</span>
      </div>

      <div className="detail-grid single-accent">
        <div className="detail-copy">
          <span className="eyebrow">Famlo hommie booking</span>
          <h1>Connect with {companion.title}</h1>
          <p className="detail-subtitle">{publicLocation || "Location shared in connected flow"}</p>
          <p className="detail-description">
            This flow now follows the shared Famlo app-connected structure: login, profile check, help type,
            date, guests, and shared writes into `bookings_v2`, `conversations`, and `messages`.
          </p>

          <div className="panel detail-box">
            <h2>Shared connection</h2>
            <ul>
              <li>Writes now go into shared `bookings_v2` first, with legacy guide compatibility preserved.</li>
              <li>Pricing is backend-owned and coupon-ready.</li>
              <li>Chat kickoff writes go into `conversations` and `messages`.</li>
              <li>Public page still keeps the exact private coordination inside the connected flow.</li>
              <li>No separate website-only request table is used.</li>
            </ul>
          </div>
        </div>

        <div className="detail-copy">
          {loadingAuth ? (<div className="panel detail-box">
              <h2>Loading booking state</h2>
              <p>Checking your Famlo account and profile status.</p>
            </div>) : null}

          {!loadingAuth && step === "login" ? (<div className="panel detail-box">
              <h2>Sign in to continue</h2>
              <p>Use the Famlo sign-in flow here. The same session then unlocks profile completion, booking creation, and payment without switching flows.</p>
              {authError ? <div className="auth-error">{authError}</div> : null}
              <button className="button-like" onClick={function () {
                setAuthError(null);
                setShowAuthModal(true);
            }} type="button">
                Sign in with Famlo
              </button>
            </div>) : null}

          {!loadingAuth && step === "profile" ? (<div className="panel detail-box">
              <h2>Profile required before continuing</h2>
              <p>
                Save your name, contact details, location, gender, date of birth, and about section here.
                Once saved, this same flow can continue into booking and chat.
              </p>
              <div style={{ marginTop: 20 }}>
                <ProfileCompletionForm_1.ProfileCompletionForm compact title="Complete guest profile" description="Save your guest details here so the host can review who is booking." buttonLabel="Save profile and continue" onSuccess={function () { return __awaiter(_this, void 0, void 0, function () {
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
              </div>
            </div>) : null}

          {!loadingAuth && profileComplete ? (<div className="panel detail-box">
              <h2>Booking steps</h2>
              <div className="auth-pills">
                {["Need", "Date", "Guests", "Confirm"].map(function (label) { return (<div className={"panel auth-pill ".concat(step === label.toLowerCase() ? "active-pill" : "")} key={label}>
                    {label}
                  </div>); })}
              </div>

              {step === "need" ? (<div className="booking-choices">
                  {options.map(function (option) { return (<button className={"quarter-choice ".concat(selectedNeed === option ? "active" : "")} key={option} onClick={function () { return setSelectedNeed(option); }} type="button">
                      <strong>{option}</strong>
                      <span>{publicLocation || "City support"}</span>
                      <span>
                        {previewPrice > 0 ? "From Rs. ".concat(previewPrice.toLocaleString("en-IN")) : "Price on contact"}
                      </span>
                    </button>); })}
                </div>) : null}

              {step === "date" ? (<div className="dashboard-form-grid">
                  <label>
                    <span>Visit date</span>
                    <input className="text-input" min={getToday()} onChange={function (event) { return setDateFrom(event.target.value); }} type="date" value={dateFrom}/>
                  </label>
                </div>) : null}

              {step === "guests" ? (<div className="dashboard-form-grid">
                  <label>
                    <span>Guests</span>
                    <select className="text-input" onChange={function (event) { return setGuestCount(Number(event.target.value)); }} value={guestCount}>
                      {Array.from({ length: guestLimit }, function (_, index) { return index + 1; }).map(function (count) { return (<option key={count} value={count}>
                          {count} guest{count > 1 ? "s" : ""}
                        </option>); })}
                    </select>
                  </label>
                  <label>
                    <span>Visit vibe</span>
                    <select className="text-input" onChange={function (event) { return setVibe(event.target.value); }} value={vibe}>
                      <option value="cultural">Cultural</option>
                      <option value="quiet">Quiet</option>
                    </select>
                  </label>
                </div>) : null}

              {step === "confirm" ? (<div className="booking-summary">
                  <div className="panel detail-box" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                    <strong>Pricing and coupon</strong>
                    <label>
                      <span>Coupon code</span>
                      <input className="text-input" onChange={function (event) { return setCouponCode(event.target.value.toUpperCase()); }} placeholder="Optional coupon" value={couponCode}/>
                    </label>
                    <div>Subtotal: Rs. {((_f = quote === null || quote === void 0 ? void 0 : quote.subtotal) !== null && _f !== void 0 ? _f : estimatedTotalPrice).toLocaleString("en-IN")}</div>
                    <div>Discount: Rs. {((_g = quote === null || quote === void 0 ? void 0 : quote.discountAmount) !== null && _g !== void 0 ? _g : 0).toLocaleString("en-IN")}</div>
                    <div>Tax: Rs. {((_h = quote === null || quote === void 0 ? void 0 : quote.taxAmount) !== null && _h !== void 0 ? _h : 0).toLocaleString("en-IN")}</div>
                    <div>Platform fee: Rs. {((_j = quote === null || quote === void 0 ? void 0 : quote.platformFee) !== null && _j !== void 0 ? _j : 0).toLocaleString("en-IN")}</div>
                    <div>Partner payout: Rs. {((_k = quote === null || quote === void 0 ? void 0 : quote.partnerPayoutAmount) !== null && _k !== void 0 ? _k : 0).toLocaleString("en-IN")}</div>
                    <div>Total: {quoteLoading ? "Updating..." : "Rs. ".concat(((_l = quote === null || quote === void 0 ? void 0 : quote.totalPrice) !== null && _l !== void 0 ? _l : estimatedTotalPrice).toLocaleString("en-IN"))}</div>
                  </div>
                  <div className="booking-summary-row">
                    <span>Hommie</span>
                    <strong>{companion.title}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Public city / area</span>
                    <strong>{publicLocation || "Shared in connected flow"}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Selected help type</span>
                    <strong>{selectedNeed}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Date</span>
                    <strong>{dateFrom}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Guests</span>
                    <strong>{guestCount}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Total preview</span>
                    <strong>{((_m = quote === null || quote === void 0 ? void 0 : quote.totalPrice) !== null && _m !== void 0 ? _m : estimatedTotalPrice) > 0 ? "Rs. ".concat(((_o = quote === null || quote === void 0 ? void 0 : quote.totalPrice) !== null && _o !== void 0 ? _o : estimatedTotalPrice).toLocaleString("en-IN")) : "Will be coordinated in chat"}</strong>
                  </div>
                  <div className="booking-summary-row">
                    <span>Coupon</span>
                    <strong>{(_p = quote === null || quote === void 0 ? void 0 : quote.couponCode) !== null && _p !== void 0 ? _p : (couponCode.trim() || "None")}</strong>
                  </div>
                  {successMessage ? <div className="panel auth-pill">{successMessage}</div> : null}
                </div>) : null}

              {bookingError ? <div className="auth-error">{bookingError}</div> : null}

              {step !== "confirm" ? (<div className="detail-actions">
                  {step !== "need" ? (<button className="button-like secondary" onClick={goBack} type="button">
                      Back
                    </button>) : null}
                  <button className="button-like" onClick={goNext} type="button">
                    Continue
                  </button>
                </div>) : (<div className="detail-actions">
                  <button className="button-like secondary" onClick={goBack} type="button">
                    Back
                  </button>
                  <button className="button-like" disabled={submitting || Boolean(successMessage)} onClick={function () { return void handleBooking(); }} type="button">
                    {submitting ? "Sending..." : successMessage ? "Sent" : "Confirm request"}
                  </button>
                </div>)}
            </div>) : null}
        </div>
      </div>
      {showAuthModal ? (<AuthModal_1.AuthModal isOpen={showAuthModal} onClose={function () {
                setShowAuthModal(false);
                void syncAuthState();
            }}/>) : null}
    </section>);
}
