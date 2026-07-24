import { createHmac, timingSafeEqual } from "node:crypto";

export const HOST_SESSION_COOKIE = "famlo_host_session";

type HostSessionPayload = {
  familyId: string;
  userId: string;
  expiresAt: number;
};

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET ?? process.env.CRON_SECRET;
  if (!value) throw new Error("Missing environment variable: ADMIN_SESSION_SECRET");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createHostSessionToken(input: {
  familyId: string;
  userId: string;
  maxAgeSeconds?: number;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      familyId: input.familyId,
      userId: input.userId,
      expiresAt: Date.now() + (input.maxAgeSeconds ?? 60 * 60 * 24 * 30) * 1000,
    } satisfies HostSessionPayload)
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readHostSessionToken(token: string | null | undefined): HostSessionPayload | null {
  if (!token) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<HostSessionPayload>;
    if (
      typeof parsed.familyId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return parsed as HostSessionPayload;
  } catch {
    return null;
  }
}
