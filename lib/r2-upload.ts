import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import {
  AppEnvSafetyError,
  asTrimmedString,
  assertRuntimeSafety,
  getAppEnv,
  getExpectedR2BucketForAppEnv,
} from "@/lib/app-env";

export type UploadErrorCode =
  | "ENV_SAFETY_BLOCKED"
  | "R2_ACCESS_DENIED"
  | "R2_BUCKET_NOT_FOUND"
  | "R2_BAD_CREDENTIALS"
  | "FILE_TOO_LARGE_OR_UNSUPPORTED"
  | "UNKNOWN_UPLOAD_ERROR";

type UploadRuntimeDiagnostics = {
  appEnv: string;
  publicAppEnv: string;
  bucketName: string | null;
  expectedBucketName: string;
  hasAccountId: boolean;
  hasAccessKeyId: boolean;
  hasSecretAccessKey: boolean;
  hasPublicUrl: boolean;
  uploadFolder: string;
  keyPrefix: string;
  fileMimeType: string;
  fileSize: number;
};

type UploadErrorDetails = {
  name: string;
  code: string | null;
  status: number | null;
  message: string;
};

export class UploadPathError extends Error {
  code: UploadErrorCode;
  status: number;
  details: UploadErrorDetails;

  constructor(input: {
    code: UploadErrorCode;
    message: string;
    status?: number;
    details: UploadErrorDetails;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "UploadPathError";
    this.code = input.code;
    this.status = input.status ?? 500;
    this.details = input.details;
    if (input.cause !== undefined) {
      this.cause = input.cause;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sanitizeFileName(name: string): string {
  const parts = name.split(".");
  const extension = parts.length > 1 ? parts.pop() : "";
  const base = parts.join(".") || "upload";

  const normalized = base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  const safeBase = normalized || "upload";
  return extension ? `${safeBase}.${extension.toLowerCase()}` : safeBase;
}

let cachedClient: S3Client | null = null;

function isOptimizableImage(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") &&
    !file.type.includes("gif") &&
    /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(lowerName)
  );
}

function stripFileExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function buildUploadDiagnostics(input: {
  folder: string;
  keyPrefix: string;
  file: Pick<File, "type" | "size">;
  env?: NodeJS.ProcessEnv;
}): UploadRuntimeDiagnostics {
  const env = input.env ?? process.env;
  const appEnv = getAppEnv(env);

  return {
    appEnv,
    publicAppEnv: String(env.NEXT_PUBLIC_APP_ENV ?? "").trim() || "(unset)",
    bucketName: asTrimmedString(env.R2_BUCKET_NAME),
    expectedBucketName: getExpectedR2BucketForAppEnv(appEnv),
    hasAccountId: Boolean(asTrimmedString(env.R2_ACCOUNT_ID)),
    hasAccessKeyId: Boolean(asTrimmedString(env.R2_ACCESS_KEY_ID)),
    hasSecretAccessKey: Boolean(asTrimmedString(env.R2_SECRET_ACCESS_KEY)),
    hasPublicUrl: Boolean(asTrimmedString(env.R2_PUBLIC_URL)),
    uploadFolder: input.folder,
    keyPrefix: input.keyPrefix,
    fileMimeType: input.file.type || "application/octet-stream",
    fileSize: input.file.size,
  };
}

function logUploadDiagnostics(
  phase: "start" | "success" | "failure",
  diagnostics: UploadRuntimeDiagnostics,
  error?: UploadErrorDetails
): void {
  console.info("[upload][r2]", {
    phase,
    appEnv: diagnostics.appEnv,
    nextPublicAppEnv: diagnostics.publicAppEnv,
    bucketName: diagnostics.bucketName,
    expectedBucketName: diagnostics.expectedBucketName,
    hasAccountId: diagnostics.hasAccountId,
    hasAccessKeyId: diagnostics.hasAccessKeyId,
    hasSecretAccessKey: diagnostics.hasSecretAccessKey,
    hasPublicUrl: diagnostics.hasPublicUrl,
    uploadFolder: diagnostics.uploadFolder,
    keyPrefix: diagnostics.keyPrefix,
    fileMimeType: diagnostics.fileMimeType,
    fileSize: diagnostics.fileSize,
    errorName: error?.name ?? null,
    errorCode: error?.code ?? null,
    errorStatus: error?.status ?? null,
    errorMessage: error?.message ?? null,
  });
}

function extractErrorDetails(error: unknown): UploadErrorDetails {
  const maybeError = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    $metadata?: { httpStatusCode?: unknown };
    statusCode?: unknown;
    status?: unknown;
    Code?: unknown;
  };

  const metadataStatus =
    typeof maybeError?.$metadata?.httpStatusCode === "number" ? maybeError.$metadata.httpStatusCode : null;
  const statusCode = typeof maybeError?.statusCode === "number" ? maybeError.statusCode : null;
  const status = typeof maybeError?.status === "number" ? maybeError.status : null;
  const code =
    typeof maybeError?.code === "string"
      ? maybeError.code
      : typeof maybeError?.Code === "string"
        ? maybeError.Code
        : null;

  return {
    name: typeof maybeError?.name === "string" ? maybeError.name : error instanceof Error ? error.name : "Error",
    code,
    status: metadataStatus ?? statusCode ?? status ?? null,
    message:
      typeof maybeError?.message === "string"
        ? maybeError.message
        : error instanceof Error
          ? error.message
          : "Upload failed.",
  };
}

function classifyUploadError(error: unknown): { code: UploadErrorCode; message: string; status: number } {
  if (error instanceof UploadPathError) {
    return { code: error.code, message: error.message, status: error.status };
  }

  if (error instanceof AppEnvSafetyError) {
    return {
      code: "ENV_SAFETY_BLOCKED",
      message: error.message,
      status: 500,
    };
  }

  const details = extractErrorDetails(error);
  const normalizedCode = details.code?.toLowerCase() ?? "";
  const normalizedName = details.name.toLowerCase();
  const normalizedMessage = details.message.toLowerCase();

  if (
    normalizedCode === "nosuchbucket" ||
    normalizedName === "nosuchbucket" ||
    details.status === 404
  ) {
    return {
      code: "R2_BUCKET_NOT_FOUND",
      message: "R2 bucket was not found for this environment.",
      status: 502,
    };
  }

  if (
    normalizedCode === "invalidaccesskeyid" ||
    normalizedCode === "signaturedoesnotmatch" ||
    normalizedCode === "credentialsprovidererror" ||
    normalizedName === "credentialsprovidererror" ||
    normalizedMessage.includes("resolved credential object is not valid") ||
    normalizedMessage.includes("could not load credentials")
  ) {
    return {
      code: "R2_BAD_CREDENTIALS",
      message: "R2 credentials are missing, invalid, or not accepted for this bucket.",
      status: 502,
    };
  }

  if (
    normalizedCode === "accessdenied" ||
    normalizedName === "accessdenied" ||
    details.status === 403
  ) {
    return {
      code: "R2_ACCESS_DENIED",
      message: "R2 denied write access for this bucket or key prefix.",
      status: 502,
    };
  }

  return {
    code: "UNKNOWN_UPLOAD_ERROR",
    message: "Upload failed because of an unexpected storage error.",
    status: 500,
  };
}

function getR2Client(): S3Client {
  assertRuntimeSafety("cloud_storage");
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return cachedClient;
}

async function uploadBufferToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
  diagnostics: UploadRuntimeDiagnostics
): Promise<void> {
  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: requireEnv("R2_BUCKET_NAME"),
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  } catch (error) {
    const details = extractErrorDetails(error);
    const classified = classifyUploadError(error);
    logUploadDiagnostics("failure", diagnostics, details);
    throw new UploadPathError({
      code: classified.code,
      message: classified.message,
      status: classified.status,
      details,
      cause: error,
    });
  }
}

export function getUploadConfigDiagnostics(
  input: Pick<UploadRuntimeDiagnostics, "uploadFolder" | "keyPrefix" | "fileMimeType" | "fileSize">,
  env: NodeJS.ProcessEnv = process.env
): UploadRuntimeDiagnostics {
  return buildUploadDiagnostics({
    folder: input.uploadFolder,
    keyPrefix: input.keyPrefix,
    file: { type: input.fileMimeType, size: input.fileSize },
    env,
  });
}

export function assertUploadConfig(
  input: Pick<UploadRuntimeDiagnostics, "uploadFolder" | "keyPrefix" | "fileMimeType" | "fileSize">,
  env: NodeJS.ProcessEnv = process.env
): UploadRuntimeDiagnostics {
  const diagnostics = getUploadConfigDiagnostics(input, env);
  try {
    assertRuntimeSafety("cloud_storage", env);
  } catch (error) {
    const details = extractErrorDetails(error);
    logUploadDiagnostics("failure", diagnostics, details);
    const classified = classifyUploadError(error);
    throw new UploadPathError({
      code: classified.code,
      message: classified.message,
      status: classified.status,
      details,
      cause: error,
    });
  }

  if (!diagnostics.hasAccountId || !diagnostics.hasAccessKeyId || !diagnostics.hasSecretAccessKey) {
    const details = {
      name: "R2ConfigurationError",
      code: "MISSING_R2_CREDENTIALS",
      status: null,
      message: "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must all be set.",
    } as const;
    logUploadDiagnostics("failure", diagnostics, details);
    throw new UploadPathError({
      code: "R2_BAD_CREDENTIALS",
      message: "R2 credentials are missing, invalid, or not accepted for this bucket.",
      status: 500,
      details,
    });
  }

  if (!diagnostics.bucketName) {
    const details = {
      name: "R2ConfigurationError",
      code: "MISSING_R2_BUCKET_NAME",
      status: null,
      message: "R2_BUCKET_NAME is not configured.",
    } as const;
    logUploadDiagnostics("failure", diagnostics, details);
    throw new UploadPathError({
      code: "ENV_SAFETY_BLOCKED",
      message: "R2 bucket configuration is missing for this environment.",
      status: 500,
      details,
    });
  }

  if (!diagnostics.hasPublicUrl) {
    const details = {
      name: "R2ConfigurationError",
      code: "MISSING_R2_PUBLIC_URL",
      status: null,
      message: "R2_PUBLIC_URL is not configured.",
    } as const;
    logUploadDiagnostics("failure", diagnostics, details);
    throw new UploadPathError({
      code: "UNKNOWN_UPLOAD_ERROR",
      message: "R2 public URL is missing for this environment.",
      status: 500,
      details,
    });
  }

  return diagnostics;
}

export async function uploadFileToR2(file: File, folder: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const sanitizedBaseName = stripFileExtension(sanitizeFileName(file.name));
  const baseKey = `${folder}/${Date.now()}-${sanitizedBaseName}`;
  const diagnostics = assertUploadConfig({
    uploadFolder: folder,
    keyPrefix: baseKey,
    fileMimeType: file.type || "application/octet-stream",
    fileSize: file.size,
  });
  const publicBase = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");

  logUploadDiagnostics("start", diagnostics);

  if (isOptimizableImage(file)) {
    const fullKey = `${baseKey}-full.webp`;
    const previewKey = `${baseKey}-preview.webp`;

    const pipeline = sharp(buffer, { failOn: "none" }).rotate();
    const metadata = await pipeline.metadata();
    const targetWidth =
      typeof metadata.width === "number" && metadata.width > 0
        ? Math.min(metadata.width, 1600)
        : 1600;

    const [fullBuffer, previewBuffer] = await Promise.all([
      pipeline
        .clone()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toBuffer(),
      pipeline
        .clone()
        .resize({ width: 96, withoutEnlargement: true })
        .webp({ quality: 36, effort: 3 })
        .toBuffer(),
    ]);

    await Promise.all([
      uploadBufferToR2(fullBuffer, fullKey, "image/webp", diagnostics),
      uploadBufferToR2(previewBuffer, previewKey, "image/webp", diagnostics),
    ]);

    logUploadDiagnostics("success", diagnostics);
    return `${publicBase}/${fullKey}`;
  }

  const uniqueName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const key = `${folder}/${uniqueName}`;
  await uploadBufferToR2(buffer, key, file.type || "application/octet-stream", diagnostics);
  logUploadDiagnostics("success", diagnostics);
  return `${publicBase}/${key}`;
}
