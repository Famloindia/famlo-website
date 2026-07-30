import { NextResponse } from "next/server";

import {
  decideAccountLink,
  findGoogleProviderId,
  fingerprintProviderIdentity,
  hasUserBusinessData,
  recordAccountLinkEvent,
} from "@/lib/auth/account-linking";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const target = await resolveStrictAuthenticatedUser(supabase, request);
    if (!target || target.authKind !== "supabase") {
      return NextResponse.json(
        { error: "Reauthentication is required before linking." },
        { status: 401 }
      );
    }
    const body = (await request.json()) as { requestId?: unknown };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return NextResponse.json({ error: "Link request is required." }, { status: 400 });
    }

    const { data: linkRequest, error: requestError } = await supabase
      .from("account_link_requests")
      .select("*")
      .eq("id", requestId)
      .eq("target_user_id", target.id)
      .not("ownership_verified_at", "is", null)
      .maybeSingle();
    if (requestError || !linkRequest) {
      return NextResponse.json({ error: "Link request was not found." }, { status: 404 });
    }
    if (linkRequest.status === "linked") {
      return NextResponse.json({
        success: true,
        status: "linked",
        returnTo: linkRequest.intended_return_path,
      });
    }

    const [{ data: targetAuth }, { data: sourceAuth }, sourceHasBusinessData, targetHasBusinessData] =
      await Promise.all([
        supabase.auth.admin.getUserById(target.id),
        supabase.auth.admin.getUserById(linkRequest.source_user_id),
        hasUserBusinessData(supabase, linkRequest.source_user_id),
        hasUserBusinessData(supabase, target.id),
      ]);
    const targetProviderId = targetAuth.user
      ? findGoogleProviderId(targetAuth.user)
      : null;
    const sourceProviderId = sourceAuth.user
      ? findGoogleProviderId(sourceAuth.user)
      : null;
    const expectedFingerprint =
      typeof linkRequest.metadata?.source_provider_fingerprint === "string"
        ? linkRequest.metadata.source_provider_fingerprint
        : null;
    const identityLinked = Boolean(
      targetProviderId &&
        expectedFingerprint &&
        fingerprintProviderIdentity(targetProviderId) === expectedFingerprint &&
        (!sourceProviderId ||
          fingerprintProviderIdentity(sourceProviderId) !== expectedFingerprint)
    );
    const decision = decideAccountLink({
      ownershipVerified: true,
      sourceHasBusinessData,
      targetHasBusinessData,
      targetSupabaseSessionVerified: true,
      identityLinked,
    });
    const now = new Date().toISOString();

    if (decision.status === "blocked_business_data") {
      await supabase
        .from("account_link_requests")
        .update({
          status: decision.status,
          blocked_reason: decision.blockedReason,
          target_session_verified_at: now,
          updated_at: now,
        })
        .eq("id", requestId);
      await recordAccountLinkEvent(supabase, {
        requestId,
        eventType: "automatic_merge_blocked",
        actorUserId: target.id,
        metadata: { blocked_reason: decision.blockedReason },
      });
      return NextResponse.json(
        {
          error: "This link requires audited support review because account data must be preserved.",
          code: "MANUAL_ACCOUNT_MERGE_REQUIRED",
        },
        { status: 409 }
      );
    }
    if (!identityLinked) {
      await supabase
        .from("account_link_requests")
        .update({
          status: "awaiting_identity_link",
          target_session_verified_at: now,
          updated_at: now,
        })
        .eq("id", requestId);
      return NextResponse.json(
        {
          error: "Google identity linking has not completed.",
          code: "IDENTITY_LINK_PENDING",
        },
        { status: 409 }
      );
    }

    const { error: sourceMergeError } = await supabase
      .from("users")
      .update({
        account_status: "merged",
        merged_into_user_id: target.id,
        merged_at: now,
      })
      .eq("id", linkRequest.source_user_id)
      .in("account_status", ["active", "linking"]);
    if (sourceMergeError) throw sourceMergeError;
    const { error: linkUpdateError } = await supabase
      .from("account_link_requests")
      .update({
        status: "linked",
        target_session_verified_at: now,
        identity_linked_at: now,
        merge_completed_at: now,
        blocked_reason: null,
        updated_at: now,
      })
      .eq("id", requestId);
    if (linkUpdateError) throw linkUpdateError;
    await recordAccountLinkEvent(supabase, {
      requestId,
      eventType: "identity_linked",
      actorUserId: target.id,
    });

    return NextResponse.json({
      success: true,
      status: "linked",
      returnTo: linkRequest.intended_return_path,
    });
  } catch (error) {
    console.error("Account-link completion failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json(
      { error: "Account linking could not be completed." },
      { status: 500 }
    );
  }
}
