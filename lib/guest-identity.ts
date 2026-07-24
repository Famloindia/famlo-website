type NullableString = string | null | undefined;

export type GuestIdentityProfileCandidate = {
  id: string;
  name?: NullableString;
  phone?: NullableString;
  email?: NullableString;
  city?: NullableString;
  state?: NullableString;
  about?: NullableString;
  date_of_birth?: NullableString;
  gender?: NullableString;
  avatar_url?: NullableString;
  onboarding_completed?: boolean | null | undefined;
  updated_at?: NullableString;
};

function asTrimmedString(value: NullableString): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeGuestEmail(value: NullableString): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

export function normalizeGuestPhone(value: NullableString): string | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  if (raw.startsWith("+") && digits.length >= 11) {
    return `+${digits}`;
  }

  return digits.length >= 11 ? `+${digits}` : null;
}

export function getGuestPhoneLookupVariants(phone: NullableString): string[] {
  const normalized = normalizeGuestPhone(phone);
  if (!normalized) return [];

  const digits = normalized.replace(/\D/g, "");
  const localDigits = digits.length >= 10 ? digits.slice(-10) : digits;
  const variants = new Set<string>([
    normalized,
    digits,
    localDigits,
  ]);

  if (localDigits.length === 10) {
    variants.add(`+91${localDigits}`);
    variants.add(`91${localDigits}`);
    variants.add(`0${localDigits}`);
  }

  return Array.from(variants);
}

function compareUpdatedAt(left: NullableString, right: NullableString): number {
  return String(right ?? "").localeCompare(String(left ?? ""));
}

export function scoreGuestProfileCandidate(candidate: GuestIdentityProfileCandidate): number {
  let score = 0;

  if (candidate.onboarding_completed) score += 10;
  if (asTrimmedString(candidate.name)) score += 3;
  if (normalizeGuestEmail(candidate.email)) score += 2;
  if (normalizeGuestPhone(candidate.phone)) score += 2;
  if (asTrimmedString(candidate.city)) score += 1;
  if (asTrimmedString(candidate.state)) score += 1;
  if (asTrimmedString(candidate.about)) score += 3;
  if (asTrimmedString(candidate.date_of_birth)) score += 2;
  if (asTrimmedString(candidate.gender)) score += 1;
  if (asTrimmedString(candidate.avatar_url)) score += 1;

  return score;
}

export function pickCanonicalGuestProfile<T extends GuestIdentityProfileCandidate>(
  candidates: T[],
  preferredUserId?: string | null
): T | null {
  if (candidates.length === 0) return null;

  return (
    candidates
      .slice()
      .sort((left, right) => {
        if (preferredUserId) {
          if (left.id === preferredUserId && right.id !== preferredUserId) return -1;
          if (right.id === preferredUserId && left.id !== preferredUserId) return 1;
        }

        const scoreDiff = scoreGuestProfileCandidate(right) - scoreGuestProfileCandidate(left);
        if (scoreDiff !== 0) return scoreDiff;
        return compareUpdatedAt(left.updated_at, right.updated_at);
      })[0] ?? null
  );
}

function preferField<T extends GuestIdentityProfileCandidate>(
  candidates: T[],
  field: keyof GuestIdentityProfileCandidate
): string | null {
  for (const candidate of candidates) {
    const value = asTrimmedString(candidate[field] as NullableString);
    if (value) return value;
  }

  return null;
}

export function mergeGuestProfileCandidates<T extends GuestIdentityProfileCandidate>(
  candidates: T[],
  preferredUserId?: string | null
): GuestIdentityProfileCandidate | null {
  if (candidates.length === 0) return null;

  const canonical = pickCanonicalGuestProfile(candidates, preferredUserId);
  if (!canonical) return null;

  const orderedCandidates = [
    canonical,
    ...candidates.filter((candidate) => candidate.id !== canonical.id),
  ];

  return {
    id: preferredUserId ?? canonical.id,
    name: preferField(orderedCandidates, "name"),
    phone: normalizeGuestPhone(preferField(orderedCandidates, "phone")),
    email: normalizeGuestEmail(preferField(orderedCandidates, "email")),
    city: preferField(orderedCandidates, "city"),
    state: preferField(orderedCandidates, "state"),
    about: preferField(orderedCandidates, "about"),
    date_of_birth: preferField(orderedCandidates, "date_of_birth"),
    gender: preferField(orderedCandidates, "gender"),
    avatar_url: preferField(orderedCandidates, "avatar_url"),
    onboarding_completed: orderedCandidates.some((candidate) => Boolean(candidate.onboarding_completed)),
    updated_at: canonical.updated_at ?? null,
  };
}
