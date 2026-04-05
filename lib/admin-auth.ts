import { createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_COOKIE_NAME = "famlo-admin-session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

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

export function getAdminCookieName(): string {
  return ADMIN_COOKIE_NAME;
}

export function createAdminSessionToken(): string {
  const secret = getRequiredEnv("ADMIN_SESSION_SECRET");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
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

  const expectedSignature = createSignature(
    expiresAt,
    getRequiredEnv("ADMIN_SESSION_SECRET")
  );

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

export function getAdminSessionMaxAge(): number {
  return SESSION_DURATION_SECONDS;
}
