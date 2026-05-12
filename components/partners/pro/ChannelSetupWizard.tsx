"use client";

import { useEffect, useMemo, useState } from "react";

import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { getChannelProviderDefinition } from "@/lib/channel-providers/provider-registry";
import {
  createDefaultChannelSetupState,
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
  activationLabel: string;
  activationReady: boolean;
  activationBlockedReason: string;
  readinessLines: string[];
};

type ChannelSetupWizardProps = {
  providerKey: ChannelProviderKey;
  familyId: string;
  summary: ChannelSetupWizardSummary;
  initialState?: ChannelSetupState | null;
  onClose: () => void;
  onSaved?: (state: ChannelSetupState) => void;
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
  initialState,
  onClose,
  onSaved,
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

  const savedStateSummary = useMemo(
    () => [
      { label: "Status", value: currentStatusLabel },
      { label: "Step", value: currentStepLabel },
      { label: "Setup mode", value: state.setupMode === "existing_listing" ? "Existing listing" : state.setupMode === "prepare_listing" ? "Prepare listing" : "Not chosen yet" },
      { label: "Updated", value: state.updatedAt ?? state.metadata.updated_at ?? "Not saved yet" },
    ],
    [currentStatusLabel, currentStepLabel, state.metadata.updated_at, state.setupMode, state.updatedAt]
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
        has_existing_listing: hasExistingListing,
      },
    });
  };

  const requestHelp = (): void => {
    void saveState({
      status: "connection_requested",
      currentStep: "connection",
      metadataPatch: {
        requested_at: new Date().toISOString(),
      },
    });
  };

  const markRequirementsReady = (): void => {
    void saveState({
      status: state.setupMode === "prepare_listing" ? "needs_details" : "setup_started",
      currentStep: "connection",
      metadataPatch: {
        required_items_acknowledged: true,
      },
    });
  };

  const markRoomMatching = (): void => {
    void saveState({
      status: "matching_needed",
      currentStep: "room_matching",
    });
  };

  const markPriceMatching = (): void => {
    void saveState({
      status: "matching_needed",
      currentStep: "price_matching",
    });
  };

  const markTestSyncReady = (): void => {
    void saveState({
      status: "ready_for_test_sync",
      currentStep: "test_sync",
    });
  };

  return (
    <article className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>{provider.displayName} setup wizard</div>
          <div className={styles.cardCopy}>{summary.nextStep}</div>
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
        <span className={`${styles.readinessPill} ${state.status === "live" ? styles.readinessPillOk : state.status === "needs_review" || state.status === "connection_requested" ? styles.readinessPillReview : styles.readinessPillMissing}`}>
          {currentStatusLabel}
        </span>
        <span className={styles.readinessPill}>
          Step {currentStepIndex + 1}/7
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
          {isLoading ? "Loading the latest safe setup state..." : feedback ?? "This wizard only saves non-secret setup progress."}
        </div>
      </div>

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
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={requestHelp}>
              Request Famlo setup help
            </button>
            <button type="button" className={styles.secondaryActionButton} disabled={isSaving} onClick={() => void saveState({ status: "matching_needed", currentStep: "room_matching", metadataPatch: { hotel_id_entered: true } })}>
              Mark connection details collected
            </button>
          </div>
          <div className={styles.feedbackBox}>No access tokens are stored in this phase. Setup stays guided and honest.</div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listTitle}>4. Room matching</div>
          <div className={styles.feedCopy}>{summary.roomMatchingLabel}</div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={markRoomMatching}>
              Save room matching progress
            </button>
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listTitle}>5. Price matching</div>
          <div className={styles.feedCopy}>{summary.priceMatchingLabel}</div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={markPriceMatching}>
              Save price matching progress
            </button>
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.listTitle}>6. Test sync readiness</div>
          <div className={styles.stack}>
            {summary.readinessLines.map((line) => (
              <div key={line} className={styles.feedItem}>
                <div className={styles.feedCopy}>{line}</div>
              </div>
            ))}
          </div>
          <div className={styles.feedCopy}>{summary.syncReadinessLabel}</div>
          <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
            <button type="button" className={styles.primaryActionButton} disabled={isSaving} onClick={markTestSyncReady}>
              Save test sync readiness
            </button>
          </div>
        </section>
      </div>

      <section className={styles.listCard}>
        <div className={styles.listTitle}>7. Activate</div>
        <div className={styles.feedCopy}>{summary.activationLabel}</div>
        <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
          <button type="button" className={styles.primaryActionButton} disabled={!summary.activationReady}>
            Activate disabled unless ready
          </button>
          <span className={`${styles.readinessPill} ${summary.activationReady ? styles.readinessPillOk : styles.readinessPillMissing}`}>
            {summary.activationReady ? "Ready for activation" : summary.activationBlockedReason}
          </span>
        </div>
      </section>
    </article>
  );
}
