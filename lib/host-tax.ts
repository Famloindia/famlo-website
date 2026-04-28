import { createCipheriv, createHash, randomBytes } from "crypto";

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function normalizeBase64Url(value: string): string {
  return value.replace(/-/g, "+").replace(/_/g, "/");
}

function readEncryptionKey(): Buffer {
  const raw = process.env.PAN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("Missing required environment variable: PAN_ENCRYPTION_KEY");
  }

  const maybeHex = /^[a-fA-F0-9]{64}$/.test(raw) ? Buffer.from(raw, "hex") : null;
  if (maybeHex && maybeHex.length === 32) return maybeHex;

  const maybeBase64 = Buffer.from(normalizeBase64Url(raw), "base64");
  if (maybeBase64.length === 32) return maybeBase64;

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 32) return utf8;

  throw new Error("PAN_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM.");
}

export function normalizePanNumber(value: string): string {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

export function isValidPanNumber(value: string): boolean {
  return PAN_REGEX.test(normalizePanNumber(value));
}

export function maskPanNumber(value: string): string {
  const pan = normalizePanNumber(value);
  if (pan.length !== 10) return "";
  return `${pan.slice(0, 5)}****${pan.slice(-1)}`;
}

export function getPanLastFour(value: string): string {
  const pan = normalizePanNumber(value);
  return pan.slice(-4);
}

export function hashPanNumber(value: string): string {
  return createHash("sha256").update(normalizePanNumber(value)).digest("hex");
}

export function encryptPanNumber(value: string): string {
  const normalized = normalizePanNumber(value);
  const key = readEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}
