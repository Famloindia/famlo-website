import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

import { createAdminSupabaseClient } from "./supabase";
import { getAdminCookieName, getSupabaseAccessTokenCookieName, getTeamsCookieName, getAdminSessionMaxAge } from "./auth-constants";

export type AdminPermission = "ops" | "finance" | "support" | "compliance" | "channels" | "read_only";

export type AdminAccessContext = {
  actorId: string | null;
  actorRole: "super_admin" | "team";
  permissions: AdminPermission[];
};

const ALL_ADMIN_PERMISSIONS: AdminPermission[] = ["ops", "finance", "support", "compliance", "channels", "read_only"];

function getRequiredEnv(name: "ADMIN_PASSWORD" | "ADMIN_SESSION_SECRET"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function createSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export { getAdminCookieName, getTeamsCookieName, getAdminSessionMaxAge };

function isAdminPermission(value: string): value is AdminPermission {
  return ALL_ADMIN_PERMISSIONS.includes(value as AdminPermission);
}

function normalizePermissionList(value: unknown): AdminPermission[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
      .filter((item): item is AdminPermission => isAdminPermission(item));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is AdminPermission => isAdminPermission(item));
  }
  return [];
}

function uniquePermissions(values: AdminPermission[]): AdminPermission[] {
  return Array.from(new Set(values));
}

export function createAdminSessionToken(): string {
  const secret = getRequiredEnv("ADMIN_SESSION_SECRET");
  const expiresAt = Math.floor(Date.now() / 1000) + getAdminSessionMaxAge();
  const payload = `${expiresAt}`;
  const signature = createSignature(payload, secret);

  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  const [expiresAt, providedSignature] = token.split(".");

  if (!expiresAt || !providedSignature) {
    return false;
  }

  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = createSignature(expiresAt, getRequiredEnv("ADMIN_SESSION_SECRET"));
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function verifyAdminPassword(input: string): boolean {
  const expectedPassword = getRequiredEnv("ADMIN_PASSWORD");
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expectedPassword);

  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

export async function hasValidAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
}

export async function hasValidBackofficeSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(getAdminCookieName())?.value;
  const teamsToken = cookieStore.get(getTeamsCookieName())?.value;
  return verifyAdminSessionToken(adminToken) || verifyAdminSessionToken(teamsToken);
}

export async function resolveAdminAccessContext(): Promise<AdminAccessContext | null> {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(getAdminCookieName())?.value;
  if (verifyAdminSessionToken(adminToken)) {
    return {
      actorId: "system-admin",
      actorRole: "super_admin",
      permissions: ALL_ADMIN_PERMISSIONS,
    };
  }

  const accessToken = cookieStore.get(getSupabaseAccessTokenCookieName())?.value;
  if (!accessToken) return null;

  try {
    const supabase = createAdminSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);
    if (userError || !user) return null;

    const metadataRole = String(user.user_metadata?.role ?? user.app_metadata?.role ?? "").toLowerCase();
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) return null;

    const databaseRole = String((profile as { role?: unknown } | null)?.role ?? "").toLowerCase();
    const isTeamMember = metadataRole === "team" || databaseRole === "team";
    if (!isTeamMember) return null;

    const permissions = uniquePermissions([
      "read_only",
      ...normalizePermissionList(user.user_metadata?.permissions),
      ...normalizePermissionList(user.user_metadata?.admin_permissions),
      ...normalizePermissionList(user.user_metadata?.team_permissions),
      ...normalizePermissionList(user.user_metadata?.scopes),
      ...normalizePermissionList(user.app_metadata?.permissions),
      ...normalizePermissionList(user.app_metadata?.admin_permissions),
      ...normalizePermissionList(user.app_metadata?.team_permissions),
      ...normalizePermissionList(user.app_metadata?.scopes),
    ]);

    return {
      actorId: user.id,
      actorRole: "team",
      permissions,
    };
  } catch {
    return null;
  }
}

export async function hasAdminPermission(permission: AdminPermission): Promise<boolean> {
  const context = await resolveAdminAccessContext();
  if (!context) return false;
  if (context.actorRole === "super_admin") return true;
  return context.permissions.includes(permission);
}

export async function hasReadOnlyAdminAccess(): Promise<boolean> {
  const context = await resolveAdminAccessContext();
  if (!context) return false;
  if (context.actorRole === "super_admin") return true;
  return context.permissions.includes("read_only");
}
