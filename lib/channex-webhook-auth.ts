import { createHmac, timingSafeEqual } from "node:crypto";

type ChannexWebhookAuthMode = "shared_secret" | "signature";

type ChannexWebhookAuthConfig =
  | { configured: false; error: "webhook_not_configured" }
  | { configured: true; mode: ChannexWebhookAuthMode; secret: string };

export type ChannexWebhookAuthResult =
  | { ok: true; mode: ChannexWebhookAuthMode }
  | { ok: false; status: 401 | 503; error: "Unauthorized" | "webhook not configured" };

function readEnvString(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readSignatureHeader(request: Request): string | null {
  return (
    request.headers.get("x-channex-signature") ??
    request.headers.get("x-famlo-webhook-signature") ??
    request.headers.get("x-webhook-signature")
  )?.trim() || null;
}

function readChannexWebhookAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  request?: Request
): ChannexWebhookAuthConfig {
  const secret = readEnvString(env.CHANNEX_WEBHOOK_SECRET);
  if (!secret) {
    return { configured: false, error: "webhook_not_configured" };
  }

  const configuredMode = readEnvString(env.CHANNEX_WEBHOOK_AUTH_MODE)?.toLowerCase();
  if (configuredMode === "signature") {
    return { configured: true, mode: "signature", secret };
  }
  if (configuredMode === "shared_secret" || configuredMode === "token") {
    return { configured: true, mode: "shared_secret", secret };
  }

  return {
    configured: true,
    mode: request && readSignatureHeader(request) ? "signature" : "shared_secret",
    secret,
  };
}

function verifySharedSecretRequest(request: Request, secret: string): boolean {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? null;
  const headerSecret =
    request.headers.get("x-famlo-webhook-secret")?.trim() ??
    request.headers.get("x-channex-webhook-secret")?.trim() ??
    request.headers.get("x-webhook-token")?.trim();
  const url = new URL(request.url);
  const querySecret =
    url.searchParams.get("secret")?.trim() ??
    url.searchParams.get("token")?.trim() ??
    url.searchParams.get("webhook_secret")?.trim();

  return [bearer, headerSecret, querySecret].some((candidate) => Boolean(candidate) && constantTimeEqual(candidate!, secret));
}

function verifySignatureRequest(request: Request, rawBody: string, secret: string): boolean {
  const provided = readSignatureHeader(request);
  if (!provided) return false;

  const digestHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const digestBase64 = Buffer.from(digestHex, "hex").toString("base64");
  return [`sha256=${digestHex}`, digestHex, digestBase64].some((candidate) => constantTimeEqual(provided, candidate));
}

export function verifyChannexWebhookRequest(input: {
  request: Request;
  rawBody: string;
  env?: NodeJS.ProcessEnv;
}): ChannexWebhookAuthResult {
  const config = readChannexWebhookAuthConfig(input.env, input.request);
  if (!config.configured) {
    return { ok: false, status: 503, error: "webhook not configured" };
  }

  const authorized =
    config.mode === "signature"
      ? verifySignatureRequest(input.request, input.rawBody, config.secret)
      : verifySharedSecretRequest(input.request, config.secret);

  if (!authorized) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true, mode: config.mode };
}
