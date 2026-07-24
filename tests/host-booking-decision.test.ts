import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  executeHostBookingDecision,
  type HostBookingDecision,
  type HostBookingDecisionInput,
  type HostBookingDecisionRuntime,
  HostBookingDecisionError,
} from "@/lib/host-booking-decision";
import { executeWhatsAppDecisionWithCompletion } from "@/lib/booking-whatsapp-actions";

type RuntimeState = {
  bookingStatus: string;
  hostId: string;
  decision: HostBookingDecision | null;
  decisionStatus: "processing" | "completed" | "failed" | null;
  refundRequestId: string | null;
  failNextReconcile: boolean;
  reconciliations: number;
  refunds: number;
  inventoryReleases: number;
  channelRestores: number;
  completions: number;
};

function input(
  source: HostBookingDecisionInput["source"],
  decision: HostBookingDecision,
  hostId = "host-1"
): HostBookingDecisionInput {
  return {
    bookingId: "booking-1",
    hostId,
    familyId: "family-1",
    decision,
    source,
    actor: { userId: "host-user-1", role: "host" },
    idempotencyKey: `${source}:booking-1:${decision}`,
  };
}

function createRuntime(initialStatus = "pending_host_approval"): {
  state: RuntimeState;
  runtime: HostBookingDecisionRuntime;
} {
  const state: RuntimeState = {
    bookingStatus: initialStatus,
    hostId: "host-1",
    decision: null,
    decisionStatus: null,
    refundRequestId: null,
    failNextReconcile: false,
    reconciliations: 0,
    refunds: 0,
    inventoryReleases: 0,
    channelRestores: 0,
    completions: 0,
  };

  const runtime: HostBookingDecisionRuntime = {
    async claim(request) {
      if (request.hostId !== state.hostId) {
        return {
          outcome: "host_mismatch",
          decisionId: null,
          previousStatus: state.bookingStatus,
          bookingStatus: state.bookingStatus,
          refundRequestId: state.refundRequestId,
        };
      }
      if (state.decision && state.decision !== request.decision) {
        return {
          outcome: "conflict",
          decisionId: "decision-1",
          previousStatus: "pending_host_approval",
          bookingStatus: state.bookingStatus,
          refundRequestId: state.refundRequestId,
        };
      }
      if (state.decisionStatus === "completed") {
        return {
          outcome: "already_processed",
          decisionId: "decision-1",
          previousStatus: "pending_host_approval",
          bookingStatus: state.bookingStatus,
          refundRequestId: state.refundRequestId,
        };
      }
      if (!state.decision && state.bookingStatus !== "pending_host_approval") {
        const equivalent =
          (request.decision === "approve" && ["accepted", "confirmed"].includes(state.bookingStatus)) ||
          (request.decision === "decline" && ["rejected", "cancelled", "cancelled_by_partner"].includes(state.bookingStatus));
        if (!equivalent) {
          return {
            outcome: "conflict",
            decisionId: null,
            previousStatus: state.bookingStatus,
            bookingStatus: state.bookingStatus,
            refundRequestId: null,
          };
        }
      }

      const recovery = state.decisionStatus === "failed" || state.bookingStatus !== "pending_host_approval";
      state.decision = request.decision;
      state.decisionStatus = "processing";
      const previousStatus = state.bookingStatus;
      state.bookingStatus = request.decision === "approve" ? "confirmed" : "rejected";
      return {
        outcome: recovery ? "claimed_recovery" : "claimed",
        decisionId: "decision-1",
        previousStatus,
        bookingStatus: state.bookingStatus,
        refundRequestId: state.refundRequestId,
      };
    },
    async reconcile(request) {
      state.reconciliations += 1;
      if (state.failNextReconcile) {
        state.failNextReconcile = false;
        throw new Error("downstream unavailable");
      }
      if (request.decision === "decline") {
        if (!state.refundRequestId) {
          state.refundRequestId = "refund-request-1";
          state.refunds += 1;
        }
        if (state.inventoryReleases === 0) state.inventoryReleases += 1;
        if (state.channelRestores === 0) state.channelRestores += 1;
      }
      return { refundRequestId: state.refundRequestId };
    },
    async complete(_decisionId, refundRequestId) {
      state.decisionStatus = "completed";
      state.refundRequestId = refundRequestId;
      state.completions += 1;
    },
    async fail() {
      state.decisionStatus = "failed";
    },
  };

  return { state, runtime };
}

for (const source of ["dashboard", "signed_link", "whatsapp"] as const) {
  test(`${source} approval produces the canonical confirmed outcome`, async () => {
    const { state, runtime } = createRuntime();
    const result = await executeHostBookingDecision(runtime, input(source, "approve"));
    assert.equal(result.status, "applied");
    assert.equal(result.bookingStatus, "confirmed");
    assert.equal(state.bookingStatus, "confirmed");
    assert.equal(state.completions, 1);
  });

  test(`${source} decline produces the canonical refund and cancellation outcome`, async () => {
    const { state, runtime } = createRuntime();
    const result = await executeHostBookingDecision(runtime, input(source, "decline"));
    assert.equal(result.bookingStatus, "rejected");
    assert.equal(result.refundRequestId, "refund-request-1");
    assert.equal(state.refunds, 1);
    assert.equal(state.inventoryReleases, 1);
    assert.equal(state.channelRestores, 1);
  });
}

test("duplicate approval is idempotent", async () => {
  const { state, runtime } = createRuntime();
  await executeHostBookingDecision(runtime, input("dashboard", "approve"));
  const replay = await executeHostBookingDecision(runtime, input("dashboard", "approve"));
  assert.equal(replay.status, "already_processed");
  assert.equal(state.reconciliations, 1);
  assert.equal(state.completions, 1);
});

test("duplicate decline does not duplicate refund, inventory, or channel restoration", async () => {
  const { state, runtime } = createRuntime();
  await executeHostBookingDecision(runtime, input("dashboard", "decline"));
  const replay = await executeHostBookingDecision(runtime, input("whatsapp", "decline"));
  assert.equal(replay.status, "already_processed");
  assert.equal(state.refunds, 1);
  assert.equal(state.inventoryReleases, 1);
  assert.equal(state.channelRestores, 1);
});

test("an already confirmed booking is reconciled safely as an approval recovery", async () => {
  const { state, runtime } = createRuntime("confirmed");
  const result = await executeHostBookingDecision(runtime, input("signed_link", "approve"));
  assert.equal(result.status, "already_processed");
  assert.equal(state.bookingStatus, "confirmed");
  assert.equal(state.reconciliations, 1);
});

test("an already declined booking is reconciled safely without duplicate release effects", async () => {
  const { state, runtime } = createRuntime("rejected");
  const result = await executeHostBookingDecision(runtime, input("whatsapp", "decline"));
  assert.equal(result.status, "already_processed");
  assert.equal(state.bookingStatus, "rejected");
  assert.equal(state.refunds, 1);
  assert.equal(state.inventoryReleases, 1);
  assert.equal(state.channelRestores, 1);
});

test("approve followed by decline cannot change the booking", async () => {
  const { state, runtime } = createRuntime();
  await executeHostBookingDecision(runtime, input("dashboard", "approve"));
  await assert.rejects(
    executeHostBookingDecision(runtime, input("whatsapp", "decline")),
    (error: unknown) => error instanceof HostBookingDecisionError && error.code === "CONFLICTING_DECISION"
  );
  assert.equal(state.bookingStatus, "confirmed");
});

test("decline followed by approve cannot change the booking", async () => {
  const { state, runtime } = createRuntime();
  await executeHostBookingDecision(runtime, input("signed_link", "decline"));
  await assert.rejects(
    executeHostBookingDecision(runtime, input("dashboard", "approve")),
    (error: unknown) => error instanceof HostBookingDecisionError && error.code === "CONFLICTING_DECISION"
  );
  assert.equal(state.bookingStatus, "rejected");
});

test("a downstream failure remains retryable and completes on recovery", async () => {
  const { state, runtime } = createRuntime();
  state.failNextReconcile = true;
  await assert.rejects(executeHostBookingDecision(runtime, input("whatsapp", "decline")), /downstream unavailable/);
  assert.equal(state.decisionStatus, "failed");
  assert.equal(state.completions, 0);

  const recovered = await executeHostBookingDecision(runtime, input("whatsapp", "decline"));
  assert.equal(recovered.status, "already_processed");
  assert.equal(state.decisionStatus, "completed");
  assert.equal(state.refunds, 1);
});

test("WhatsApp action is released instead of completed when the decision fails", async () => {
  let completed = 0;
  let released = 0;
  await assert.rejects(
    executeWhatsAppDecisionWithCompletion({
      applyDecision: async () => {
        throw new Error("decision failed");
      },
      completeAction: async () => {
        completed += 1;
      },
      releaseAction: async () => {
        released += 1;
      },
    }),
    /decision failed/
  );
  assert.equal(completed, 0);
  assert.equal(released, 1);
});

test("successful WhatsApp action is completed once after the decision", async () => {
  const order: string[] = [];
  await executeWhatsAppDecisionWithCompletion({
    applyDecision: async () => {
      order.push("decision");
      return "confirmed";
    },
    completeAction: async () => {
      order.push("complete");
    },
    releaseAction: async () => {
      order.push("release");
    },
  });
  assert.deepEqual(order, ["decision", "complete"]);
});

test("host mismatch cannot change a booking", async () => {
  const { state, runtime } = createRuntime();
  await assert.rejects(
    executeHostBookingDecision(runtime, input("dashboard", "approve", "another-host")),
    (error: unknown) => error instanceof HostBookingDecisionError && error.code === "HOST_MISMATCH"
  );
  assert.equal(state.bookingStatus, "pending_host_approval");
  assert.equal(state.reconciliations, 0);
});

test("payment verify and webhook use one shared action-notification orchestrator", () => {
  const verifyRoute = readFileSync("app/api/payments/verify/route.ts", "utf8");
  const webhookRoute = readFileSync("app/api/payments/webhook/route.ts", "utf8");
  const sharedService = readFileSync("lib/booking-payment-notifications.ts", "utf8");

  assert.match(verifyRoute, /enqueuePostPaymentBookingNotifications/);
  assert.match(webhookRoute, /enqueuePostPaymentBookingNotifications/);
  assert.match(
    webhookRoute,
    /if \(!paymentLookup\.error && !paymentLookup\.data && gatewayOrderId\)/
  );
  assert.doesNotMatch(verifyRoute, /createOrReuseBookingWhatsAppAction/);
  assert.doesNotMatch(webhookRoute, /createOrReuseBookingWhatsAppAction/);
  assert.match(sharedService, /createOrReuseBookingWhatsAppAction/);
  assert.match(sharedService, /booking_host_action_required:\$\{bookingId\}:whatsapp/);
});

test("booking chat access is not cached across a host decision", () => {
  const chatAccess = readFileSync("lib/chat-access.ts", "utf8");

  assert.match(chatAccess, /if \(result\.kind === "network"\) \{\s*writeAccessCache\(cacheKey, result\)/);
  assert.doesNotMatch(chatAccess, /\n\s*writeAccessCache\(cacheKey, result\);\s*\n\s*return result;/);
});

test("disabled finance pipeline skips optional folio schema reads", () => {
  const financeWriter = readFileSync("lib/finance/folio-line-writer.ts", "utf8");
  const disabledGuard = financeWriter.indexOf('policy.skippedReason === "pipeline_disabled"');
  const reservationRead = financeWriter.indexOf("const reservationState = await ensureReservationForBooking", disabledGuard);

  assert.notEqual(disabledGuard, -1);
  assert.ok(reservationRead > disabledGuard);
  assert.match(financeWriter.slice(disabledGuard, reservationRead), /return \{/);
});
