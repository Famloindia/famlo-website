import type {
  ChannelReadinessModel,
  ChannelSetupState,
  ChannelTestSyncReadinessModel,
} from "@/lib/channel-setup-state";

import type { ChannelProviderKey } from "./provider-registry";

export type CommonConnectionStageStatus = "done" | "in_progress" | "needed" | "blocked";

export type CommonConnectionStage = {
  key:
    | "listing"
    | "provider_access"
    | "channel_attachment"
    | "room_mapping"
    | "rate_mapping"
    | "test_sync";
  label: string;
  status: CommonConnectionStageStatus;
  note: string;
};

export type ProviderConnectionField = {
  key: "listing_id" | "property_code" | "listing_url" | "access_token";
  label: string;
  required: boolean;
  sensitive?: boolean;
};

export type ProviderConnectionModel = {
  providerKey: ChannelProviderKey;
  intro: string;
  whyNotFullyAutomatic: string;
  hostActionLabel: string;
  automationReality: string;
  commonStages: CommonConnectionStage[];
  requiredFields: ProviderConnectionField[];
};

function stageStatusFromReadiness(
  readinessStatus: "not_started" | "needed" | "in_progress" | "ready" | "blocked" | "not_available"
): CommonConnectionStageStatus {
  if (readinessStatus === "ready") return "done";
  if (readinessStatus === "in_progress") return "in_progress";
  if (readinessStatus === "blocked") return "blocked";
  return "needed";
}

function buildRequiredFields(providerKey: ChannelProviderKey): ProviderConnectionField[] {
  if (providerKey === "booking") {
    return [
      { key: "listing_id", label: "Booking.com Hotel ID", required: true },
      { key: "property_code", label: "Booking.com Property Code", required: false },
    ];
  }

  if (providerKey === "mmt") {
    return [
      { key: "listing_id", label: "MMT / Goibibo Hotel ID", required: true },
      { key: "property_code", label: "Hotel Code", required: false },
      { key: "listing_url", label: "Listing / extranet reference URL", required: false },
      { key: "access_token", label: "Access token", required: false, sensitive: true },
    ];
  }

  if (providerKey === "airbnb") {
    return [
      { key: "listing_id", label: "Airbnb Listing ID", required: false },
      { key: "property_code", label: "Owner host account reference", required: false },
      { key: "listing_url", label: "Listing URL", required: true },
    ];
  }

  if (providerKey === "agoda") {
    return [
      { key: "listing_id", label: "Agoda / YCS Property ID", required: true },
      { key: "property_code", label: "Hotel / YCS reference", required: false },
      { key: "listing_url", label: "Agoda or YCS reference URL", required: false },
    ];
  }

  if (providerKey === "expedia") {
    return [
      { key: "listing_id", label: "Expedia Property ID", required: true },
      { key: "property_code", label: "Min stay type setting", required: true },
      { key: "listing_url", label: "PartnerCentral reference URL", required: false },
    ];
  }

  return [
    { key: "listing_id", label: "Google Hotel feed / property reference", required: false },
    { key: "property_code", label: "Booking link template or GBP reference", required: false },
    { key: "listing_url", label: "Property / landing page URL", required: true },
  ];
}

function providerIntro(providerKey: ChannelProviderKey): string {
  if (providerKey === "booking") {
    return "Booking.com uses the same channel-master pattern as every OTA in Famlo: identify the listing, confirm Channex access, attach the channel, map rooms and prices, then test safely.";
  }

  if (providerKey === "mmt") {
    return "MakeMyTrip / Goibibo follows the same core path, but it usually needs Hotel ID and provider-issued connection details before Channex can attach the channel.";
  }

  if (providerKey === "airbnb") {
    return "Airbnb still follows the same core path, but account authorization replaces hotel-code style credentials.";
  }

  if (providerKey === "agoda") {
    return "Agoda follows the same core path, but YCS or Agoda channel-manager approval has to happen before mapping can begin.";
  }

  if (providerKey === "expedia") {
    return "Expedia follows the same core path, but Expedia partner setup has to exist before Famlo can move into mapping and sync checks.";
  }

  return "Google Hotel follows the same core path, but the connection is feed and visibility oriented rather than classic booking-feed OTA attachment.";
}

function providerAutomationReality(providerKey: ChannelProviderKey): string {
  if (providerKey === "booking") {
    return "Once Booking.com approval, channel attachment, mapping, and test sync are in place, Famlo can behave like the channel master for price, availability, and booking-feed operations.";
  }

  if (providerKey === "mmt") {
    return "MMT can become Famlo-controlled only after MMT approves Channex, the correct Channex property is attached, and room/rate mappings are verified.";
  }

  if (providerKey === "airbnb") {
    return "Airbnb can become simple for the host, but only after OAuth or listing authorization is real. That approval cannot be faked inside Famlo.";
  }

  if (providerKey === "agoda") {
    return "Agoda can become Famlo-controlled only after Agoda/YCS channel-manager setup is complete and the property structures are mapped correctly.";
  }

  if (providerKey === "expedia") {
    return "Expedia can become Famlo-controlled only after Expedia partner setup, room mapping, rate mapping, and sync checks pass.";
  }

  return "Google Hotel can become Famlo-controlled only when feed data, landing pages, rates, and property visibility checks are all clean.";
}

function providerAutomationBlocker(providerKey: ChannelProviderKey): string {
  if (providerKey === "booking") {
    return "Booking.com still requires extranet-side approval and a real Channex channel attachment before Famlo should push anything.";
  }

  if (providerKey === "mmt") {
    return "MMT / Goibibo still requires provider-issued access details and approval before Famlo can safely behave like the master channel.";
  }

  if (providerKey === "airbnb") {
    return "Airbnb still requires real account authorization. Famlo cannot safely skip OAuth or listing access checks.";
  }

  if (providerKey === "agoda") {
    return "Agoda still requires Agoda/YCS channel-manager approval. Famlo cannot truthfully connect it with only local room data.";
  }

  if (providerKey === "expedia") {
    return "Expedia still requires Expedia-side partner setup and verification before Famlo should behave like the master system.";
  }

  return "Google Hotel still requires feed and visibility readiness checks. It is not just a hotel-code connection.";
}

function connectLabel(providerKey: ChannelProviderKey): string {
  if (providerKey === "booking") return "Connect Booking.com";
  if (providerKey === "mmt") return "Connect MakeMyTrip / Goibibo";
  if (providerKey === "airbnb") return "Connect Airbnb";
  if (providerKey === "agoda") return "Connect Agoda";
  if (providerKey === "expedia") return "Connect Expedia";
  return "Connect Google Hotel";
}

export function buildProviderConnectionModel(input: {
  providerKey: ChannelProviderKey;
  state: ChannelSetupState;
  readinessModel: ChannelReadinessModel;
  testSyncReadiness: ChannelTestSyncReadinessModel;
}): ProviderConnectionModel {
  const { providerKey, readinessModel, testSyncReadiness, state } = input;
  const readinessByKey = new Map(readinessModel.items.map((item) => [item.key, item]));

  const providerAccessRequested =
    providerKey === "booking"
      ? state.metadata.booking_extranet_request_acknowledged === true
      : state.metadata.provider_extranet_request_acknowledged === true;

  const providerConnectionVisible =
    providerKey === "booking"
      ? state.metadata.booking_connection_status === "channel_visible_in_channex" ||
        state.metadata.operator_verified_booking_connection === true
      : state.metadata.provider_channel_attached === true;

  return {
    providerKey,
    intro: providerIntro(providerKey),
    whyNotFullyAutomatic: providerAutomationBlocker(providerKey),
    hostActionLabel: connectLabel(providerKey),
    automationReality: providerAutomationReality(providerKey),
    requiredFields: buildRequiredFields(providerKey),
    commonStages: [
      {
        key: "listing",
        label: "Listing identified",
        status: stageStatusFromReadiness(readinessByKey.get("ota_account_or_listing")?.status ?? "needed"),
        note: readinessByKey.get("ota_account_or_listing")?.explanation ?? "Identify the OTA listing or listing path first.",
      },
      {
        key: "provider_access",
        label: "Provider access approved",
        status:
          readinessByKey.get("connection_details")?.status === "ready" && providerAccessRequested
            ? "done"
            : providerAccessRequested
              ? "in_progress"
              : stageStatusFromReadiness(readinessByKey.get("connection_details")?.status ?? "needed"),
        note:
          providerKey === "booking"
            ? "The host usually has to request Channex or Famlo as connectivity provider in the OTA extranet."
            : "The OTA usually has to approve Channex, provider access, or host authorization before Famlo should continue.",
      },
      {
        key: "channel_attachment",
        label: "Channel attached in Channex",
        status:
          providerConnectionVisible
            ? "done"
            : stageStatusFromReadiness(readinessByKey.get("connection_verified")?.status ?? "needed"),
        note: "The correct OTA channel must be attached to the correct Channex property before mapping can be trusted.",
      },
      {
        key: "room_mapping",
        label: "Rooms mapped",
        status: stageStatusFromReadiness(readinessByKey.get("room_matching")?.status ?? "needed"),
        note: "Each Famlo room must map to a real provider room or Channex room structure.",
      },
      {
        key: "rate_mapping",
        label: "Rates mapped",
        status: stageStatusFromReadiness(readinessByKey.get("price_matching")?.status ?? "needed"),
        note: "Each Famlo price must map to the correct provider or Channex rate plan.",
      },
      {
        key: "test_sync",
        label: "Safe test sync passed",
        status:
          testSyncReadiness.status === "ready"
            ? "done"
            : testSyncReadiness.status === "blocked"
              ? "blocked"
              : testSyncReadiness.status === "assisted_only"
                ? "in_progress"
                : "needed",
        note: testSyncReadiness.nextRequiredAction,
      },
    ],
  };
}
