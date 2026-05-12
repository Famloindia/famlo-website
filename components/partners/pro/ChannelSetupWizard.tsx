"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

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

type ChannelSetupWizardProps = {
  providerKey: ChannelProviderKey;
  familyId: string;
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

export default function ChannelSetupWizard({
  providerKey,
  familyId,
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

  const currentStepIndex = Math.max(0, STEP_ORDER.indexOf(state.currentStep ?? "listing"));
  const currentStepLabel = getChannelSetupStepLabel(state.currentStep);
  const currentStatusLabel = getChannelSetupStatusLabel(state.status);
  const readinessItems = readinessModel.items;

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
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save channel setup state.");
    } finally {
      setIsSaving(false);
    }
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

  const markTestSyncReady = (): void => {
    void saveState({
      status: "ready_for_test_sync",
      currentStep: "test_sync",
      metadataPatch: {
        test_sync_review_requested: true,
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
        go_live_review_requested: state.metadata.go_live_review_requested,
        go_live_review_requested_at: state.metadata.go_live_review_requested_at,
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
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.secondaryActionButton} disabled={isSaving} onClick={() => void saveState({ status: "matching_needed", currentStep: "room_matching", metadataPatch: { hotel_id_available: true, operator_setup_requested: true } })}>
              Mark connection details collected
            </button>
          </div>
          <div className={styles.feedbackBox}>No access tokens are stored in this phase. Setup stays guided and honest.</div>
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
          <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
            {testSyncReadiness.nextRequiredAction}
          </div>
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
            {testSyncReadiness.readyForLimitedTestSync ? "Ready for limited test sync." : "Operator test sync required."}
          </div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={markTestSyncReady}>
              Save test sync readiness
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
    </article>
  );
}
