export const ROOM_AMENITY_GROUPS = {
  mustShow: ["WiFi", "AC / Fan", "Private bathroom", "Home-cooked food", "Parking"],
  secondary: ["Laundry", "Cleaning", "Power backup", "Work desk", "Geyser", "Towels", "First aid kit", "CCTV"],
  experience: ["Local city tour", "Cooking with host", "Village visit", "Yoga / meditation", "Local food experience"],
} as const;

export const ROOM_AMENITY_OPTIONS = Array.from(
  new Set([
    ...ROOM_AMENITY_GROUPS.mustShow,
    ...ROOM_AMENITY_GROUPS.secondary,
    ...ROOM_AMENITY_GROUPS.experience,
  ])
);

const AMENITY_ALIASES: Record<string, string> = {
  wifi: "WiFi",
  "wi-fi": "WiFi",
  "wi fi": "WiFi",
  ac: "AC / Fan",
  "ac fan": "AC / Fan",
  "ac / fan": "AC / Fan",
  parking: "Parking",
  cctv: "CCTV",
  "power backup": "Power backup",
  "powerbackup": "Power backup",
  laundry: "Laundry",
  "work desk": "Work desk",
  "workdesk": "Work desk",
  "first aid kit": "First aid kit",
  "firstaidkit": "First aid kit",
  "village visit": "Village visit",
  "villagevisit": "Village visit",
  "local food experience": "Local food experience",
  "localfoodexperience": "Local food experience",
  "yoga meditation": "Yoga / meditation",
  "yoga / meditation": "Yoga / meditation",
  "yogameditation": "Yoga / meditation",
  "private bathroom": "Private bathroom",
  "privatebathroom": "Private bathroom",
  "kitchen access": "Kitchen access",
  "kitchenaccess": "Kitchen access",
  "hot water": "Hot water",
  "hotwater": "Hot water",
  tv: "TV",
  refrigerator: "Refrigerator",
  cupboard: "Cupboard",
  balcony: "Balcony",
  "garden view": "Garden view",
  "gardenview": "Garden view",
  "mountain view": "Mountain view",
  "mountainview": "Mountain view",
  campfire: "Campfire",
  "swimming pool": "Swimming pool",
  "swimmingpool": "Swimming pool",
  "pet friendly": "Pet friendly",
  "petfriendly": "Pet friendly",
  "bonfire area": "Bonfire area",
  "bonfirearea": "Bonfire area",
  "home-cooked food": "Home-cooked food",
  "home cooked food": "Home-cooked food",
  cleaning: "Cleaning",
  geyser: "Geyser",
  towels: "Towels",
  "local city tour": "Local city tour",
  "cooking with host": "Cooking with host",
};

function normalizeAmenityKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAmenityLabel(value: string): string {
  const key = normalizeAmenityKey(value);
  return AMENITY_ALIASES[key] ?? value.trim();
}

export function normalizeAmenityList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeAmenityLabel(value))
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}
