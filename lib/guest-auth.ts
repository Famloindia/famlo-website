import { createHmac, timingSafeEqual } from "node:crypto";

import { getGuestCookieName, getGuestSessionMaxAge } from "./auth-constants";

function getGuestSessionSecret(): string {
  const value = process.env.ADMIN_SESSION_SECRET ?? process.env.CRON_SECRET;
  if (!value) {
    throw new Error("Missing environment variable: ADMIN_SESSION_SECRET");
  }
  return value;
}

function createSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export { getGuestCookieName, getGuestSessionMaxAge };

export function createGuestSessionToken(userId: string, phone: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + getGuestSessionMaxAge();
  const payload = `${userId}.${phone}.${expiresAt}`;
  const signature = createSignature(payload, getGuestSessionSecret());
  return `${payload}.${signature}`;
}

export function readGuestSessionToken(token: string | undefined): { userId: string; phone: string } | null {
  if (!token) return null;

  const [userId, phone, expiresAt, providedSignature] = token.split(".");
  if (!userId || !phone || !expiresAt || !providedSignature) {
    return null;
  }

  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) {
    return null;
  }

  const payload = `${userId}.${phone}.${expiresAt}`;
  const expectedSignature = createSignature(payload, getGuestSessionSecret());
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  return { userId, phone };
}
