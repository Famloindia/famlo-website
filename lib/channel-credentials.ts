import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";

type JsonRecord = Record<string, unknown>;

export type StoredChannelCredential = {
  algorithm: "aes-256-gcm";
  ciphertext: string;
  iv: string;
  tag: string;
  storedAt: string;
  storedBy: string | null;
  fingerprint: string;
  lastFour: string;
};

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readEncryptionKey(): Buffer {
  const raw = process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("Missing CHANNEL_CREDENTIALS_ENCRYPTION_KEY for secure channel credential storage.");
  }

  const normalized = raw.startsWith("base64:") ? raw.slice("base64:".length) : raw;
  const decoded = Buffer.from(normalized, raw.startsWith("hex:") ? "hex" : "base64");
  if (decoded.length === 32) return decoded;

  if (!raw.startsWith("base64:") && !raw.startsWith("hex:")) {
    const utf8 = Buffer.from(raw, "utf8");
    if (utf8.length >= 32) return createHash("sha256").update(utf8).digest();
  }

  throw new Error("CHANNEL_CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes for AES-256-GCM.");
}

export function channelCredentialStorageConfigured(): boolean {
  try {
    readEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptChannelCredential(input: {
  value: string;
  storedBy: string | null;
  storedAt?: string;
}): StoredChannelCredential {
  const normalized = input.value.trim();
  if (!normalized) {
    throw new Error("Credential value is required.");
  }

  const key = readEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    storedAt: input.storedAt ?? new Date().toISOString(),
    storedBy: input.storedBy,
    fingerprint: createHash("sha256").update(normalized).digest("hex"),
    lastFour: normalized.slice(-4),
  };
}

export function decryptChannelCredential(credential: StoredChannelCredential): string {
  const key = readEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(credential.iv, "base64"));
  decipher.setAuthTag(Buffer.from(credential.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(credential.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function readStoredChannelCredential(
  metadata: unknown,
  providerKey: ChannelProviderKey,
  credentialKey = "access_token"
): StoredChannelCredential | null {
  const root = asObject(metadata);
  const credentials = asObject(root.provider_credentials);
  const providerCredentials = asObject(credentials[providerKey]);
  const credential = asObject(providerCredentials[credentialKey]);
  if (
    credential.algorithm !== "aes-256-gcm" ||
    !asString(credential.ciphertext) ||
    !asString(credential.iv) ||
    !asString(credential.tag)
  ) {
    return null;
  }

  return {
    algorithm: "aes-256-gcm",
    ciphertext: asString(credential.ciphertext) ?? "",
    iv: asString(credential.iv) ?? "",
    tag: asString(credential.tag) ?? "",
    storedAt: asString(credential.storedAt) ?? new Date(0).toISOString(),
    storedBy: asString(credential.storedBy),
    fingerprint: asString(credential.fingerprint) ?? "",
    lastFour: asString(credential.lastFour) ?? "",
  };
}

export function mergeEncryptedChannelCredential(input: {
  metadata: unknown;
  providerKey: ChannelProviderKey;
  credentialKey?: string;
  credential: StoredChannelCredential;
}): JsonRecord {
  const root = asObject(input.metadata);
  const credentials = asObject(root.provider_credentials);
  const providerCredentials = asObject(credentials[input.providerKey]);
  const credentialKey = input.credentialKey ?? "access_token";

  return {
    ...root,
    provider_credentials: {
      ...credentials,
      [input.providerKey]: {
        ...providerCredentials,
        [credentialKey]: input.credential,
      },
    },
  };
}

export function redactChannelCredentialMetadata(metadata: unknown): JsonRecord {
  const root = asObject(metadata);
  const credentials = asObject(root.provider_credentials);
  const summaries = Object.fromEntries(
    Object.entries(credentials).map(([providerKey, providerValue]) => {
      const providerCredentials = asObject(providerValue);
      const accessToken = asObject(providerCredentials.access_token);
      return [
        providerKey,
        {
          access_token_stored: Boolean(asString(accessToken.ciphertext)),
          access_token_last_four: asString(accessToken.lastFour),
          access_token_stored_at: asString(accessToken.storedAt),
        },
      ];
    })
  );

  const { provider_credentials: _providerCredentials, ...safeMetadata } = root;
  return {
    ...safeMetadata,
    provider_credential_summary: summaries,
  };
}
