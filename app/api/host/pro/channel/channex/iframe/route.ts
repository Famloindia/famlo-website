import { NextResponse } from "next/server";

import {
  buildChannexIframeUrl,
  createChannexOneTimeToken,
  getChannexConfigSummary,
  type ChannexEnvironment,
} from "@/lib/channel-providers/channex/client";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ChannexIframeBody = {
  familyId?: string;
  providerKey?: string;
};

const CHANNEL_CODES_BY_PROVIDER: Partial<Record<ChannelProviderKey, string[]>> = {
  booking: ["BDC"],
  airbnb: ["ABB"],
  agoda: ["AGO"],
  expedia: ["EXP"],
  "google-hotel": ["GHA"],
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function logIframeEvent(input: {
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
    action: "open_channex_iframe",
    status: input.status,
    message: input.message,
    payload: input.payload ?? {},
  } as never);

  if (error) {
    console.error("[host.pro.channel.channex.iframe] log failed:", error);
  }
}

function resolveIframeChannels(providerKey: ChannelProviderKey): string[] {
  return CHANNEL_CODES_BY_PROVIDER[providerKey] ?? [];
}

function resolveIframeHint(providerKey: ChannelProviderKey, filteredChannels: string[]): string {
  if (providerKey === "mmt") {
    return "Channex does not publish a dedicated MakeMyTrip filter code in the public iframe docs, so the workspace opens on the property channels page. Choose MakeMyTrip / Goibibo inside Channex and continue test connection there.";
  }

  if (filteredChannels.length > 0) {
    return `The Channex workspace is filtered to ${filteredChannels.join(", ")} for this provider.`;
  }

  return "The Channex workspace opens on the property channels page for this provider.";
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  let familyId = "";
  let providerKey = "" as ChannelProviderKey | "";

  try {
    const body = (await request.json()) as ChannexIframeBody;
    familyId = asString(body.familyId);
    const providerKeyInput = asString(body.providerKey);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKeyInput)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }
    providerKey = providerKeyInput;

    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const config = getChannexConfigSummary();
    if (!config.configured) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: "Channex configuration is incomplete.",
        },
        { status: 503 }
      );
    }

    const { data: channexRow, error: lookupError } = await supabase
      .from("channel_properties")
      .select("id,external_property_id,metadata")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .maybeSingle();

    if (lookupError) throw lookupError;

    const propertyId =
      typeof channexRow?.external_property_id === "string" && channexRow.external_property_id.trim().length > 0
        ? channexRow.external_property_id.trim()
        : null;

    if (!propertyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "missing_property",
          error: "Create the Channex property first before opening the real channel workspace.",
        },
        { status: 409 }
      );
    }

    const username =
      authorizedResource.hostSession?.authUserId ||
      authorizedResource.hostUserId ||
      `famlo-${familyId.slice(0, 8)}`;

    const tokenResult = await createChannexOneTimeToken({
      propertyId,
      username,
    });

    if (!tokenResult.ok || !tokenResult.token) {
      await logIframeEvent({
        supabase,
        familyId,
        providerKey,
        status: "failed",
        message: tokenResult.message,
        payload: {
          environment: tokenResult.environment,
          endpoint: tokenResult.endpoint,
          http_status: tokenResult.httpStatus,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: tokenResult.message,
        },
        { status: 502 }
      );
    }

    const filteredChannels = resolveIframeChannels(providerKey);
    const iframeUrl = buildChannexIframeUrl({
      oneTimeToken: tokenResult.token,
      propertyId,
      channels: filteredChannels,
      language: "en",
    });

    await logIframeEvent({
      supabase,
      familyId,
      providerKey,
      status: "success",
      message: "Opened Channex iframe workspace for property-level channel setup.",
      payload: {
        property_id: propertyId,
        environment: tokenResult.environment as ChannexEnvironment,
        filtered_channels: filteredChannels,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "ready",
      iframeUrl,
      propertyId,
      filteredChannels,
      providerHint: resolveIframeHint(providerKey, filteredChannels),
      message: "Real Channex workspace is ready. This opens property-scoped channel create/test/mapping UI.",
    });
  } catch (error) {
    if (familyId && providerKey) {
      await logIframeEvent({
        supabase,
        familyId,
        providerKey,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to open the Channex workspace.",
      });
    }

    console.error("[host.pro.channel.channex.iframe] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unable to open the Channex workspace.",
      },
      { status: 500 }
    );
  }
}
