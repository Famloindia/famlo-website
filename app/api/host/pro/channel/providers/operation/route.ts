import { NextRequest, NextResponse } from "next/server";

import {
  enqueueChannelSyncJob,
  executeChannelProviderOperation,
  type ChannelProviderOperationType,
} from "@/lib/channel-provider-framework";
import { isChannelProviderKey } from "@/lib/channel-setup-state";
import { getErrorMessage } from "@/lib/error-utils";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { asString, type JsonRecord } from "@/lib/platform-utils";
import { createAdminSupabaseClient } from "@/lib/supabase";

type OperationBody = {
  familyId?: string;
  providerKey?: string;
  operationType?: string;
  dryRun?: boolean;
  idempotencyKey?: string | null;
  payload?: JsonRecord;
  enqueueFollowup?: boolean;
};

const OPERATION_TYPES = new Set<ChannelProviderOperationType>([
  "create_provider",
  "test_provider",
  "connect_provider",
  "refresh_provider",
  "activate_provider",
  "deactivate_provider",
  "verify_mappings",
  "reconcile",
]);

function asOperationType(value: unknown): ChannelProviderOperationType | null {
  const normalized = asString(value);
  return normalized && OPERATION_TYPES.has(normalized as ChannelProviderOperationType)
    ? (normalized as ChannelProviderOperationType)
    : null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as OperationBody;
    const familyId = asString(body.familyId);
    const providerInput = asString(body.providerKey);
    const operationType = asOperationType(body.operationType);

    if (!familyId) {
      return NextResponse.json({ ok: false, error: "familyId is required." }, { status: 400 });
    }
    if (!providerInput || !isChannelProviderKey(providerInput)) {
      return NextResponse.json({ ok: false, error: "providerKey is invalid." }, { status: 400 });
    }
    if (!operationType) {
      return NextResponse.json({ ok: false, error: "operationType is invalid." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const providerKey = providerInput;
    const result = await executeChannelProviderOperation(supabase, {
      familyId,
      providerKey,
      operationType,
      actorUserId: authorizedResource.hostUserId ?? null,
      actorRole: authorizedResource.isAdmin ? "admin" : "host",
      dryRun: body.dryRun ?? operationType === "activate_provider",
      idempotencyKey:
        asString(body.idempotencyKey) ??
        `${familyId}:${providerKey}:${operationType}:${JSON.stringify(asObject(body.payload)).slice(0, 240)}`,
      payload: asObject(body.payload),
    });

    let followupJobId: string | null = null;
    if (body.enqueueFollowup && result.ok && ["create_provider", "connect_provider"].includes(operationType)) {
      followupJobId = await enqueueChannelSyncJob(supabase, {
        familyId,
        providerKey,
        jobType: "provider_refresh",
        payload: {
          source_operation_id: result.operationId,
        },
        idempotencyKey: `provider_refresh:${familyId}:${providerKey}:${result.operationId}`,
        priority: 50,
        runAfter: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    }

    return NextResponse.json(
      {
        ok: result.ok,
        status: result.status,
        message: result.message,
        operationId: result.operationId,
        followupJobId,
        providerKey,
        familyId,
        connection: result.connection,
        data: result.data,
      },
      { status: result.status === "blocked" ? 409 : result.ok ? 200 : 500 }
    );
  } catch (error) {
    console.error("[host.pro.channel.providers.operation] failed:", error);
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Unable to run provider operation.") },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const familyId = asString(request.nextUrl.searchParams.get("familyId"));
    const providerInput = asString(request.nextUrl.searchParams.get("providerKey"));
    if (!familyId) {
      return NextResponse.json({ ok: false, error: "familyId is required." }, { status: 400 });
    }
    if (!providerInput || !isChannelProviderKey(providerInput)) {
      return NextResponse.json({ ok: false, error: "providerKey is invalid." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const [connection, operations, jobs, diagnostics, reconciliations] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("*")
        .eq("family_id", familyId)
        .eq("provider_code", providerInput)
        .maybeSingle(),
      supabase
        .from("channel_operation_ledger")
        .select("*")
        .eq("family_id", familyId)
        .eq("provider_code", providerInput)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("channel_sync_jobs")
        .select("*")
        .eq("family_id", familyId)
        .eq("provider_code", providerInput)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("channel_provider_diagnostics")
        .select("*")
        .eq("family_id", familyId)
        .eq("provider_code", providerInput)
        .order("last_seen_at", { ascending: false })
        .limit(20),
      supabase
        .from("channel_reconciliation_runs")
        .select("*")
        .eq("family_id", familyId)
        .eq("provider_code", providerInput)
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

    if (connection.error) throw connection.error;
    if (operations.error) throw operations.error;
    if (jobs.error) throw jobs.error;
    if (diagnostics.error) throw diagnostics.error;
    if (reconciliations.error) throw reconciliations.error;

    return NextResponse.json({
      ok: true,
      familyId,
      providerKey: providerInput,
      connection: connection.data ?? null,
      operations: operations.data ?? [],
      jobs: jobs.data ?? [],
      diagnostics: diagnostics.data ?? [],
      reconciliations: reconciliations.data ?? [],
    });
  } catch (error) {
    console.error("[host.pro.channel.providers.operation.status] failed:", error);
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Unable to load provider operation status.") },
      { status: 500 }
    );
  }
}
