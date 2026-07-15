import type { SupabaseClient } from "@supabase/supabase-js";

import { getAppEnv, type AppEnv } from "@/lib/app-env";
import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import {
  buildBasicHostDashboardHref,
  buildFamloProDashboardHref,
  isFamloProDashboardEnabled,
  loadHostProAccess,
  type HostProAccessResult,
} from "@/lib/host-pro-access";
import { safeSelectFamilyOptionalField } from "@/lib/partner-login-compat";

export type HostMobileRouteKey =
  | "free"
  | "pro"
  | "bookings"
  | "calendar"
  | "messages"
  | "revenue"
  | "reports"
  | "support-billing"
  | "profile";

export type HostMobileDefaultDestination = "login" | "free" | "pro";

export type HostMobileSessionResponse = {
  ok: true;
  authenticated: boolean;
  loginRequired: boolean;
  appEnv: AppEnv;
  badge: {
    visible: boolean;
    label: "STAGING" | null;
  };
  host: null | {
    hostUserId: string | null;
    displayName: string;
    photoUrl: string | null;
  };
  workspace: null | {
    selectedFamilyId: string;
    selectedFamilyName: string | null;
    availableFamilyIds: string[];
    propertyCount: number;
  };
  pro: {
    dashboardEnabled: boolean;
    allowed: boolean;
    paidActive: boolean;
    inGrace: boolean;
    status: HostProAccessResult["status"];
    reason: string;
    currentPeriodEnd: string | null;
    graceUntil: string | null;
    expiresAt: string | null;
    defaultWorkspace: "pro" | "free";
    proActionsAllowed: boolean;
  };
  mode: "free" | "pro";
  defaultDestination: HostMobileDefaultDestination;
  defaultRoute: "/app/host/login" | "/app/host/free" | "/app/host/pro";
  allowedRoutes: string[];
  ui: {
    showRevenue: boolean;
    showEnvironmentBadge: boolean;
  };
};

type WorkspaceFamilyRow = {
  id: string;
  name: string | null;
  property_name?: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asMeaningfulName(value: unknown): string | null {
  const next = asString(value);
  if (!next) return null;
  const condensed = next.replace(/[.\s]/g, "");
  return condensed.length >= 2 ? next : null;
}

function isSchemaCompatibilityError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  return /property_name|schema cache|does not exist|Could not find/i.test(message);
}

function resolveHostMobileDefaultRoute(input: {
  authenticated: boolean;
  proAllowed: boolean;
}): HostMobileSessionResponse["defaultRoute"] {
  if (!input.authenticated) return "/app/host/login";
  return input.proAllowed ? "/app/host/pro" : "/app/host/free";
}

function resolveHostMobileDefaultDestination(input: {
  authenticated: boolean;
  proAllowed: boolean;
}): HostMobileDefaultDestination {
  if (!input.authenticated) return "login";
  return input.proAllowed ? "pro" : "free";
}

function buildAllowedRoutes(proAllowed: boolean): string[] {
  const base = [
    "/app/host",
    "/app/host/login",
    "/app/host/free",
    "/app/host/bookings",
    "/app/host/calendar",
    "/app/host/messages",
    "/app/host/reports",
    "/app/host/support-billing",
    "/app/host/profile",
  ];

  return proAllowed ? [...base, "/app/host/pro", "/app/host/revenue"] : base;
}

function emptyProState(dashboardEnabled: boolean): HostMobileSessionResponse["pro"] {
  return {
    dashboardEnabled,
    allowed: false,
    paidActive: false,
    inGrace: false,
    status: "inactive",
    reason: dashboardEnabled ? "no_subscription" : "pro_dashboard_disabled",
    currentPeriodEnd: null,
    graceUntil: null,
    expiresAt: null,
    defaultWorkspace: "free",
    proActionsAllowed: false,
  };
}

export function resolveHostMobileLegacyDashboardHref(input: {
  familyId: string;
  proAllowed: boolean;
  routeKey: HostMobileRouteKey;
}): string {
  const { familyId, proAllowed, routeKey } = input;
  const withAppShell = (href: string): string => `${href}${href.includes("?") ? "&" : "?"}appShell=1`;

  if (proAllowed) {
    if (routeKey === "pro") return withAppShell(buildFamloProDashboardHref(familyId, "dashboard"));
    if (routeKey === "bookings") return withAppShell(buildFamloProDashboardHref(familyId, "bookings"));
    if (routeKey === "calendar") return withAppShell(buildFamloProDashboardHref(familyId, "inventory-calendar"));
    if (routeKey === "messages") return withAppShell(buildFamloProDashboardHref(familyId, "messages-reviews"));
    if (routeKey === "revenue") return withAppShell(buildFamloProDashboardHref(familyId, "revenue"));
    if (routeKey === "reports") return withAppShell(buildFamloProDashboardHref(familyId, "reports"));
    if (routeKey === "support-billing") return withAppShell(buildFamloProDashboardHref(familyId, "support"));
    if (routeKey === "profile") return withAppShell(buildFamloProDashboardHref(familyId, "settings"));
    return withAppShell(buildFamloProDashboardHref(familyId, "properties-home"));
  }

  if (routeKey === "pro") return withAppShell(buildBasicHostDashboardHref(familyId, "famlo-plus"));
  if (routeKey === "bookings") return withAppShell(buildBasicHostDashboardHref(familyId, "bookings"));
  if (routeKey === "calendar") return withAppShell(buildBasicHostDashboardHref(familyId, "calendar"));
  if (routeKey === "messages") return withAppShell(buildBasicHostDashboardHref(familyId, "messages"));
  if (routeKey === "revenue") return withAppShell(buildBasicHostDashboardHref(familyId, "earnings"));
  if (routeKey === "reports") return withAppShell(buildBasicHostDashboardHref(familyId, "famlo-plus"));
  if (routeKey === "support-billing") return withAppShell(buildBasicHostDashboardHref(familyId, "support"));
  if (routeKey === "profile") return withAppShell(buildBasicHostDashboardHref(familyId, "profile"));
  return withAppShell(buildBasicHostDashboardHref(familyId, "dashboard"));
}

export async function resolveHostMobileSession(
  supabase: SupabaseClient,
  request?: Request
): Promise<HostMobileSessionResponse> {
  const appEnv = getAppEnv();
  const showEnvironmentBadge = appEnv !== "production";
  const proDashboardEnabled = isFamloProDashboardEnabled();
  const hostSession = await resolveAuthorizedHostSession(supabase, request);

  if (!hostSession?.familyId) {
    const defaultRoute = resolveHostMobileDefaultRoute({ authenticated: false, proAllowed: false });
    return {
      ok: true,
      authenticated: false,
      loginRequired: true,
      appEnv,
      badge: {
        visible: showEnvironmentBadge,
        label: showEnvironmentBadge ? "STAGING" : null,
      },
      host: null,
      workspace: null,
      pro: emptyProState(proDashboardEnabled),
      mode: "free",
      defaultDestination: resolveHostMobileDefaultDestination({ authenticated: false, proAllowed: false }),
      defaultRoute,
      allowedRoutes: ["/app/host/login"],
      ui: {
        showRevenue: false,
        showEnvironmentBadge,
      },
    };
  }

  const selectedFamilyId = hostSession.familyId;
  const hostUserId = hostSession.hostUserId;
  async function loadWorkspaceFamilies(): Promise<WorkspaceFamilyRow[]> {
    const queryWithPropertyName =
      hostUserId
        ? supabase
            .from("families")
            .select("id,name,property_name")
            .eq("user_id", hostUserId)
            .order("updated_at", { ascending: false })
        : supabase.from("families").select("id,name,property_name").eq("id", selectedFamilyId);
    const result = await queryWithPropertyName;
    if (!result.error) return ((result.data ?? []) as WorkspaceFamilyRow[]).filter((row) => asString(row.id));

    if (!isSchemaCompatibilityError(result.error)) return [];

    const fallbackQuery =
      hostUserId
        ? supabase
            .from("families")
            .select("id,name")
            .eq("user_id", hostUserId)
            .order("updated_at", { ascending: false })
        : supabase.from("families").select("id,name").eq("id", selectedFamilyId);
    const fallback = await fallbackQuery;
    return ((fallback.data ?? []) as WorkspaceFamilyRow[]).filter((row) => asString(row.id));
  }

  const [familyRows, { data: hostRow }, familyHostPhotoUrl, proAccess, hostUserRowResult] = await Promise.all([
    loadWorkspaceFamilies(),
    hostSession.hostId
      ? supabase
          .from("hosts")
          .select("display_name,user_id,metadata")
          .eq("id", hostSession.hostId)
          .maybeSingle()
      : supabase
          .from("hosts")
          .select("display_name,user_id,metadata")
          .eq("legacy_family_id", selectedFamilyId)
          .maybeSingle(),
    safeSelectFamilyOptionalField(supabase, selectedFamilyId, "host_photo_url"),
    proDashboardEnabled ? loadHostProAccess(supabase, selectedFamilyId) : Promise.resolve(null),
    hostSession.hostUserId
      ? supabase
          .from("users")
          .select("avatar_url,name")
          .eq("id", hostSession.hostUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const workspaceRowsById = new Map<string, WorkspaceFamilyRow>();
  for (const row of familyRows) {
    const id = asString(row?.id);
    if (id && !workspaceRowsById.has(id)) {
      workspaceRowsById.set(id, row as WorkspaceFamilyRow);
    }
  }
  const workspaceRows = Array.from(workspaceRowsById.values());
  const selectedFamily =
    workspaceRows.find((row) => row.id === selectedFamilyId) ??
    workspaceRows[0] ??
    ({ id: selectedFamilyId, name: null, property_name: null } satisfies WorkspaceFamilyRow);
  const proAllowed = Boolean(proDashboardEnabled && proAccess?.allowed);
  const defaultRoute = resolveHostMobileDefaultRoute({ authenticated: true, proAllowed });
  const resolvedHostUserId =
    asString((hostRow as Record<string, unknown> | null)?.user_id) ??
    hostSession.hostUserId;
  const hostMetadata = asRecord((hostRow as Record<string, unknown> | null)?.metadata);
  let hostPhotoUrl =
    asString((hostMetadata as Record<string, unknown> | null)?.profile_photo_url) ??
    familyHostPhotoUrl;

  let hostUserName: string | null = null;
  let hostUserRow = (hostUserRowResult.data as Record<string, unknown> | null) ?? null;

  if (resolvedHostUserId && !hostUserRow) {
    const { data: fallbackHostUserRow } = await supabase
      .from("users")
      .select("avatar_url,name")
      .eq("id", resolvedHostUserId)
      .maybeSingle();
    hostUserRow = (fallbackHostUserRow as Record<string, unknown> | null) ?? null;
  }
  hostPhotoUrl = hostPhotoUrl ?? asString(hostUserRow?.avatar_url);
  hostUserName = asMeaningfulName(hostUserRow?.name);

  return {
    ok: true,
    authenticated: true,
    loginRequired: false,
    appEnv,
    badge: {
      visible: showEnvironmentBadge,
      label: showEnvironmentBadge ? "STAGING" : null,
    },
    host: {
      hostUserId: hostSession.hostUserId,
      displayName:
        asMeaningfulName(hostRow?.display_name) ??
        asMeaningfulName((hostMetadata as Record<string, unknown> | null)?.full_name) ??
        asMeaningfulName((hostMetadata as Record<string, unknown> | null)?.name) ??
        hostUserName ??
        "Famlo Host",
      photoUrl: hostPhotoUrl,
    },
    workspace: {
      selectedFamilyId: selectedFamily.id,
      selectedFamilyName: asString(selectedFamily.property_name) ?? asString(selectedFamily.name),
      availableFamilyIds: workspaceRows.map((row) => row.id),
      propertyCount: workspaceRows.length > 0 ? workspaceRows.length : 1,
    },
    pro: proAccess
      ? {
          dashboardEnabled: proDashboardEnabled,
          allowed: proAccess.allowed,
          paidActive: proAccess.paidActive,
          inGrace: proAccess.inGrace,
          status: proAccess.status,
          reason: proAccess.reason,
          currentPeriodEnd: proAccess.current_period_end,
          graceUntil: proAccess.grace_until,
          expiresAt: proAccess.expires_at,
          defaultWorkspace: proAccess.defaultWorkspace,
          proActionsAllowed: proAccess.proActionsAllowed,
        }
      : emptyProState(proDashboardEnabled),
    mode: proAllowed ? "pro" : "free",
    defaultDestination: resolveHostMobileDefaultDestination({ authenticated: true, proAllowed }),
    defaultRoute,
    allowedRoutes: buildAllowedRoutes(proAllowed),
    ui: {
      showRevenue: proAllowed,
      showEnvironmentBadge,
    },
  };
}
