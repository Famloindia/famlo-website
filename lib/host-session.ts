import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const HOST_SESSION_COOKIE_NAME = "famlo-host-session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type HostSessionPayload = {
  v: 1;
  familyId: string;
  hostUserId: string;
  exp: number;
};

function getSessionSecret(): string {
  const secret = process.env.HOST_SESSION_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret || secret.length < 24) {
    throw new Error("Host session signing is not configured.");
  }
  return secret;
}
function sign(encodedPayload: string): string {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

export function createHostSessionToken(input: {
  familyId: string;
  hostUserId: string;
  now?: number;
}): string {
  const payload: HostSessionPayload = {
    v: 1,
    familyId: input.familyId,
    hostUserId: input.hostUserId,
    exp: Math.floor((input.now ?? Date.now()) / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyHostSessionToken(token: string | null | undefined, now = Date.now()): HostSessionPayload | null {
  if (!token) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<HostSessionPayload>;
    if (
      payload.v !== 1 ||
      typeof payload.familyId !== "string" ||
      !payload.familyId ||
      typeof payload.hostUserId !== "string" ||
      !payload.hostUserId ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(now / 1000)
    ) {
      return null;
    }
    return payload as HostSessionPayload;
  } catch {
    return null;
  }
}

function readCookieHeader(request?: Request): string | null {
  const cookieHeader = request?.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === HOST_SESSION_COOKIE_NAME) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return null;
}

export async function resolveVerifiedHostSession(request?: Request): Promise<HostSessionPayload | null> {
  const fromRequest = readCookieHeader(request);
  if (fromRequest) return verifyHostSessionToken(fromRequest);
  const cookieStore = await cookies();
  return verifyHostSessionToken(cookieStore.get(HOST_SESSION_COOKIE_NAME)?.value);
}

export function getHostSessionMaxAge(): number {
  return SESSION_MAX_AGE_SECONDS;
}
