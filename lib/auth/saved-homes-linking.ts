type SavedHome = {
  id: string;
  [key: string]: unknown;
};

function readSavedHomes(storage: Storage, userId: string): SavedHome[] {
  try {
    const parsed = JSON.parse(
      storage.getItem(`famlo-saved-homes:${userId}`) ?? "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is SavedHome =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof item.id === "string"
        )
      : [];
  } catch {
    return [];
  }
}

export function migrateSavedHomesAfterIdentityLink(
  storage: Storage,
  sourceUserId: string,
  targetUserId: string
): number {
  if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) return 0;
  const source = readSavedHomes(storage, sourceUserId);
  const target = readSavedHomes(storage, targetUserId);
  const merged = new Map<string, SavedHome>();
  for (const home of [...target, ...source]) merged.set(home.id, home);
  const values = Array.from(merged.values());
  storage.setItem(`famlo-saved-homes:${targetUserId}`, JSON.stringify(values));
  storage.removeItem(`famlo-saved-homes:${sourceUserId}`);
  return values.length;
}
