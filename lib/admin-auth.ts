import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

import { getAdminCookieName, getTeamsCookieName, getAdminSessionMaxAge } from "./auth-constants";

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
