export type ChannelProviderKey = "booking" | "mmt" | "airbnb" | "agoda" | "expedia" | "google-hotel";

export type ChannelSetupMode = "self-serve" | "assisted";

export type ChannelProviderDefinition = {
  key: ChannelProviderKey;
  displayName: string;
  description: string;
  connectionMode: string;
  setupMode: ChannelSetupMode;
  requiredSetupItems: string[];
  supportsRoomMatching: boolean;
  supportsPriceMatching: boolean;
  supportsCalendarRateSync: boolean;
  hostInstructions: string[];
  operatorNotes: string[];
};

export const CHANNEL_PROVIDER_REGISTRY: ChannelProviderDefinition[] = [
  {
    key: "booking",
    displayName: "Booking.com",
    description: "Connect an existing Booking.com listing through Channex, then match rooms, rates, and sync readiness.",
    connectionMode: "Channex-assisted Booking.com connection",
    setupMode: "assisted",
    requiredSetupItems: [
      "Existing Booking.com listing or extranet access",
      "Property permission to connect through the channel manager",
      "Room type and rate plan identifiers",
      "Readiness check after mapping is complete",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Confirm the property is already listed on Booking.com.",
      "Use the guided connection flow to hand off listing details to the channel setup.",
      "Finish room matching, price matching, and a test sync before activation.",
    ],
    operatorNotes: [
      "Keep Booking.com-specific readiness visible, but do not surface raw Channex IDs in the host view.",
      "Use the advanced diagnostics panel for feed, ARI, and mapping checks.",
    ],
  },
  {
    key: "mmt",
    displayName: "MakeMyTrip / Goibibo",
    description: "Use the existing hotel code and assisted setup path before room and price matching can go live.",
    connectionMode: "Assisted hotel-code setup",
    setupMode: "assisted",
    requiredSetupItems: [
      "Existing MakeMyTrip or Goibibo listing",
      "MMT Hotel ID",
      "Access token if MMT provides one",
      "MMT extranet or support confirmation that Channex is enabled",
      "Room and rate mapping after the listing is prepared",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Open MMT / Goibibo, collect the Hotel ID, and enable Channex as the channel manager.",
      "Add the access token only when MMT actually issues one for this property.",
      "Expect assisted fallback until the provider becomes visible in Channex.",
    ],
    operatorNotes: [
      "Do not persist credentials yet.",
      "If a provider account or code is missing, stop at assisted setup and collect the missing listing details first.",
    ],
  },
  {
    key: "airbnb",
    displayName: "Airbnb",
    description: "Prepare Airbnb authorization and listing access before Famlo can map rooms, prices, and calendar sync.",
    connectionMode: "Host authorization and listing access",
    setupMode: "self-serve",
    requiredSetupItems: [
      "Airbnb owner account authorization",
      "Listing access for the property",
      "Listing URL or safe listing identity",
      "No conflicting old channel manager on the listing",
      "Readiness review before activation",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Use the Airbnb owner host account, not a co-host-only account.",
      "Disconnect any old PMS or channel manager first if Airbnb blocks the new connection.",
      "After approval, return to Famlo to preview and confirm room matching.",
    ],
    operatorNotes: [
      "Keep this flow honest: authorization is required before any connected state appears.",
      "No fake connected state should be shown until the account access is real.",
    ],
  },
  {
    key: "agoda",
    displayName: "Agoda",
    description: "Agoda needs channel-manager setup and mapping before the property can be activated.",
    connectionMode: "Agoda / YCS channel-manager setup",
    setupMode: "assisted",
    requiredSetupItems: [
      "Agoda Hotel ID",
      "Agoda YCS channel-manager mode enabled",
      "Channex selected in Agoda / YCS",
      "Room mapping identifiers",
      "Rate plan mapping identifiers",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Open Agoda YCS, enable channel manager mode, and select Channex.",
      "Keep the Agoda property already created before you connect it in Famlo.",
      "Use Famlo to preview and confirm mappings after Agoda becomes visible through Channex.",
    ],
    operatorNotes: [
      "Use the registry-driven wizard instead of custom Agoda screens.",
      "Keep activation disabled until listing access and mappings are confirmed.",
    ],
  },
  {
    key: "expedia",
    displayName: "Expedia",
    description: "Expedia requires property setup, mapping, and readiness checks before Famlo can activate it.",
    connectionMode: "Expedia partner / channel-manager setup",
    setupMode: "assisted",
    requiredSetupItems: [
      "Expedia Property ID",
      "Min stay type setting",
      "Channex selected in Expedia Connectivity Settings",
      "Property and room identity mapping",
      "Rate plan mapping",
      "Readiness check after the mapping pass",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Open Expedia Connectivity Settings and select Channex for Rates, Availability, and Reservations.",
      "Keep the Expedia Property ID and min stay type setting ready for Famlo.",
      "Complete preview, mapping, and sync review before any live expectation.",
    ],
    operatorNotes: [
      "This is an assisted setup surface, not a fake connected channel.",
      "Keep the readiness checks visible so activation never looks automatic.",
    ],
  },
  {
    key: "google-hotel",
    displayName: "Google Hotel",
    description: "Google Hotel is a feed and visibility setup, so readiness depends on clean property, room, and rate data.",
    connectionMode: "Feed and visibility setup",
    setupMode: "assisted",
    requiredSetupItems: [
      "Full property content: name, address, phone, country, latitude, longitude, timezone",
      "Policies: hotel policy, cancellation policy, facility list",
      "Photos and descriptions",
      "Room and rate feed readiness",
      "Booking-link template if using own booking engine",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Treat Google Hotel as a content and feed-readiness workflow, not a simple hotel-id connect.",
      "Prepare property content, geo details, policies, photos, and room/rate data first.",
      "Use Famlo readiness and mapping before expecting Google visibility to stabilize.",
    ],
    operatorNotes: [
      "Google Hotel should remain honest about being feed-driven.",
      "Do not imply a channel connection if the underlying feed is not ready.",
    ],
  },
];

export function getChannelProviderDefinition(key: ChannelProviderKey): ChannelProviderDefinition {
  return CHANNEL_PROVIDER_REGISTRY.find((provider) => provider.key === key) ?? CHANNEL_PROVIDER_REGISTRY[0];
}
