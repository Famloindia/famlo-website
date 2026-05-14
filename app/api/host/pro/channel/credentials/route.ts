import { NextResponse } from "next/server";

import {
  channelCredentialStorageConfigured,
  encryptChannelCredential,
  mergeEncryptedChannelCredential,
} from "@/lib/channel-credentials";
import { isChannelProviderKey, mergeChannelSetupMetadata, readChannelSetupState } from "@/lib/channel-setup-state";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type CredentialRequestBody = {
  familyId?: string;
  providerKey?: string;
  credentialType?: string;
  credentialValue?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function credentialAllowedForProvider(providerKey: ChannelProviderKey, credentialType: string): boolean {
  return providerKey === "mmt" && credentialType === "access_token";
}

async function logCredentialEvent(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  providerKey: ChannelProviderKey;
  status: "success" | "failed";
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: input.providerKey,
    action: "provider_credential_store",
    status: input.status,
    message: input.message,
    payload: input.payload ?? {},
  } as never);

  if (error) {
    console.error("[host.pro.channel.credentials] log failed:", error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  let familyId = "";
  let providerKey = "" as ChannelProviderKey | "";

  try {
    const body = (await request.json()) as CredentialRequestBody;
    familyId = asString(body.familyId);
    const providerKeyInput = asString(body.providerKey);
    const credentialType = asString(body.credentialType || "access_token");
    const credentialValue = asString(body.credentialValue);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKeyInput)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }
    providerKey = providerKeyInput;

    if (!credentialAllowedForProvider(providerKey, credentialType)) {
      return NextResponse.json({ error: "This credential type is not supported for this provider yet." }, { status: 400 });
    }

    if (credentialValue.length < 8) {
      return NextResponse.json({ error: "Credential value is too short." }, { status: 400 });
    }

    if (!channelCredentialStorageConfigured()) {
      return NextResponse.json(
        { error: "Secure credential storage is not configured. Add CHANNEL_CREDENTIALS_ENCRYPTION_KEY first." },
        { status: 503 }
      );
    }

    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const { data: existingRow, error: lookupError } = await supabase
      .from("channel_properties")
      .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", providerKey)
      .maybeSingle();

    if (lookupError) throw lookupError;

    const nowIso = new Date().toISOString();
    const encryptedCredential = encryptChannelCredential({
      value: credentialValue,
      storedAt: nowIso,
      storedBy: authorizedResource.hostUserId ?? null,
    });

    const metadataWithCredential = mergeEncryptedChannelCredential({
      metadata: asRecord(existingRow?.metadata),
      providerKey,
      credentialKey: credentialType,
      credential: encryptedCredential,
    });

    const nextMetadata = mergeChannelSetupMetadata(metadataWithCredential, {
      status: "connection_requested",
      currentStep: "connection",
      lastError: null,
      metadataPatch: {
        provider_access_token_stored: true,
        provider_access_token_last_four: encryptedCredential.lastFour,
        provider_access_token_stored_at: nowIso,
        provider_credential_store_status: "stored_securely",
        provider_connection_status: "details_submitted",
        provider_connection_error: null,
        operator_setup_requested: true,
      },
      updatedAt: nowIso,
    });

    const payload = {
      family_id: familyId,
      provider_code: providerKey,
      external_property_id: typeof existingRow?.external_property_id === "string" ? existingRow.external_property_id : null,
      sync_status: typeof existingRow?.sync_status === "string" ? existingRow.sync_status : "not_connected",
      metadata: nextMetadata,
      updated_at: nowIso,
    };

    const { error: upsertError } = await supabase
      .from("channel_properties")
      .upsert(payload as never, { onConflict: "family_id,provider_code" });

    if (upsertError) throw upsertError;

    const { data: savedRow, error: savedError } = await supabase
      .from("channel_properties")
      .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", providerKey)
      .maybeSingle();

    if (savedError) throw savedError;

    await logCredentialEvent({
      supabase,
      familyId,
      providerKey,
      status: "success",
      message: "Provider credential was encrypted and stored for operator-only channel setup.",
      payload: {
        credential_type: credentialType,
        last_four: encryptedCredential.lastFour,
        stored_at: nowIso,
      },
    });

    const state = savedRow
      ? readChannelSetupState({
          id: typeof savedRow.id === "string" ? savedRow.id : "",
          familyId,
          providerCode: providerKey,
          externalPropertyId: typeof savedRow.external_property_id === "string" ? savedRow.external_property_id : null,
          propertyModel: null,
          propertyType: null,
          syncStatus: typeof savedRow.sync_status === "string" ? savedRow.sync_status : "not_connected",
          lastSyncedAt: null,
          metadata: asRecord(savedRow.metadata),
          createdAt: typeof savedRow.created_at === "string" ? savedRow.created_at : null,
          updatedAt: typeof savedRow.updated_at === "string" ? savedRow.updated_at : null,
        })
      : null;

    return NextResponse.json({
      ok: true,
      status: "stored_securely",
      message: "Credential stored securely for Famlo operator verification. No sync or activation was run.",
      credential: {
        type: credentialType,
        lastFour: encryptedCredential.lastFour,
        storedAt: nowIso,
      },
      state,
    });
  } catch (error) {
    if (familyId && providerKey) {
      await logCredentialEvent({
        supabase,
        familyId,
        providerKey,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to store provider credential.",
      });
    }

    console.error("[host.pro.channel.credentials] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to store provider credential." },
      { status: 500 }
    );
  }
}
