export type MoneyRoundingMode = "nearest";

export function roundMoney(value: number, mode: MoneyRoundingMode = "nearest"): number {
  const safe = Number.isFinite(value) ? value : 0;
  switch (mode) {
    case "nearest":
    default:
      return Math.round(safe);
  }
}

export function clampMoney(value: number): number {
  return Math.max(0, roundMoney(value));
}

export function toBpsFromPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.round(pct * 100));
}

export function toPctFromBps(bps: number): number {
  if (!Number.isFinite(bps)) return 0;
  return Math.max(0, bps / 100);
}

export function applyRateBps(amount: number, rateBps: number): number {
  return clampMoney(clampMoney(amount) * (Math.max(0, rateBps) / 10_000));
}

// Allocate `total` across a set of non-negative components proportionally.
// This is used for partial refunds, where we want auditable, deterministic splits.
export function allocateProRata(
  components: Record<string, number>,
  totalToAllocate: number
): { allocations: Record<string, number>; roundingAdjustment: number } {
  const total = clampMoney(totalToAllocate);
  const keys = Object.keys(components);

  const normalized = keys.map((key) => ({ key, value: clampMoney(components[key] ?? 0) }));
  const base = normalized.reduce((sum, row) => sum + row.value, 0);

  if (total === 0 || base === 0) {
    return { allocations: Object.fromEntries(keys.map((k) => [k, 0])), roundingAdjustment: 0 };
  }

  const raw = normalized.map((row) => {
    const exact = (row.value / base) * total;
    const floored = Math.floor(exact);
    return { ...row, exact, floored, remainder: exact - floored };
  });

  let allocated = raw.reduce((sum, row) => sum + row.floored, 0);
  const allocations: Record<string, number> = Object.fromEntries(raw.map((row) => [row.key, row.floored]));

  // Distribute the leftover rupees by largest remainder for deterministic fairness.
  let remaining = total - allocated;
  if (remaining > 0) {
    const byRemainder = [...raw].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < byRemainder.length && remaining > 0; i += 1) {
      allocations[byRemainder[i].key] = (allocations[byRemainder[i].key] ?? 0) + 1;
      remaining -= 1;
      allocated += 1;
    }
  }

  return { allocations, roundingAdjustment: total - allocated };
}

