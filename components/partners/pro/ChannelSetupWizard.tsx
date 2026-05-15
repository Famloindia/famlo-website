"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { buildProviderConnectionModel } from "@/lib/channel-providers/connection-model";
import { getProviderMutationPrimitiveAudit } from "@/lib/channel-providers/provider-mutation-primitives";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { getChannelProviderDefinition } from "@/lib/channel-providers/provider-registry";
import {
  createDefaultChannelSetupState,
  type ChannelReadinessItem,
  type ChannelReadinessModel,
  type ChannelGoLiveReadinessModel,
  type ChannelTestSyncReadinessModel,
  getChannelSetupStatusLabel,
  getChannelSetupStepLabel,
  type ChannelSetupState,
  type ChannelSetupStep,
} from "@/lib/channel-setup-state";
import styles from "./pro-dashboard.module.css";

export type ChannelSetupWizardSummary = {
  statusLabel: string;
  nextStep: string;
  listedOnOtaLabel: string;
  requirementsLabel: string;
  connectionLabel: string;
  roomMatchingLabel: string;
  priceMatchingLabel: string;
  syncReadinessLabel: string;
  testSyncLabel?: string;
  activationLabel: string;
  activationReady: boolean;
  activationBlockedReason: string;
  readinessLines: string[];
};

type ProviderMappingOption = {
  id: string;
  title: string | null;
  roomTypeId?: string | null;
};

type ProviderMappingRoom = {
  id: string;
  name: string;
  unitType: string;
  isActive: boolean;
  basePrice: number;
  currentRoomTypeId: string | null;
  currentRatePlanId: string | null;
};

type ProviderMappingWorkspace = {
  refreshedAt: string | null;
  roomTypes: ProviderMappingOption[];
  ratePlans: ProviderMappingOption[];
  rooms: ProviderMappingRoom[];
};

type ProviderPreviewRow = {
  roomId: string;
  famloRoomName: string;
  famloRoomType: string;
  suggestedRoomTypeId: string | null;
  suggestedRoomTypeTitle: string | null;
  suggestedRatePlanId: string | null;
  suggestedRatePlanTitle: string | null;
  confidence: "high" | "medium" | "low";
  autoApplicable: boolean;
};

type ProviderPreviewWorkspace = {
  refreshedAt: string | null;
  autoApplicableCount: number;
  suggestions: ProviderPreviewRow[];
};

type ChannelSetupWizardProps = {
  providerKey: ChannelProviderKey;
  familyId: string;
  channexPropertyId: string | null;
  summary: ChannelSetupWizardSummary;
  readinessModel: ChannelReadinessModel;
  testSyncReadiness: ChannelTestSyncReadinessModel;
  goLiveReadiness: ChannelGoLiveReadinessModel;
  matchingSnapshot: {
    providerDataAvailable: boolean;
    providerDataLabel: string;
    roomRows: Array<{
      famloRoomName: string;
      famloRoomType: string;
      isActive: boolean;
      basePriceLabel: string;
      photoReadinessLabel: string;
      providerRoomLabel: string;
      statusLabel: "matched" | "needs match" | "provider room unavailable" | "needs channel connection";
      note: string | null;
    }>;
    rateRows: Array<{
      famloRoomName: string;
      famloRoomType: string;
      isActive: boolean;
      basePriceLabel: string;
      providerRateLabel: string;
      statusLabel: "matched" | "needs match" | "provider rate unavailable" | "needs channel connection";
      note: string | null;
    }>;
    reviewLabel: string;
  };
  initialState?: ChannelSetupState | null;
  onClose: () => void;
  onSaved?: (state: ChannelSetupState) => void;
  onOpenRoomMatching?: () => void;
  onOpenPriceMatching?: () => void;
};

const STEP_ORDER: ChannelSetupStep[] = [
  "listing",
  "requirements",
  "connection",
  "room_matching",
  "price_matching",
  "test_sync",
  "activate",
];

function getAssistedConnectionLabels(providerKey: ChannelProviderKey): {
  listingIdLabel: string;
  propertyCodeLabel: string;
  listingUrlLabel: string;
  placeholderId: string;
  placeholderCode: string;
  placeholderUrl: string;
  instruction: string;
} {
  if (providerKey === "mmt") {
    return {
      listingIdLabel: "MMT / Goibibo Hotel ID",
      propertyCodeLabel: "Hotel Code",
      listingUrlLabel: "Listing / extranet reference URL",
      placeholderId: "Example: MMT hotel id",
      placeholderCode: "Example: GI hotel code",
      placeholderUrl: "Optional listing or extranet URL",
      instruction: "Enter the safe hotel identifiers. Do not paste access tokens, passwords, or private contract credentials.",
    };
  }

  if (providerKey === "airbnb") {
    return {
      listingIdLabel: "Airbnb Listing ID",
      propertyCodeLabel: "Airbnb account / host reference",
      listingUrlLabel: "Airbnb listing URL",
      placeholderId: "Example: listing id",
      placeholderCode: "Optional host/account reference",
      placeholderUrl: "https://www.airbnb.com/rooms/...",
      instruction: "Add the listing reference only. OAuth/login authorization is still assisted and no password is stored here.",
    };
  }

  if (providerKey === "agoda") {
    return {
      listingIdLabel: "Agoda / YCS Property ID",
      propertyCodeLabel: "Agoda Hotel Code",
      listingUrlLabel: "Agoda or YCS reference URL",
      placeholderId: "Example: Agoda property id",
      placeholderCode: "Optional hotel code",
      placeholderUrl: "Optional Agoda/YCS URL",
      instruction: "Collect the Agoda/YCS property reference so Famlo can verify channel-manager setup manually.",
    };
  }

  if (providerKey === "expedia") {
    return {
      listingIdLabel: "Expedia Property ID",
      propertyCodeLabel: "Expedia Hotel Code",
      listingUrlLabel: "Expedia PartnerCentral reference URL",
      placeholderId: "Example: Expedia property id",
      placeholderCode: "Optional hotel code",
      placeholderUrl: "Optional PartnerCentral URL",
      instruction: "Collect the Expedia property reference only. Contract credentials and secure provider access are not stored here.",
    };
  }

  return {
    listingIdLabel: "Google Hotel / Place ID",
    propertyCodeLabel: "Google Business Profile reference",
    listingUrlLabel: "Google property / search URL",
    placeholderId: "Example: Place ID or hotel feed id",
    placeholderCode: "Optional GBP reference",
    placeholderUrl: "Optional Google listing URL",
    instruction: "Google Hotel is feed/readiness driven. Capture only safe identifiers for operator review.",
  };
}

export default function ChannelSetupWizard({
  providerKey,
  familyId,
  channexPropertyId,
  summary,
  readinessModel,
  testSyncReadiness,
  goLiveReadiness,
  matchingSnapshot,
  initialState,
  onClose,
  onSaved,
  onOpenRoomMatching,
  onOpenPriceMatching,
}: Readonly<ChannelSetupWizardProps>) {
  const provider = getChannelProviderDefinition(providerKey);
  const [state, setState] = useState<ChannelSetupState>(() => initialState ?? createDefaultChannelSetupState(familyId, providerKey));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [bookingHotelIdInput, setBookingHotelIdInput] = useState("");
  const [bookingPropertyCodeInput, setBookingPropertyCodeInput] = useState("");
  const [bookingExtranetRequested, setBookingExtranetRequested] = useState(false);
  const [providerListingIdInput, setProviderListingIdInput] = useState("");
  const [providerPropertyCodeInput, setProviderPropertyCodeInput] = useState("");
  const [providerListingUrlInput, setProviderListingUrlInput] = useState("");
  const [providerAccessTokenInput, setProviderAccessTokenInput] = useState("");
  const [providerExtranetRequested, setProviderExtranetRequested] = useState(false);
  const [isOpeningChannexWorkspace, setIsOpeningChannexWorkspace] = useState(false);
  const [isRefreshingFromChannex, setIsRefreshingFromChannex] = useState(false);
  const [isLoadingMappingWorkspace, setIsLoadingMappingWorkspace] = useState(false);
  const [isSavingMappingByRoomId, setIsSavingMappingByRoomId] = useState<Record<string, boolean>>({});
  const [channexWorkspaceUrl, setChannexWorkspaceUrl] = useState<string | null>(null);
  const [channexWorkspaceHint, setChannexWorkspaceHint] = useState<string | null>(null);
  const [mappingWorkspace, setMappingWorkspace] = useState<ProviderMappingWorkspace | null>(null);
  const [roomTypeDrafts, setRoomTypeDrafts] = useState<Record<string, string>>({});
  const [ratePlanDrafts, setRatePlanDrafts] = useState<Record<string, string>>({});
  const [previewWorkspace, setPreviewWorkspace] = useState<ProviderPreviewWorkspace | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isApplyingPreview, setIsApplyingPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadLatestState = async (): Promise<void> => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/host/pro/channel/setup?familyId=${encodeURIComponent(familyId)}`);
        const payload = (await response.json()) as { states?: ChannelSetupState[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load channel setup state.");
        }

        const latestState = payload.states?.find((entry) => entry.providerKey === providerKey) ?? initialState ?? createDefaultChannelSetupState(familyId, providerKey);
        if (!cancelled) {
          setState(latestState);
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback(error instanceof Error ? error.message : "Failed to load channel setup state.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadLatestState();
    return () => {
      cancelled = true;
    };
  }, [familyId, providerKey, initialState]);

  const loadMappingWorkspace = async (): Promise<void> => {
    setIsLoadingMappingWorkspace(true);
    try {
      const response = await fetch(
        `/api/host/pro/channel/mappings?familyId=${encodeURIComponent(familyId)}&providerKey=${encodeURIComponent(providerKey)}`
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        catalog?: {
          refreshedAt?: string | null;
          roomTypes?: Array<{ id: string; title: string | null }>;
          ratePlans?: Array<{ id: string; title: string | null; room_type_id?: string | null }>;
        };
        rooms?: Array<{
          id: string;
          name: string;
          unitType: string;
          isActive: boolean;
          basePrice: number;
          currentRoomTypeId: string | null;
          currentRatePlanId: string | null;
        }>;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load provider mapping workspace.");
      }

      const workspace: ProviderMappingWorkspace = {
        refreshedAt: typeof payload.catalog?.refreshedAt === "string" ? payload.catalog.refreshedAt : null,
        roomTypes: Array.isArray(payload.catalog?.roomTypes)
          ? payload.catalog.roomTypes.map((item) => ({ id: item.id, title: item.title ?? null }))
          : [],
        ratePlans: Array.isArray(payload.catalog?.ratePlans)
          ? payload.catalog.ratePlans.map((item) => ({ id: item.id, title: item.title ?? null, roomTypeId: item.room_type_id ?? null }))
          : [],
        rooms: Array.isArray(payload.rooms)
          ? payload.rooms.map((room) => ({
              id: room.id,
              name: room.name,
              unitType: room.unitType,
              isActive: Boolean(room.isActive),
              basePrice: typeof room.basePrice === "number" ? room.basePrice : 0,
              currentRoomTypeId: room.currentRoomTypeId ?? null,
              currentRatePlanId: room.currentRatePlanId ?? null,
            }))
          : [],
      };

      setMappingWorkspace(workspace);
      setRoomTypeDrafts(
        Object.fromEntries(workspace.rooms.map((room) => [room.id, room.currentRoomTypeId ?? ""]))
      );
      setRatePlanDrafts(
        Object.fromEntries(workspace.rooms.map((room) => [room.id, room.currentRatePlanId ?? ""]))
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to load provider mapping workspace.");
    } finally {
      setIsLoadingMappingWorkspace(false);
    }
  };

  const loadPreviewWorkspace = async (): Promise<void> => {
    setIsLoadingPreview(true);
    try {
      const response = await fetch(
        `/api/host/pro/channel/preview?familyId=${encodeURIComponent(familyId)}&providerKey=${encodeURIComponent(providerKey)}`
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        refreshedAt?: string | null;
        autoApplicableCount?: number;
        suggestions?: ProviderPreviewRow[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load provider preview.");
      }

      setPreviewWorkspace({
        refreshedAt: typeof payload.refreshedAt === "string" ? payload.refreshedAt : null,
        autoApplicableCount: typeof payload.autoApplicableCount === "number" ? payload.autoApplicableCount : 0,
        suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to load provider preview.");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    void loadMappingWorkspace();
  }, [familyId, providerKey]);

  useEffect(() => {
    void loadPreviewWorkspace();
  }, [familyId, providerKey]);

  useEffect(() => {
    setBookingHotelIdInput(state.metadata.booking_hotel_id ?? "");
    setBookingPropertyCodeInput(state.metadata.booking_property_code ?? "");
    setBookingExtranetRequested(state.metadata.booking_extranet_request_acknowledged === true);
    setProviderListingIdInput(state.metadata.provider_listing_id ?? "");
    setProviderPropertyCodeInput(state.metadata.provider_property_code ?? "");
    setProviderListingUrlInput(state.metadata.provider_listing_url ?? "");
    setProviderExtranetRequested(state.metadata.provider_extranet_request_acknowledged === true);
  }, [
    state.metadata.booking_extranet_request_acknowledged,
    state.metadata.booking_hotel_id,
    state.metadata.booking_property_code,
    state.metadata.provider_listing_id,
    state.metadata.provider_listing_url,
    state.metadata.provider_property_code,
    state.metadata.provider_extranet_request_acknowledged,
  ]);

  const currentStepIndex = Math.max(0, STEP_ORDER.indexOf(state.currentStep ?? "listing"));
  const currentStepLabel = getChannelSetupStepLabel(state.currentStep);
  const currentStatusLabel = getChannelSetupStatusLabel(state.status);
  const readinessItems = readinessModel.items;
  const assistedConnectionLabels = providerKey === "booking" ? null : getAssistedConnectionLabels(providerKey);
  const showAdvancedReadiness = false;
  const connectionModel = buildProviderConnectionModel({
    providerKey,
    state,
    readinessModel,
    testSyncReadiness,
  });
  const providerConnectionStatusLabel =
    state.metadata.provider_connection_status === "waiting_for_ota_approval"
      ? "Waiting for OTA approval"
      : state.metadata.provider_connection_status === "details_submitted"
        ? "Details submitted, Famlo will verify"
        : state.metadata.provider_connection_status === "ota_approval_verified"
          ? "OTA approval verified"
          : state.metadata.provider_connection_status === "channel_visible_in_channex"
            ? "Channel visible in Channex"
          : state.metadata.provider_connection_status === "verification_failed"
            ? "Verification failed"
            : state.metadata.provider_connection_status ?? "Not requested";
  const mutationAudit = getProviderMutationPrimitiveAudit(providerKey);

  const savedStateSummary = useMemo(
    () => [
      { label: "Status", value: currentStatusLabel },
      { label: "Step", value: currentStepLabel },
      { label: "Setup mode", value: state.setupMode === "existing_listing" ? "Existing listing" : state.setupMode === "prepare_listing" ? "Prepare listing" : "Not chosen yet" },
      { label: "Updated", value: state.updatedAt ?? state.metadata.updated_at ?? "Not saved yet" },
      { label: "Progress", value: `${readinessModel.progressPercent}%` },
    ],
    [currentStatusLabel, currentStepLabel, readinessModel.progressPercent, state.metadata.updated_at, state.setupMode, state.updatedAt]
  );

  const saveState = async (patch: Partial<Pick<ChannelSetupState, "status" | "setupMode" | "currentStep" | "lastError">> & {
    metadataPatch?: Record<string, unknown>;
  }): Promise<void> => {
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/host/pro/channel/setup", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          familyId,
          providerKey,
          ...patch,
        }),
      });

      const payload = (await response.json()) as { state?: ChannelSetupState; error?: string };
      if (!response.ok || !payload.state) {
        throw new Error(payload.error ?? "Failed to save channel setup state.");
      }

      setState(payload.state);
      onSaved?.(payload.state);
      setFeedback("Saved safely");
      void loadMappingWorkspace();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save channel setup state.");
    } finally {
      setIsSaving(false);
    }
  };

  const openRealChannexWorkspace = async (): Promise<void> => {
    if (!channexPropertyId) {
      setFeedback("Create the Channex property first, then open the real channel workspace.");
      return;
    }

    setIsOpeningChannexWorkspace(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/host/pro/channel/channex/iframe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          familyId,
          providerKey,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        iframeUrl?: string;
        providerHint?: string;
        error?: string;
      };

      if (!response.ok || !payload.iframeUrl) {
        throw new Error(payload.error ?? "Unable to open the real Channex workspace.");
      }

      setChannexWorkspaceUrl(payload.iframeUrl);
      setChannexWorkspaceHint(payload.providerHint ?? null);
      setFeedback("Opened the real Channex workspace for this property.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to open the real Channex workspace.");
    } finally {
      setIsOpeningChannexWorkspace(false);
    }
  };

  const refreshFromChannex = async (): Promise<void> => {
    if (!channexPropertyId) {
      setFeedback("Create the Channex property first, then refresh provider connection state.");
      return;
    }

    setIsRefreshingFromChannex(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/host/pro/channel/channex/provider-refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          familyId,
          providerKey,
        }),
      });

      const payload = (await response.json()) as { state?: ChannelSetupState; message?: string; error?: string };
      if (!response.ok || !payload.state) {
        throw new Error(payload.error ?? "Unable to refresh provider state from Channex.");
      }

      setState(payload.state);
      onSaved?.(payload.state);
      setFeedback(payload.message ?? "Refreshed provider state from Channex.");
      void loadMappingWorkspace();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to refresh provider state from Channex.");
    } finally {
      setIsRefreshingFromChannex(false);
    }
  };

  const saveMappingForRoom = async (roomId: string): Promise<void> => {
    setIsSavingMappingByRoomId((current) => ({ ...current, [roomId]: true }));
    setFeedback(null);

    try {
      const response = await fetch("/api/host/pro/channel/mappings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          familyId,
          providerKey,
          stayUnitId: roomId,
          externalRoomTypeId: roomTypeDrafts[roomId] || null,
          externalRatePlanId: ratePlanDrafts[roomId] || null,
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Unable to save mapping.");
      }

      setFeedback(payload.message ?? "Mapping saved.");
      await loadMappingWorkspace();
      await loadPreviewWorkspace();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to save mapping.");
    } finally {
      setIsSavingMappingByRoomId((current) => ({ ...current, [roomId]: false }));
    }
  };

  const connectProvider = (): void => {
    void (async () => {
      setIsSaving(true);
      setFeedback(null);

      try {
        const response = await fetch("/api/host/pro/channel/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            familyId,
            providerKey,
            bookingHotelId: bookingHotelIdInput,
            bookingPropertyCode: bookingPropertyCodeInput,
            bookingExtranetRequested: bookingExtranetRequested,
            providerListingId: providerListingIdInput,
            providerPropertyCode: providerPropertyCodeInput,
            providerListingUrl: providerListingUrlInput,
            providerExtranetRequested: providerExtranetRequested,
            providerAccessToken: providerAccessTokenInput,
          }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          iframeUrl?: string | null;
          providerHint?: string | null;
          state?: ChannelSetupState | null;
          mode?: "workspace_required" | "ready_for_preview";
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to start provider connection.");
        }

        if (payload.state) {
          setState(payload.state);
          onSaved?.(payload.state);
        }

        if (payload.iframeUrl) {
          setChannexWorkspaceUrl(payload.iframeUrl);
          setChannexWorkspaceHint(payload.providerHint ?? null);
        }

        if (providerKey === "mmt") {
          setProviderAccessTokenInput("");
        }

        setFeedback(
          payload.mode === "ready_for_preview"
            ? payload.message ?? "Channel is already visible. Load preview and confirm the suggested mappings."
            : payload.message ?? "Connection details saved. Continue inside the embedded secure connector."
        );

        await loadPreviewWorkspace();
        await loadMappingWorkspace();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to start provider connection.");
      } finally {
        setIsSaving(false);
      }
    })();
  };

  const applyPreviewMappings = (): void => {
    void (async () => {
      setIsApplyingPreview(true);
      setFeedback(null);
      try {
        const response = await fetch("/api/host/pro/channel/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            familyId,
            providerKey,
          }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          state?: ChannelSetupState | null;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to apply suggested mappings.");
        }

        if (payload.state) {
          setState(payload.state);
          onSaved?.(payload.state);
        }

        setFeedback(payload.message ?? "Suggested mappings applied.");
        await loadPreviewWorkspace();
        await loadMappingWorkspace();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to apply suggested mappings.");
      } finally {
        setIsApplyingPreview(false);
      }
    })();
  };

  const selectListingMode = (setupMode: ChannelSetupState["setupMode"], hasExistingListing: boolean): void => {
    void saveState({
      setupMode,
      status: hasExistingListing ? "setup_started" : "needs_details",
      currentStep: "requirements",
      metadataPatch: {
        existing_listing_confirmed: hasExistingListing,
        listing_preparation_requested: !hasExistingListing,
      },
    });
  };

  const requestHelp = (): void => {
    void saveState({
      status: "connection_requested",
      currentStep: "connection",
      metadataPatch: {
        requested_at: new Date().toISOString(),
        operator_setup_requested: true,
      },
    });
  };

  const requestBookingVerification = (): void => {
    const normalizedHotelId = bookingHotelIdInput.trim();
    const normalizedPropertyCode = bookingPropertyCodeInput.trim();

    if (!normalizedHotelId && !normalizedPropertyCode) {
      setFeedback("Add a Booking.com Hotel ID or Property Code before requesting verification.");
      return;
    }

    if (!bookingExtranetRequested) {
      setFeedback("Confirm that Channex or Famlo was requested as the connectivity provider in Booking.com extranet first.");
      return;
    }

    void saveState({
      status: "connection_requested",
      currentStep: "connection",
      metadataPatch: {
        booking_hotel_id: normalizedHotelId,
        booking_property_code: normalizedPropertyCode,
        booking_extranet_request_acknowledged: true,
        connectivity_provider_requested: true,
        connectivity_provider_requested_at: new Date().toISOString(),
        booking_connection_status: "verification_requested",
        booking_connection_error: null,
        hotel_id_available: Boolean(normalizedHotelId || normalizedPropertyCode),
        operator_setup_requested: true,
      },
    });
  };

  const storeProviderCredential = async (credentialValue: string): Promise<ChannelSetupState | null> => {
    const response = await fetch("/api/host/pro/channel/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        familyId,
        providerKey,
        credentialType: "access_token",
        credentialValue,
      }),
    });

    const payload = (await response.json()) as { state?: ChannelSetupState; error?: string; message?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to store provider credential securely.");
    }

    if (payload.state) {
      setState(payload.state);
      onSaved?.(payload.state);
    }

    return payload.state ?? null;
  };

  const requestAssistedProviderVerification = (): void => {
    const normalizedListingId = providerListingIdInput.trim();
    const normalizedPropertyCode = providerPropertyCodeInput.trim();
    const normalizedListingUrl = providerListingUrlInput.trim();
    const normalizedAccessToken = providerAccessTokenInput.trim();

    if (!normalizedListingId && !normalizedPropertyCode && !normalizedListingUrl) {
      setFeedback("Add at least one safe provider identifier before requesting Famlo verification.");
      return;
    }

    void (async () => {
      setIsSaving(true);
      setFeedback(null);
      try {
        if (providerKey === "mmt" && normalizedAccessToken) {
          await storeProviderCredential(normalizedAccessToken);
          setProviderAccessTokenInput("");
        }

        await saveState({
          status: "connection_requested",
          currentStep: "connection",
          metadataPatch: {
            provider_listing_id: normalizedListingId,
            provider_property_code: normalizedPropertyCode,
            provider_listing_url: normalizedListingUrl,
            provider_extranet_request_acknowledged: providerExtranetRequested,
            provider_connection_status: providerExtranetRequested ? "details_submitted" : "waiting_for_ota_approval",
            provider_connection_error: null,
            provider_verification_requested_at: new Date().toISOString(),
            hotel_id_available: true,
            operator_setup_requested: true,
          },
        });
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to connect provider.");
      } finally {
        setIsSaving(false);
      }
    })();
  };

  const markRequirementsReady = (): void => {
    void saveState({
      status: state.setupMode === "prepare_listing" ? "needs_details" : "setup_started",
      currentStep: "connection",
      metadataPatch: {
        requirements_acknowledged: true,
      },
    });
  };

  const markRoomMatching = (): void => {
    void saveState({
      status: "matching_needed",
      currentStep: "room_matching",
      metadataPatch: {
        room_matching_reviewed: true,
      },
    });
  };

  const markPriceMatching = (): void => {
    void saveState({
      status: "matching_needed",
      currentStep: "price_matching",
      metadataPatch: {
        price_matching_reviewed: true,
      },
    });
  };

  const requestTestSyncReview = (): void => {
    void saveState({
      status: "needs_review",
      currentStep: "test_sync",
      metadataPatch: {
        test_sync_review_requested: true,
        test_sync_review_requested_at: new Date().toISOString(),
      },
    });
  };

  const requestGoLiveReview = (): void => {
    void saveState({
      status: "review_requested",
      currentStep: "activate",
      metadataPatch: {
        go_live_review_requested: true,
        go_live_review_requested_at: new Date().toISOString(),
      },
    });
  };

  const saveCurrentProgress = (): void => {
    void saveState({
      status: state.status === "not_started" ? "setup_started" : state.status,
      setupMode: state.setupMode,
      currentStep: state.currentStep,
      metadataPatch: {
        existing_listing_confirmed: state.metadata.existing_listing_confirmed,
        listing_preparation_requested: state.metadata.listing_preparation_requested,
        requirements_acknowledged: state.metadata.requirements_acknowledged,
        hotel_id_available: state.metadata.hotel_id_available,
        operator_setup_requested: state.metadata.operator_setup_requested,
        room_matching_reviewed: state.metadata.room_matching_reviewed,
        price_matching_reviewed: state.metadata.price_matching_reviewed,
        test_sync_review_requested: state.metadata.test_sync_review_requested,
        test_sync_review_requested_at: state.metadata.test_sync_review_requested_at,
        go_live_review_requested: state.metadata.go_live_review_requested,
        go_live_review_requested_at: state.metadata.go_live_review_requested_at,
        channel_ready_for_assisted_go_live: state.metadata.channel_ready_for_assisted_go_live,
        ready_for_assisted_go_live_at: state.metadata.ready_for_assisted_go_live_at,
        ready_for_assisted_go_live_by: state.metadata.ready_for_assisted_go_live_by,
        assisted_go_live_blockers: state.metadata.assisted_go_live_blockers,
        booking_hotel_id: state.metadata.booking_hotel_id,
        booking_property_code: state.metadata.booking_property_code,
        connectivity_provider_requested: state.metadata.connectivity_provider_requested,
        connectivity_provider_requested_at: state.metadata.connectivity_provider_requested_at,
        booking_extranet_request_acknowledged: state.metadata.booking_extranet_request_acknowledged,
        booking_connection_status: state.metadata.booking_connection_status,
        booking_connection_error: state.metadata.booking_connection_error,
        provider_listing_id: state.metadata.provider_listing_id,
        provider_property_code: state.metadata.provider_property_code,
        provider_listing_url: state.metadata.provider_listing_url,
        provider_connection_status: state.metadata.provider_connection_status,
        provider_connection_error: state.metadata.provider_connection_error,
        provider_extranet_request_acknowledged: state.metadata.provider_extranet_request_acknowledged,
        provider_verification_requested_at: state.metadata.provider_verification_requested_at,
        provider_access_token_stored: state.metadata.provider_access_token_stored,
        provider_access_token_last_four: state.metadata.provider_access_token_last_four,
        provider_access_token_stored_at: state.metadata.provider_access_token_stored_at,
        provider_credential_store_status: state.metadata.provider_credential_store_status,
        provider_discovered_hotel_id: state.metadata.provider_discovered_hotel_id,
        provider_discovered_channel_id: state.metadata.provider_discovered_channel_id,
        provider_discovered_channel_title: state.metadata.provider_discovered_channel_title,
        provider_channel_attached: state.metadata.provider_channel_attached,
        provider_channel_active: state.metadata.provider_channel_active,
        provider_room_types_found_count: state.metadata.provider_room_types_found_count,
        provider_rate_plans_found_count: state.metadata.provider_rate_plans_found_count,
        provider_structure_refreshed_at: state.metadata.provider_structure_refreshed_at,
        provider_structure_verified: state.metadata.provider_structure_verified,
        provider_structure_verified_at: state.metadata.provider_structure_verified_at,
        provider_structure_blockers: state.metadata.provider_structure_blockers,
        provider_ready_for_test_sync_review: state.metadata.provider_ready_for_test_sync_review,
        provider_ready_for_test_sync_review_at: state.metadata.provider_ready_for_test_sync_review_at,
        operator_verified_booking_connection: state.metadata.operator_verified_booking_connection,
        operator_verified_booking_connection_at: state.metadata.operator_verified_booking_connection_at,
        operator_notes: state.metadata.operator_notes,
      },
    });
  };

  const renderStatusLabel = (status: ChannelReadinessItem["status"]): string => {
    if (status === "ready") return "Done";
    if (status === "blocked") return "Blocked";
    if (status === "in_progress") return "Assisted by Famlo";
    if (status === "needed") return "Needed";
    if (status === "not_available") return "Not available";
    return "Not started";
  };

  const renderMatchingStatus = (
    status: ChannelSetupWizardProps["matchingSnapshot"]["roomRows"][number]["statusLabel"] | ChannelSetupWizardProps["matchingSnapshot"]["rateRows"][number]["statusLabel"]
  ): string => {
    if (status === "matched") return "Matched";
    if (status === "needs match") return "Needs match";
    if (status === "needs channel connection") return "Needs channel connection";
    return "Unavailable";
  };

  const renderTestSyncStatus = (status: ChannelTestSyncReadinessModel["status"]): string => {
    if (status === "ready") return "Ready";
    if (status === "blocked") return "Blocked";
    if (status === "assisted_only") return "Assisted only";
    if (status === "unavailable") return "Unavailable";
    return "Not ready";
  };

  const renderGoLiveStatus = (status: ChannelGoLiveReadinessModel["checklist"][number]["status"]): string => {
    if (status === "ready") return "Ready";
    if (status === "blocked") return "Blocked";
    if (status === "assisted_only") return "Assisted only";
    if (status === "unavailable") return "Unavailable";
    return "Not ready";
  };

  const hasProviderCatalog = Boolean(mappingWorkspace && (mappingWorkspace.roomTypes.length > 0 || mappingWorkspace.ratePlans.length > 0));

  return (
    <article className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>{provider.displayName} setup wizard</div>
          <div className={styles.cardCopy}>{readinessModel.nextRequiredAction}</div>
        </div>
        <button type="button" className={styles.secondaryActionButton} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.inlineBadgeRow}>
        <span className={styles.readinessPill}>
          {provider.connectionMode}
        </span>
        <span className={`${styles.readinessPill} ${provider.setupMode === "self-serve" ? styles.readinessPillOk : styles.readinessPillReview}`}>
          {provider.setupMode === "self-serve" ? "Self-serve" : "Assisted setup"}
        </span>
        <span className={`${styles.readinessPill} ${state.status === "live" ? styles.readinessPillOk : state.status === "needs_review" || state.status === "connection_requested" || state.status === "review_requested" ? styles.readinessPillReview : styles.readinessPillMissing}`}>
          {currentStatusLabel}
        </span>
        <span className={styles.readinessPill}>
          Step {currentStepIndex + 1}/7
        </span>
        <span className={styles.readinessPill}>
          {readinessModel.progressPercent}% complete
        </span>
      </div>

      <div className={styles.feedbackBox} style={{ marginBottom: 16 }}>
        <div className={styles.roomReadinessRow}>
          {savedStateSummary.map((item) => (
            <span key={item.label} className={styles.readinessPill}>
              {item.label}: {item.value}
            </span>
          ))}
        </div>
        <div className={styles.feedCopy} style={{ marginTop: 10 }}>
          {isLoading ? "Loading the latest safe setup state..." : feedback ?? readinessModel.nextRequiredAction}
        </div>
      </div>

      <section className={styles.listCard} style={{ marginBottom: 16 }}>
        <div className={styles.listTitle}>Common OTA connection path</div>
        <div className={styles.cardCopy}>{connectionModel.intro}</div>
        <div className={styles.mappingTable} style={{ marginTop: 14 }}>
          <div className={styles.mappingHeader}>Shared stage</div>
          <div className={styles.mappingHeader}>Status</div>
          <div className={styles.mappingHeader}>What it means</div>
          <div className={styles.mappingHeader}>Famlo reality</div>
          {connectionModel.commonStages.map((stage) => (
            <Fragment key={stage.key}>
              <div className={styles.mappingCell}>
                <div className={styles.mappingTitle}>{stage.label}</div>
              </div>
              <div className={styles.mappingCell}>
                <span
                  className={`${styles.readinessPill} ${
                    stage.status === "done"
                      ? styles.readinessPillOk
                      : stage.status === "blocked"
                        ? styles.readinessPillReview
                        : styles.readinessPillMissing
                  }`}
                >
                  {stage.status === "done"
                    ? "Done"
                    : stage.status === "in_progress"
                      ? "In progress"
                      : stage.status === "blocked"
                        ? "Blocked"
                        : "Needed"}
                </span>
              </div>
              <div className={styles.mappingCellMuted}>{stage.note}</div>
              <div className={styles.mappingCellMuted}>
                {stage.key === "provider_access"
                  ? connectionModel.whyNotFullyAutomatic
                  : stage.key === "test_sync"
                    ? connectionModel.automationReality
                    : "This is common across OTAs even if the identifiers differ."}
              </div>
            </Fragment>
          ))}
        </div>
        <div className={styles.inlineBadgeRow} style={{ marginTop: 12 }}>
          {connectionModel.requiredFields.map((field) => (
            <span key={field.key} className={styles.readinessPill}>
              {field.label}
              {field.required ? " required" : " optional"}
              {field.sensitive ? " · secure" : ""}
            </span>
          ))}
        </div>
        <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
          All OTAs do share one common structure: listing identification, provider approval, channel attachment, room mapping, rate mapping, and test sync. What changes OTA to OTA is the approval method and the exact connection fields.
        </div>
      </section>

      <section className={styles.listCard} style={{ marginBottom: 16 }}>
        <div className={styles.listTitle}>Connect {provider.displayName}</div>
        <div className={styles.cardCopy}>
          Enter the provider details and press Connect. Famlo will verify the channel safely before any sync or go-live action.
        </div>
        {providerKey === "booking" ? (
          <div className={styles.stack} style={{ marginTop: 12 }}>
            <label>
              <span className={styles.fieldLabel}>Booking.com Hotel ID</span>
              <input
                className={styles.fieldInput}
                value={bookingHotelIdInput}
                onChange={(event) => setBookingHotelIdInput(event.target.value)}
                placeholder="Example: 1234567"
              />
            </label>
            <label>
              <span className={styles.fieldLabel}>Booking.com Property Code</span>
              <input
                className={styles.fieldInput}
                value={bookingPropertyCodeInput}
                onChange={(event) => setBookingPropertyCodeInput(event.target.value)}
                placeholder="Optional property code"
              />
            </label>
            <label className={styles.feedCopy} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={bookingExtranetRequested}
                onChange={(event) => setBookingExtranetRequested(event.target.checked)}
              />
              I have requested Channex or Famlo as the connectivity provider in Booking.com extranet.
            </label>
            <div className={styles.inlineActionRow}>
              <button
                type="button"
                className={styles.primaryActionButton}
                disabled={isSaving}
                onClick={connectProvider}
              >
                {isSaving ? "Connecting..." : connectionModel.hostActionLabel}
              </button>
              <button
                type="button"
                className={styles.secondaryActionButton}
                disabled={isOpeningChannexWorkspace || !channexPropertyId}
                onClick={() => {
                  void openRealChannexWorkspace();
                }}
              >
                {isOpeningChannexWorkspace ? "Opening real workspace..." : "Open real Channex setup"}
              </button>
              <button
                type="button"
                className={styles.secondaryActionButton}
                disabled={isRefreshingFromChannex || !channexPropertyId}
                onClick={() => {
                  void refreshFromChannex();
                }}
              >
                {isRefreshingFromChannex ? "Refreshing..." : "Refresh from Channex"}
              </button>
            </div>
            <div className={styles.feedbackBox}>
              This sends the real Booking.com connection request to Famlo operators. It does not activate Booking.com or run sync until Channex verification passes.
            </div>
          </div>
        ) : assistedConnectionLabels ? (
          <div className={styles.stack} style={{ marginTop: 12 }}>
            {providerKey === "mmt" ? (
              <div className={styles.feedbackBox}>
                Open the MMT / Goibibo extranet, go to property settings or channel manager settings, enable or request Channex as the channel manager, then copy the Hotel ID / Hotel Code. If MMT gives an access token, paste it here only if secure credential storage is configured. Famlo will encrypt it and never show it back.
              </div>
            ) : null}
            <label>
              <span className={styles.fieldLabel}>{assistedConnectionLabels.listingIdLabel}</span>
              <input
                className={styles.fieldInput}
                value={providerListingIdInput}
                onChange={(event) => setProviderListingIdInput(event.target.value)}
                placeholder={assistedConnectionLabels.placeholderId}
              />
            </label>
            <label>
              <span className={styles.fieldLabel}>{assistedConnectionLabels.propertyCodeLabel}</span>
              <input
                className={styles.fieldInput}
                value={providerPropertyCodeInput}
                onChange={(event) => setProviderPropertyCodeInput(event.target.value)}
                placeholder={assistedConnectionLabels.placeholderCode}
              />
            </label>
            <label>
              <span className={styles.fieldLabel}>{assistedConnectionLabels.listingUrlLabel}</span>
              <input
                className={styles.fieldInput}
                value={providerListingUrlInput}
                onChange={(event) => setProviderListingUrlInput(event.target.value)}
                placeholder={assistedConnectionLabels.placeholderUrl}
              />
            </label>
            {providerKey === "mmt" ? (
              <>
                <label>
                  <span className={styles.fieldLabel}>Access token</span>
                  <input
                    className={styles.fieldInput}
                    value={providerAccessTokenInput}
                    onChange={(event) => setProviderAccessTokenInput(event.target.value)}
                    placeholder={
                      state.metadata.provider_access_token_stored
                        ? `Stored securely ending ${state.metadata.provider_access_token_last_four ?? "****"}. Leave blank to keep.`
                        : "Paste MMT access token only when secure storage is configured"
                    }
                  />
                </label>
                <label className={styles.feedCopy} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={providerExtranetRequested}
                    onChange={(event) => setProviderExtranetRequested(event.target.checked)}
                  />
                  I have enabled or requested Channex as channel manager in MMT / Goibibo.
                </label>
              </>
            ) : null}
            <div className={styles.inlineActionRow}>
              <button
                type="button"
                className={styles.primaryActionButton}
                disabled={isSaving}
                onClick={connectProvider}
              >
                {isSaving ? "Connecting..." : connectionModel.hostActionLabel}
              </button>
              <button
                type="button"
                className={styles.secondaryActionButton}
                disabled={isOpeningChannexWorkspace || !channexPropertyId}
                onClick={() => {
                  void openRealChannexWorkspace();
                }}
              >
                {isOpeningChannexWorkspace ? "Opening real workspace..." : "Open real Channex setup"}
              </button>
              <button
                type="button"
                className={styles.secondaryActionButton}
                disabled={isRefreshingFromChannex || !channexPropertyId}
                onClick={() => {
                  void refreshFromChannex();
                }}
              >
                {isRefreshingFromChannex ? "Refreshing..." : "Refresh from Channex"}
              </button>
            </div>
            <div className={styles.feedbackBox}>
              {assistedConnectionLabels.instruction} Famlo stores access tokens only through encrypted credential storage and never returns them to the browser after saving.
            </div>
          </div>
        ) : null}
        <div className={styles.inlineBadgeRow} style={{ marginTop: 12 }}>
          <span className={styles.readinessPill}>Connection state: {state.metadata.booking_connection_status ?? providerConnectionStatusLabel}</span>
          <span className={styles.readinessPill}>Live status: {state.status === "live" ? "Live" : "Not live"}</span>
          <span className={styles.readinessPill}>Channex property: {channexPropertyId ? "Ready" : "Missing"}</span>
          {state.metadata.provider_channel_attached != null ? (
            <span className={styles.readinessPill}>Channel in Channex: {state.metadata.provider_channel_attached ? "Visible" : "Not detected"}</span>
          ) : null}
        </div>
        {(state.metadata.provider_discovered_channel_title ||
          state.metadata.provider_room_types_found_count != null ||
          state.metadata.provider_rate_plans_found_count != null) ? (
          <div className={styles.inlineBadgeRow} style={{ marginTop: 12 }}>
            {state.metadata.provider_discovered_channel_title ? (
              <span className={styles.readinessPill}>Channel title: {state.metadata.provider_discovered_channel_title}</span>
            ) : null}
            {state.metadata.provider_room_types_found_count != null ? (
              <span className={styles.readinessPill}>Room types: {state.metadata.provider_room_types_found_count}</span>
            ) : null}
            {state.metadata.provider_rate_plans_found_count != null ? (
              <span className={styles.readinessPill}>Rate plans: {state.metadata.provider_rate_plans_found_count}</span>
            ) : null}
            {state.metadata.provider_structure_refreshed_at ? (
              <span className={styles.readinessPill}>Refreshed: {state.metadata.provider_structure_refreshed_at}</span>
            ) : null}
          </div>
        ) : null}
        {channexWorkspaceUrl ? (
          <div className={styles.stack} style={{ marginTop: 16 }}>
            <div className={styles.feedbackBox}>
              {channexWorkspaceHint ??
                "This is the real Channex property-scoped setup workspace. Any create/test/mapping action here affects the selected property only."}
            </div>
            <div className={styles.inlineActionRow}>
              <a
                className={styles.secondaryActionButton}
                href={channexWorkspaceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in new tab
              </a>
            </div>
            <iframe
              src={channexWorkspaceUrl}
              title={`${provider.displayName} Channex workspace`}
              style={{
                width: "100%",
                minHeight: 860,
                border: "1px solid rgba(148, 163, 184, 0.35)",
                borderRadius: 24,
                background: "#ffffff",
              }}
            />
          </div>
        ) : null}
      </section>

      <section className={styles.listCard} style={{ marginBottom: 16 }}>
        <div className={styles.listTitle}>Connection preview</div>
        <div className={styles.cardCopy}>
          Once the provider channel and structures are visible, Famlo can suggest room and rate matches before you confirm them.
        </div>
        <div className={styles.inlineBadgeRow} style={{ marginTop: 12 }}>
          <span className={styles.readinessPill}>Preview rows: {previewWorkspace?.suggestions.length ?? 0}</span>
          <span className={styles.readinessPill}>Auto-applicable: {previewWorkspace?.autoApplicableCount ?? 0}</span>
          <span className={styles.readinessPill}>Refreshed: {previewWorkspace?.refreshedAt ?? "Not loaded"}</span>
        </div>
        <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={isLoadingPreview}
            onClick={() => {
              void loadPreviewWorkspace();
            }}
          >
            {isLoadingPreview ? "Loading preview..." : "Load preview"}
          </button>
          <button
            type="button"
            className={styles.primaryActionButton}
            disabled={isApplyingPreview || !previewWorkspace || previewWorkspace.autoApplicableCount === 0}
            onClick={applyPreviewMappings}
          >
            {isApplyingPreview ? "Applying..." : "Confirm preview & apply suggested mappings"}
          </button>
        </div>
        {!previewWorkspace || previewWorkspace.suggestions.length === 0 ? (
          <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
            Save the connection details, finish provider create or test if needed, then refresh from Channex. After that Famlo can generate a room and rate preview here.
          </div>
        ) : (
          <div className={styles.mappingTable} style={{ marginTop: 14 }}>
            <div className={styles.mappingHeader}>Famlo room</div>
            <div className={styles.mappingHeader}>Suggested provider room</div>
            <div className={styles.mappingHeader}>Suggested rate plan</div>
            <div className={styles.mappingHeader}>Confidence</div>
            {previewWorkspace.suggestions.map((row) => (
              <Fragment key={row.roomId}>
                <div className={styles.mappingCell}>
                  <div className={styles.mappingTitle}>{row.famloRoomName}</div>
                  <div className={styles.mappingSubcopy}>{row.famloRoomType || "Famlo room"}</div>
                </div>
                <div className={styles.mappingCellMuted}>
                  {row.suggestedRoomTypeTitle ?? "No room match yet"}
                </div>
                <div className={styles.mappingCellMuted}>
                  {row.suggestedRatePlanTitle ?? "No rate match yet"}
                </div>
                <div className={styles.mappingCell}>
                  <span
                    className={`${styles.readinessPill} ${
                      row.confidence === "high"
                        ? styles.readinessPillOk
                        : row.confidence === "medium"
                          ? styles.readinessPillReview
                          : styles.readinessPillMissing
                    }`}
                  >
                    {row.autoApplicable ? `${row.confidence} · ready` : `${row.confidence} · review`}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </section>

      <section className={styles.listCard} style={{ marginBottom: 16 }}>
        <div className={styles.listTitle}>Provider mapping workspace</div>
        <div className={styles.cardCopy}>
          After refreshing from Channex, map each Famlo room to a real provider room and rate plan. This saves mapping only. It does not activate the channel or push inventory.
        </div>
        <div className={styles.inlineBadgeRow} style={{ marginTop: 12 }}>
          <span className={styles.readinessPill}>
            Catalog: {hasProviderCatalog ? "Loaded" : "Missing"}
          </span>
          <span className={styles.readinessPill}>
            Room types: {mappingWorkspace?.roomTypes.length ?? 0}
          </span>
          <span className={styles.readinessPill}>
            Rate plans: {mappingWorkspace?.ratePlans.length ?? 0}
          </span>
          <span className={styles.readinessPill}>
            Refreshed: {mappingWorkspace?.refreshedAt ?? "Not refreshed"}
          </span>
        </div>

        {isLoadingMappingWorkspace ? (
          <div className={styles.feedbackBox} style={{ marginTop: 12 }}>Loading mapping workspace...</div>
        ) : !hasProviderCatalog ? (
          <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
            Refresh from Channex first so Famlo can load the real provider room types and rate plans for this property.
          </div>
        ) : (
          <div className={styles.mappingTable} style={{ marginTop: 14 }}>
            <div className={styles.mappingHeader}>Famlo room</div>
            <div className={styles.mappingHeader}>Provider room</div>
            <div className={styles.mappingHeader}>Provider rate plan</div>
            <div className={styles.mappingHeader}>Action</div>
            {mappingWorkspace?.rooms.map((room) => {
              const allowedRatePlans = mappingWorkspace.ratePlans.filter(
                (ratePlan) => !roomTypeDrafts[room.id] || !ratePlan.roomTypeId || ratePlan.roomTypeId === roomTypeDrafts[room.id]
              );
              return (
                <Fragment key={room.id}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{room.name}</div>
                    <div className={styles.mappingSubcopy}>
                      {room.unitType || "Famlo room"} · {room.basePrice > 0 ? `Base price ${room.basePrice}` : "Missing price"}
                    </div>
                  </div>
                  <div className={styles.mappingCell}>
                    <select
                      className={styles.fieldInput}
                      value={roomTypeDrafts[room.id] ?? ""}
                      onChange={(event) =>
                        setRoomTypeDrafts((current) => ({ ...current, [room.id]: event.target.value }))
                      }
                    >
                      <option value="">Select provider room</option>
                      {mappingWorkspace.roomTypes.map((roomType) => (
                        <option key={roomType.id} value={roomType.id}>
                          {roomType.title ?? roomType.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.mappingCell}>
                    <select
                      className={styles.fieldInput}
                      value={ratePlanDrafts[room.id] ?? ""}
                      onChange={(event) =>
                        setRatePlanDrafts((current) => ({ ...current, [room.id]: event.target.value }))
                      }
                    >
                      <option value="">Select provider rate plan</option>
                      {allowedRatePlans.map((ratePlan) => (
                        <option key={ratePlan.id} value={ratePlan.id}>
                          {ratePlan.title ?? ratePlan.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.mappingCell}>
                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      disabled={Boolean(isSavingMappingByRoomId[room.id])}
                      onClick={() => {
                        void saveMappingForRoom(room.id);
                      }}
                    >
                      {isSavingMappingByRoomId[room.id] ? "Saving..." : "Save mapping"}
                    </button>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </section>

      {showAdvancedReadiness ? (
      <details className={styles.operatorDetails}>
        <summary className={styles.operatorSummary}>Advanced readiness and mapping steps</summary>

      <section className={styles.listCard} style={{ marginBottom: 16 }}>
        <div className={styles.listTitle}>Readiness checklist</div>
        <div className={styles.stack}>
          {readinessItems.map((item) => (
            <div key={item.key} className={styles.feedItem}>
              <div className={styles.feedTitle}>{item.label}</div>
              <div className={styles.feedCopy}>{item.explanation}</div>
              <div className={styles.inlineBadgeRow}>
                <span className={`${styles.readinessPill} ${item.status === "ready" ? styles.readinessPillOk : item.status === "blocked" ? styles.readinessPillReview : styles.readinessPillMissing}`}>
                  {renderStatusLabel(item.status)}
                </span>
                {item.operatorNote ? <span className={styles.readinessPill}>{item.operatorNote}</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
          <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={saveCurrentProgress}>
            Save progress
          </button>
          <button type="button" className={styles.secondaryActionButton} disabled={isSaving} onClick={requestHelp}>
            Request Famlo setup help
          </button>
        </div>
      </section>

      <div className={styles.listGrid}>
        <section className={styles.listCard}>
          <div className={styles.listTitle}>1. Already listed on this OTA?</div>
          <div className={styles.feedCopy}>{summary.listedOnOtaLabel}</div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button
              type="button"
              className={styles.primaryActionButton}
              disabled={isSaving}
              onClick={() => selectListingMode("existing_listing", true)}
            >
              Yes, existing listing
            </button>
            <button
              type="button"
              className={styles.secondaryActionButton}
              disabled={isSaving}
              onClick={() => selectListingMode("prepare_listing", false)}
            >
              No, prepare listing
            </button>
          </div>
          <div className={styles.feedCopy} style={{ marginTop: 10 }}>
            Saved choice: {state.setupMode === "existing_listing" ? "Existing listing" : state.setupMode === "prepare_listing" ? "Prepare listing" : "Not set"}
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listTitle}>2. Requirements</div>
          <div className={styles.stack}>
            {provider.requiredSetupItems.map((item) => (
              <div key={item} className={styles.feedItem}>
                <div className={styles.feedTitle}>{item}</div>
              </div>
            ))}
          </div>
          <div className={styles.feedCopy}>{summary.requirementsLabel}</div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={markRequirementsReady}>
              Save requirements acknowledged
            </button>
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listTitle}>3. Connection details / instructions</div>
          <div className={styles.feedCopy}>{summary.connectionLabel}</div>
          <div className={styles.stack}>
            {provider.hostInstructions.map((item) => (
              <div key={item} className={styles.feedItem}>
                <div className={styles.feedCopy}>{item}</div>
              </div>
            ))}
          </div>
          {providerKey === "booking" ? (
            <div className={styles.stack} style={{ marginTop: 12 }}>
              <label>
                <span className={styles.fieldLabel}>Booking.com Hotel ID</span>
                <input
                  className={styles.fieldInput}
                  value={bookingHotelIdInput}
                  onChange={(event) => setBookingHotelIdInput(event.target.value)}
                  placeholder="Example: 1234567"
                />
              </label>
              <label>
                <span className={styles.fieldLabel}>Booking.com Property Code</span>
                <input
                  className={styles.fieldInput}
                  value={bookingPropertyCodeInput}
                  onChange={(event) => setBookingPropertyCodeInput(event.target.value)}
                  placeholder="Optional property code"
                />
              </label>
              <label className={styles.feedCopy} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={bookingExtranetRequested}
                  onChange={(event) => setBookingExtranetRequested(event.target.checked)}
                />
                I have requested Channex or Famlo as the connectivity provider in Booking.com extranet.
              </label>
              <div className={styles.feedbackBox}>
                This step does not activate Booking.com. A Famlo operator must verify the connection in Channex, and no sync will run from here.
              </div>
              <div className={styles.inlineActionRow}>
                <button
                  type="button"
                  className={styles.primaryActionButton}
                  disabled={isSaving}
                  onClick={requestBookingVerification}
                >
                  Request Famlo verification
                </button>
              </div>
              <div className={styles.feedCopy}>
                Current verification state: {state.metadata.booking_connection_status ?? "Not requested"}
                {state.metadata.operator_verified_booking_connection_at
                  ? ` · Verified ${state.metadata.operator_verified_booking_connection_at}`
                  : ""}
              </div>
              {state.metadata.booking_connection_error ? (
                <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{state.metadata.booking_connection_error}</div>
              ) : null}
            </div>
          ) : assistedConnectionLabels ? (
            <div className={styles.stack} style={{ marginTop: 12 }}>
              <div className={styles.feedbackBox}>
                {assistedConnectionLabels.instruction} This does not activate or sync the channel. MMT access tokens are stored only through encrypted credential storage.
              </div>
              <label>
                <span className={styles.fieldLabel}>{assistedConnectionLabels.listingIdLabel}</span>
                <input
                  className={styles.fieldInput}
                  value={providerListingIdInput}
                  onChange={(event) => setProviderListingIdInput(event.target.value)}
                  placeholder={assistedConnectionLabels.placeholderId}
                />
              </label>
              <label>
                <span className={styles.fieldLabel}>{assistedConnectionLabels.propertyCodeLabel}</span>
                <input
                  className={styles.fieldInput}
                  value={providerPropertyCodeInput}
                  onChange={(event) => setProviderPropertyCodeInput(event.target.value)}
                  placeholder={assistedConnectionLabels.placeholderCode}
                />
              </label>
              <label>
                <span className={styles.fieldLabel}>{assistedConnectionLabels.listingUrlLabel}</span>
                <input
                  className={styles.fieldInput}
                  value={providerListingUrlInput}
                  onChange={(event) => setProviderListingUrlInput(event.target.value)}
                  placeholder={assistedConnectionLabels.placeholderUrl}
                />
              </label>
              {providerKey === "mmt" ? (
                <label>
                  <span className={styles.fieldLabel}>Access token</span>
                  <input
                    className={styles.fieldInput}
                    value={providerAccessTokenInput}
                    onChange={(event) => setProviderAccessTokenInput(event.target.value)}
                    placeholder={
                      state.metadata.provider_access_token_stored
                        ? `Stored securely ending ${state.metadata.provider_access_token_last_four ?? "****"}. Leave blank to keep.`
                        : "Paste MMT access token only when secure storage is configured"
                    }
                  />
                </label>
              ) : null}
              <div className={styles.inlineActionRow}>
                <button
                  type="button"
                  className={styles.primaryActionButton}
                  disabled={isSaving}
                  onClick={requestAssistedProviderVerification}
                >
                  Request Famlo verification
                </button>
              </div>
              <div className={styles.feedCopy}>
                Current verification state: {state.metadata.provider_connection_status ?? "Not requested"}
                {state.metadata.provider_verification_requested_at
                  ? ` · Requested ${state.metadata.provider_verification_requested_at}`
                  : ""}
              </div>
              <div className={styles.inlineBadgeRow}>
                {providerKey === "mmt" ? (
                  <span className={styles.readinessPill}>
                    Token: {state.metadata.provider_access_token_stored ? `Stored${state.metadata.provider_access_token_last_four ? ` · ${state.metadata.provider_access_token_last_four}` : ""}` : "Missing"}
                  </span>
                ) : null}
                <span className={styles.readinessPill}>
                  Structure: {state.metadata.provider_structure_verified ? "Verified" : state.metadata.provider_structure_blockers.length > 0 ? "Blocked" : "Not verified"}
                </span>
                <span className={styles.readinessPill}>
                  Direct create/test API: {mutationAudit.createChannelApiAvailable || mutationAudit.testConnectionApiAvailable ? "Available" : "Missing"}
                </span>
              </div>
              {!mutationAudit.createChannelApiAvailable || !mutationAudit.testConnectionApiAvailable ? (
                <div className={styles.feedbackBox}>
                  {mutationAudit.missingPrimitive ?? mutationAudit.nextAction}
                </div>
              ) : null}
              {state.metadata.provider_connection_error ? (
                <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{state.metadata.provider_connection_error}</div>
              ) : null}
            </div>
          ) : null}
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            {providerKey === "booking" ? null : null}
          </div>
          <div className={styles.feedbackBox}>
            Access tokens are encrypted server-side when secure credential storage is configured. This still does not activate, sync, or mark the OTA live.
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listTitle}>4. Room matching</div>
          <div className={styles.feedCopy}>{matchingSnapshot.reviewLabel}</div>
          <div className={styles.feedCopy} style={{ marginTop: 6 }}>
            {summary.roomMatchingLabel}
          </div>
          <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
            {matchingSnapshot.providerDataLabel}
          </div>
          <div className={styles.mappingTable} style={{ marginTop: 12 }}>
            <div className={styles.mappingHeader}>Famlo room</div>
            <div className={styles.mappingHeader}>Provider room</div>
            <div className={styles.mappingHeader}>Status</div>
            <div className={styles.mappingHeader}>Readiness</div>
            {matchingSnapshot.roomRows.map((row) => (
              <Fragment key={`${row.famloRoomName}-${row.providerRoomLabel}`}>
                <div className={styles.mappingCell}>
                  <div className={styles.mappingTitle}>{row.famloRoomName}</div>
                  <div className={styles.mappingSubcopy}>{row.famloRoomType}</div>
                </div>
                <div className={styles.mappingCell}>
                  <div className={styles.mappingTitle}>{row.providerRoomLabel}</div>
                  <div className={styles.mappingSubcopy}>{row.isActive ? "Active room" : "Inactive room"}</div>
                </div>
                <div className={styles.mappingCell}>
                  <span className={`${styles.badge} ${row.statusLabel === "matched" ? "" : styles.badgeMuted}`.trim()}>
                    {renderMatchingStatus(row.statusLabel)}
                  </span>
                </div>
                <div className={styles.mappingCellMuted}>
                  {row.basePriceLabel} · {row.photoReadinessLabel}
                  {row.note ? <div className={styles.feedCopy} style={{ marginTop: 4 }}>{row.note}</div> : null}
                </div>
              </Fragment>
            ))}
          </div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={markRoomMatching}>
              Save room matching progress
            </button>
            {onOpenRoomMatching ? (
              <button type="button" className={styles.secondaryActionButton} disabled={isSaving} onClick={onOpenRoomMatching}>
                Open mapping workspace
              </button>
            ) : null}
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listTitle}>5. Price matching</div>
          <div className={styles.feedCopy}>{summary.priceMatchingLabel}</div>
          <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
            {matchingSnapshot.providerDataAvailable ? "Provider rate plans are available for review." : "Provider rate plans are unavailable until the channel connection exists."}
          </div>
          <div className={styles.mappingTable} style={{ marginTop: 12 }}>
            <div className={styles.mappingHeader}>Famlo room price</div>
            <div className={styles.mappingHeader}>Provider rate plan</div>
            <div className={styles.mappingHeader}>Status</div>
            <div className={styles.mappingHeader}>Readiness</div>
            {matchingSnapshot.rateRows.map((row) => (
              <Fragment key={`${row.famloRoomName}-${row.providerRateLabel}`}>
                <div className={styles.mappingCell}>
                  <div className={styles.mappingTitle}>{row.famloRoomName}</div>
                  <div className={styles.mappingSubcopy}>{row.famloRoomType}</div>
                </div>
                <div className={styles.mappingCell}>
                  <div className={styles.mappingTitle}>{row.providerRateLabel}</div>
                  <div className={styles.mappingSubcopy}>{row.isActive ? "Active room" : "Inactive room"}</div>
                </div>
                <div className={styles.mappingCell}>
                  <span className={`${styles.badge} ${row.statusLabel === "matched" ? "" : styles.badgeMuted}`.trim()}>
                    {renderMatchingStatus(row.statusLabel)}
                  </span>
                </div>
                <div className={styles.mappingCellMuted}>
                  {row.basePriceLabel}
                  {row.note ? <div className={styles.feedCopy} style={{ marginTop: 4 }}>{row.note}</div> : null}
                </div>
              </Fragment>
            ))}
          </div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={markPriceMatching}>
              Save price matching progress
            </button>
            {onOpenPriceMatching ? (
              <button type="button" className={styles.secondaryActionButton} disabled={isSaving} onClick={onOpenPriceMatching}>
                Open rate workspace
              </button>
            ) : null}
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listTitle}>6. Test sync readiness</div>
          <div className={styles.feedCopy}>{testSyncReadiness.statusLabel}</div>
          <div className={styles.inlineBadgeRow} style={{ marginTop: 8 }}>
            <span className={styles.readinessPill}>
              Structure verification: {state.metadata.provider_structure_verified ? "Verified" : "Pending"}
            </span>
            <span className={styles.readinessPill}>
              Ready for review: {state.metadata.provider_ready_for_test_sync_review ? "Yes" : "No"}
            </span>
          </div>
          <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
            {testSyncReadiness.nextRequiredAction}
          </div>
          {state.metadata.provider_structure_blockers.length > 0 ? (
            <div className={styles.stack} style={{ marginTop: 8 }}>
              {state.metadata.provider_structure_blockers.map((blocker) => (
                <div key={blocker} className={styles.feedCopy}>
                  {blocker}
                </div>
              ))}
            </div>
          ) : null}
          {testSyncReadiness.operatorNote ? (
            <div className={styles.feedCopy} style={{ marginTop: 8 }}>
              {testSyncReadiness.operatorNote}
            </div>
          ) : null}
          <div className={styles.stack} style={{ marginTop: 12 }}>
            {testSyncReadiness.checklist.map((item) => (
              <div key={item.key} className={styles.feedItem}>
                <div className={styles.feedTitle}>{item.label}</div>
                <div className={styles.feedCopy}>{item.explanation}</div>
                <div className={styles.inlineBadgeRow}>
                  <span className={`${styles.readinessPill} ${item.status === "ready" ? styles.readinessPillOk : item.status === "blocked" ? styles.readinessPillReview : styles.readinessPillMissing}`}>
                    {renderTestSyncStatus(item.status)}
                  </span>
                  {item.operatorNote ? <span className={styles.readinessPill}>{item.operatorNote}</span> : null}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.feedCopy} style={{ marginTop: 10 }}>
            {testSyncReadiness.readyForLimitedTestSync
              ? providerKey === "booking"
                ? "Ready for limited test sync."
                : "Ready for operator test sync review."
              : "Operator test sync required."}
          </div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={requestTestSyncReview}>
              Request Test Sync Review
            </button>
          </div>
        </section>
      </div>

      <section className={styles.listCard}>
        <div className={styles.listTitle}>7. Activate</div>
        <div className={styles.feedCopy}>{goLiveReadiness.statusLabel}</div>
        <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
          {goLiveReadiness.nextRequiredAction}
        </div>
        {goLiveReadiness.operatorNote ? (
          <div className={styles.feedCopy} style={{ marginTop: 8 }}>
            {goLiveReadiness.operatorNote}
          </div>
        ) : null}
        <div className={styles.stack} style={{ marginTop: 12 }}>
          {goLiveReadiness.checklist.map((item) => (
            <div key={item.key} className={styles.feedItem}>
              <div className={styles.feedTitle}>{item.label}</div>
              <div className={styles.feedCopy}>{item.explanation}</div>
              <div className={styles.inlineBadgeRow}>
                <span className={`${styles.readinessPill} ${item.status === "ready" ? styles.readinessPillOk : item.status === "blocked" ? styles.readinessPillReview : styles.readinessPillMissing}`}>
                  {renderGoLiveStatus(item.status)}
                </span>
                {item.operatorNote ? <span className={styles.readinessPill}>{item.operatorNote}</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
          <button type="button" className={styles.primaryActionButton} disabled={isSaving || goLiveReadiness.status === "live" || goLiveReadiness.reviewPending} onClick={requestGoLiveReview}>
            Request Go Live Review
          </button>
          <span className={`${styles.readinessPill} ${goLiveReadiness.status === "ready_for_review" || goLiveReadiness.status === "review_requested" || goLiveReadiness.status === "live" ? styles.readinessPillReview : styles.readinessPillMissing}`}>
            {goLiveReadiness.reviewPending ? "Review pending" : goLiveReadiness.statusLabel}
          </span>
        </div>
      </section>

      </details>
      ) : null}
    </article>
  );
}
