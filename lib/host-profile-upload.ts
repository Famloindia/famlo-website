import { randomUUID } from "crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { validateHostProfileDirectUpload } from "@/lib/host-profile-upload-shared";
import { assertUploadConfig } from "@/lib/r2-upload";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sanitizeFileName(name: string): string {
  const parts = name.split(".");
  const extension = parts.length > 1 ? parts.pop() : "";
  const base = parts.join(".") || "upload";

  const safeBase = base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return extension ? `${safeBase || "upload"}.${extension.toLowerCase()}` : safeBase || "upload";
}

function getFileExtension(fileName: string, mimeType: string): string {
  const sanitized = sanitizeFileName(fileName);
  const extension = sanitized.includes(".") ? sanitized.split(".").pop() ?? "" : "";
  if (extension) return extension;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function getR2PresignClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function createHostProfileUploadTarget(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  expiresInSeconds: number;
}> {
  const validationError = validateHostProfileDirectUpload(input);
  if (validationError) {
    throw new Error(validationError);
  }

  assertUploadConfig({
    uploadFolder: "host-profiles",
    keyPrefix: "host-profiles/",
    fileMimeType: input.mimeType,
    fileSize: input.sizeBytes,
  });

  const extension = getFileExtension(input.fileName, input.mimeType);
  const publicBase = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");
  const storageKey = `host-profiles/${Date.now()}-${randomUUID()}.${extension}`;
  const client = getR2PresignClient();
  const uploadUrl = await getSignedUrl(
    client as any,
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: storageKey,
      ContentType: input.mimeType,
      ContentLength: input.sizeBytes,
      CacheControl: "public, max-age=31536000, immutable",
    }) as any,
    { expiresIn: 900 }
  );

  return {
    uploadUrl,
    storageKey,
    publicUrl: `${publicBase}/${storageKey}`,
    expiresInSeconds: 900,
  };
}
