export const BATHROOM_TYPE_OPTIONS = [
  "Private attached",
  "Private shared",
  "Shared",
  "Host shared",
] as const;

export const FOOD_OFFERING_OPTIONS = ["Veg", "Non-veg", "Protein+"] as const;

export const AMENITY_OPTIONS = [
  "Wi-Fi",
  "Air conditioning",
  "Hot shower",
  "Filtered water",
  "Parking",
  "Kitchen access",
  "Fresh linen",
  "Towels",
  "Common TV",
  "Lockable room",
] as const;

export const DEFAULT_EXPERIENCE_CARDS = [
  {
    title: "Genuine connections",
    description: "Stay with verified, trained hosts and real families curated for warmth and safety.",
  },
  {
    title: "Home-cooked nutrition",
    description: "Locally sourced meals and a softer hospitality rhythm built into the stay.",
  },
  {
    title: "Verified and safe",
    description: "Background-checked hosts, safer booking flow, and Famlo support inside the platform.",
  },
  {
    title: "Truly affordable",
    description: "Pick only the quarter you need and pay for your actual visit pattern.",
  },
] as const;

export function parseMultiValueList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeMultiValueList(values: string[]): string {
  return values.join("\n");
}

export function toggleListValue(values: string[], nextValue: string): string[] {
  const normalized = nextValue.trim();
  if (!normalized) return values;
  return values.some((item) => item.toLowerCase() === normalized.toLowerCase())
    ? values.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
    : [...values, normalized];
}
