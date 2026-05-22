import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";

export type OtaConnectId =
  | "booking_com"
  | "mmt_goibibo"
  | "agoda"
  | "expedia"
  | "airbnb";

export type OtaConnectFieldConfig = {
  key: string;
  label: string;
  inputType: "text" | "url" | "password";
  required: boolean;
  placeholderExample: string;
};

export type OtaConnectConfig = {
  id: OtaConnectId;
  providerKey: ChannelProviderKey;
  displayName: string;
  requiredFields: OtaConnectFieldConfig[];
  instructions: string[];
  channexChannelCode: string;
  placeholderExamples: Record<string, string>;
};

export const OTA_CONNECT_CONFIGS: readonly OtaConnectConfig[] = [
  {
    id: "booking_com",
    providerKey: "booking",
    displayName: "Booking.com",
    channexChannelCode: "BDC",
    requiredFields: [
      { key: "bookingHotelId", label: "Booking.com hotel ID", inputType: "text", required: false, placeholderExample: "Example: 1234567" },
      { key: "bookingPropertyCode", label: "Booking.com property code", inputType: "text", required: false, placeholderExample: "Example: BKG-DEL-001" },
    ],
    instructions: [
      "Open your Booking.com extranet for this property.",
      "Copy the hotel ID or property code from the property account.",
      "Confirm Channex is enabled or requested as the channel manager before continuing.",
    ],
    placeholderExamples: {
      bookingHotelId: "1234567",
      bookingPropertyCode: "BKG-DEL-001",
    },
  },
  {
    id: "mmt_goibibo",
    providerKey: "mmt",
    displayName: "MakeMyTrip / Goibibo",
    channexChannelCode: "MMT",
    requiredFields: [
      { key: "providerListingId", label: "MMT / Goibibo hotel ID", inputType: "text", required: true, placeholderExample: "Example: MMT-45892" },
      { key: "providerPropertyCode", label: "Hotel code", inputType: "text", required: false, placeholderExample: "Example: GIB-DEL-12" },
      { key: "providerListingUrl", label: "Listing or extranet URL", inputType: "url", required: false, placeholderExample: "https://..." },
      { key: "providerAccessToken", label: "Access token if issued by MMT", inputType: "password", required: false, placeholderExample: "Paste token if MMT shared one" },
    ],
    instructions: [
      "Open the MakeMyTrip / Goibibo property account that already lists this room.",
      "Copy the hotel ID and hotel code shown in the OTA account.",
      "Paste an access token only if MMT issued one for this property.",
    ],
    placeholderExamples: {
      providerListingId: "MMT-45892",
      providerPropertyCode: "GIB-DEL-12",
      providerListingUrl: "https://...",
    },
  },
  {
    id: "agoda",
    providerKey: "agoda",
    displayName: "Agoda",
    channexChannelCode: "AGO",
    requiredFields: [
      { key: "providerListingId", label: "Agoda / YCS property ID", inputType: "text", required: true, placeholderExample: "Example: AGO-99812" },
      { key: "providerPropertyCode", label: "Agoda hotel reference", inputType: "text", required: false, placeholderExample: "Example: AGD-IND-22" },
      { key: "providerListingUrl", label: "Agoda or YCS URL", inputType: "url", required: false, placeholderExample: "https://..." },
    ],
    instructions: [
      "Open Agoda YCS for the property where this room is already listed.",
      "Copy the Agoda property ID or YCS reference.",
      "Confirm Channex is selected as the channel manager in Agoda before previewing.",
    ],
    placeholderExamples: {
      providerListingId: "AGO-99812",
      providerPropertyCode: "AGD-IND-22",
      providerListingUrl: "https://...",
    },
  },
  {
    id: "expedia",
    providerKey: "expedia",
    displayName: "Expedia",
    channexChannelCode: "EXP",
    requiredFields: [
      { key: "providerListingId", label: "Expedia property ID", inputType: "text", required: true, placeholderExample: "Example: EXP-55431" },
      { key: "providerPropertyCode", label: "Min stay type or property reference", inputType: "text", required: false, placeholderExample: "Example: Stay-through" },
      { key: "providerListingUrl", label: "Partner Central URL", inputType: "url", required: false, placeholderExample: "https://..." },
    ],
    instructions: [
      "Open Expedia Partner Central for the listed property.",
      "Copy the Expedia property ID and any stay-rule reference used in connectivity settings.",
      "Confirm Channex is selected for Rates, Availability, and Reservations before previewing.",
    ],
    placeholderExamples: {
      providerListingId: "EXP-55431",
      providerPropertyCode: "Stay-through",
      providerListingUrl: "https://...",
    },
  },
  {
    id: "airbnb",
    providerKey: "airbnb",
    displayName: "Airbnb",
    channexChannelCode: "ABB",
    requiredFields: [
      { key: "providerListingId", label: "Airbnb listing ID", inputType: "text", required: false, placeholderExample: "Example: 54278124" },
      { key: "providerPropertyCode", label: "Owner host account reference", inputType: "text", required: true, placeholderExample: "Example: owner@email.com" },
      { key: "providerListingUrl", label: "Airbnb listing URL", inputType: "url", required: false, placeholderExample: "https://www.airbnb.com/rooms/..." },
    ],
    instructions: [
      "Open the owner Airbnb account for the property that already lists this room.",
      "Copy the owner-host reference and the listing URL or listing ID.",
      "Return to Famlo Pro and preview the Channex match before sync starts.",
    ],
    placeholderExamples: {
      providerListingId: "54278124",
      providerPropertyCode: "owner@email.com",
      providerListingUrl: "https://www.airbnb.com/rooms/54278124",
    },
  },
] as const;

export function getOtaConnectConfig(otaId: OtaConnectId): OtaConnectConfig {
  const config = OTA_CONNECT_CONFIGS.find((item) => item.id === otaId);
  if (!config) {
    throw new Error(`Unsupported OTA: ${otaId}`);
  }
  return config;
}

export function isOtaConnectId(value: unknown): value is OtaConnectId {
  return typeof value === "string" && OTA_CONNECT_CONFIGS.some((config) => config.id === value);
}

export function mapProviderKeyToOtaConnectId(providerKey: ChannelProviderKey): OtaConnectId | null {
  if (providerKey === "booking") return "booking_com";
  if (providerKey === "mmt") return "mmt_goibibo";
  if (providerKey === "agoda") return "agoda";
  if (providerKey === "expedia") return "expedia";
  if (providerKey === "airbnb") return "airbnb";
  return null;
}
