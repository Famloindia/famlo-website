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
      "Hotel ID or Hotel Code",
      "Connection details from the channel or channel manager",
      "Room and rate mapping after the listing is prepared",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Keep the Hotel ID / Hotel Code ready before setup begins.",
      "Treat this as an assisted flow until secure token storage exists.",
      "Match rooms and prices only after the listing has been confirmed.",
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
      "Airbnb account authorization",
      "Listing access for the property",
      "Room or listing identity to map",
      "Readiness review before activation",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Authorize the Airbnb account that already owns the listing.",
      "Confirm which listing should be connected before any mapping starts.",
      "Use the wizard to prepare room and price matching before activation.",
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
      "Agoda or YCS channel-manager access",
      "Property assignment from Agoda or the provider",
      "Room mapping identifiers",
      "Rate plan mapping identifiers",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Treat Agoda as an assisted setup path.",
      "Prepare the property and mapping details before asking for activation.",
      "Do not expect a one-click connection.",
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
      "Expedia property or partner setup",
      "Property and room identity mapping",
      "Rate plan mapping",
      "Readiness check after the mapping pass",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Start with the Expedia property that is already owned or approved.",
      "Collect the property and rate-plan details before any activation attempt.",
      "Complete mapping and test sync before the property can go live.",
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
      "Google Hotel / feed visibility requirements",
      "Property profile and landing page readiness",
      "Room and rate feed readiness",
      "Policy and booking-link validation",
    ],
    supportsRoomMatching: true,
    supportsPriceMatching: true,
    supportsCalendarRateSync: true,
    hostInstructions: [
      "Treat Google Hotel as a feed-readiness workflow, not a live OTA toggle.",
      "Prepare the property story, room data, and pricing before asking for visibility setup.",
      "Use the readiness checks to decide when the feed is clean enough to publish.",
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

