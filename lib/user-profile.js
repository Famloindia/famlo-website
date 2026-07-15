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
exports.isGuestProfileComplete = isGuestProfileComplete;
exports.hasGuestVerificationSubmission = hasGuestVerificationSubmission;
exports.loadUserProfileCompatibility = loadUserProfileCompatibility;
exports.upsertUserProfileCompatibility = upsertUserProfileCompatibility;
function asString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}
function asBoolean(value) {
    return Boolean(value);
}
function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim().length > 0) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function mapLegacyUserRow(userId, row) {
    var _a, _b;
    if (!row)
        return null;
    return {
        id: userId,
        name: asString(row.name),
        phone: asString(row.phone),
        email: asString(row.email),
        city: asString(row.city),
        state: asString(row.state),
        onboarding_completed: asBoolean(row.onboarding_completed),
        avatar_url: asString(row.avatar_url),
        about: asString(row.about),
        date_of_birth: asString(row.date_of_birth),
        gender: asString(row.gender),
        kyc_status: asString(row.kyc_status),
        kyc_submitted_at: asString(row.kyc_submitted_at),
        id_document_url: (_a = asString(row.id_document_url)) !== null && _a !== void 0 ? _a : asString(row.verification_url),
        id_document_type: (_b = asString(row.id_document_type)) !== null && _b !== void 0 ? _b : asString(row.verification_type),
    };
}
function isGuestProfileComplete(profile) {
    if (!profile)
        return false;
    var hasContact = Boolean(profile.phone || profile.email);
    return Boolean(profile.name &&
        profile.city &&
        profile.state &&
        profile.gender &&
        profile.date_of_birth &&
        profile.about &&
        hasContact);
}
function hasGuestVerificationSubmission(profile) {
    if (!profile)
        return false;
    if (profile.kyc_status && ["pending", "verified", "auto_verified", "pending_review"].includes(profile.kyc_status)) {
        return true;
    }
    if (profile.kyc_submitted_at)
        return true;
    if (profile.id_document_url)
        return true;
    return false;
}
function mergeUserProfile(userId, legacyRow, v2Row) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
    var base = mapLegacyUserRow(userId, legacyRow);
    if (!base && !v2Row)
        return null;
    return {
        id: userId,
        name: (_b = (_a = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.display_name)) !== null && _a !== void 0 ? _a : base === null || base === void 0 ? void 0 : base.name) !== null && _b !== void 0 ? _b : null,
        phone: (_d = (_c = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.phone)) !== null && _c !== void 0 ? _c : base === null || base === void 0 ? void 0 : base.phone) !== null && _d !== void 0 ? _d : null,
        email: (_f = (_e = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.email)) !== null && _e !== void 0 ? _e : base === null || base === void 0 ? void 0 : base.email) !== null && _f !== void 0 ? _f : null,
        city: (_h = (_g = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.home_city)) !== null && _g !== void 0 ? _g : base === null || base === void 0 ? void 0 : base.city) !== null && _h !== void 0 ? _h : null,
        state: (_k = (_j = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.home_state)) !== null && _j !== void 0 ? _j : base === null || base === void 0 ? void 0 : base.state) !== null && _k !== void 0 ? _k : null,
        onboarding_completed: Boolean(base === null || base === void 0 ? void 0 : base.onboarding_completed) ||
            Boolean(asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.display_name) && asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.home_city) && asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.home_state)),
        avatar_url: (_m = (_l = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.avatar_url)) !== null && _l !== void 0 ? _l : base === null || base === void 0 ? void 0 : base.avatar_url) !== null && _m !== void 0 ? _m : null,
        about: (_p = (_o = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.bio)) !== null && _o !== void 0 ? _o : base === null || base === void 0 ? void 0 : base.about) !== null && _p !== void 0 ? _p : null,
        date_of_birth: (_r = (_q = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.date_of_birth)) !== null && _q !== void 0 ? _q : base === null || base === void 0 ? void 0 : base.date_of_birth) !== null && _r !== void 0 ? _r : null,
        gender: (_t = (_s = asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.gender)) !== null && _s !== void 0 ? _s : base === null || base === void 0 ? void 0 : base.gender) !== null && _t !== void 0 ? _t : null,
        kyc_status: (_u = base === null || base === void 0 ? void 0 : base.kyc_status) !== null && _u !== void 0 ? _u : null,
        id_document_url: (_v = base === null || base === void 0 ? void 0 : base.id_document_url) !== null && _v !== void 0 ? _v : null,
        id_document_type: (_w = base === null || base === void 0 ? void 0 : base.id_document_type) !== null && _w !== void 0 ? _w : null,
        last_lat: asNumber(v2Row === null || v2Row === void 0 ? void 0 : v2Row.last_lat),
        last_lng: asNumber(v2Row === null || v2Row === void 0 ? void 0 : v2Row.last_lng),
        last_location_label: asString(v2Row === null || v2Row === void 0 ? void 0 : v2Row.last_location_label),
    };
}
function loadUserProfileCompatibility(supabase, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, legacyResult, v2Result, legacyRow, v2Row;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        supabase
                            .from("users")
                            .select("id, name, phone, email, city, state, onboarding_completed, avatar_url, about, date_of_birth, gender, kyc_status, kyc_submitted_at, id_document_url, id_document_type, verification_url, verification_type")
                            .eq("id", userId)
                            .maybeSingle(),
                        supabase
                            .from("user_profiles_v2")
                            .select("user_id, display_name, avatar_url, phone, email, date_of_birth, gender, bio, home_city, home_state, last_lat, last_lng, last_location_label")
                            .eq("user_id", userId)
                            .maybeSingle()
                    ])];
                case 1:
                    _a = _b.sent(), legacyResult = _a[0], v2Result = _a[1];
                    legacyRow = legacyResult.error ? null : legacyResult.data;
                    v2Row = v2Result.error ? null : v2Result.data;
                    return [2 /*return*/, mergeUserProfile(userId, legacyRow, v2Row)];
            }
        });
    });
}
function upsertUserProfileCompatibility(supabase, params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, name, email, phone, city, state, about, dob, gender, avatarUrl, hasEmailUpdate, hasPhoneUpdate, normalizedAvatarUrl, userUpdate, updateError, message, isPolicyBlocked, upsertV2Error, message, isMissingTable;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    userId = params.userId, name = params.name, email = params.email, phone = params.phone, city = params.city, state = params.state, about = params.about, dob = params.dob, gender = params.gender, avatarUrl = params.avatarUrl;
                    hasEmailUpdate = typeof email === "string" && email.trim().length > 0;
                    hasPhoneUpdate = typeof phone === "string" && phone.trim().length > 0;
                    normalizedAvatarUrl = typeof avatarUrl === "string" && avatarUrl.trim().length > 0 ? avatarUrl.trim() : null;
                    userUpdate = {
                        name: name,
                        city: city,
                        state: state,
                        about: about,
                        date_of_birth: dob,
                        gender: gender,
                        avatar_url: normalizedAvatarUrl,
                        onboarding_completed: true,
                        updated_at: new Date().toISOString(),
                    };
                    if (hasEmailUpdate) {
                        userUpdate.email = email.trim();
                    }
                    if (hasPhoneUpdate) {
                        userUpdate.phone = phone.trim();
                    }
                    return [4 /*yield*/, supabase.from("users").upsert(__assign(__assign(__assign({ id: userId }, (hasEmailUpdate ? { email: email.trim() } : {})), (hasPhoneUpdate ? { phone: phone.trim() } : {})), userUpdate), { onConflict: "id" })];
                case 1:
                    updateError = (_a.sent()).error;
                    if (updateError) {
                        message = updateError.message.toLowerCase();
                        isPolicyBlocked = message.includes("row-level security") ||
                            message.includes("permission denied") ||
                            message.includes("violates row-level security");
                        if (!isPolicyBlocked) {
                            throw updateError;
                        }
                    }
                    return [4 /*yield*/, supabase.from("user_profiles_v2").upsert(__assign({ user_id: userId, display_name: name, phone: hasPhoneUpdate ? phone.trim() : null, home_city: city !== null && city !== void 0 ? city : null, home_state: state !== null && state !== void 0 ? state : null, bio: about !== null && about !== void 0 ? about : null, date_of_birth: dob !== null && dob !== void 0 ? dob : null, gender: gender !== null && gender !== void 0 ? gender : null, avatar_url: normalizedAvatarUrl, updated_at: new Date().toISOString() }, (hasEmailUpdate ? { email: email.trim() } : {})), { onConflict: "user_id" })];
                case 2:
                    upsertV2Error = (_a.sent()).error;
                    if (upsertV2Error) {
                        message = upsertV2Error.message.toLowerCase();
                        isMissingTable = message.includes("does not exist") || message.includes("relation") || message.includes("schema cache");
                        if (!isMissingTable) {
                            throw upsertV2Error;
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
