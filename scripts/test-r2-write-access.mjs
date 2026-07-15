import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function trimmed(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getAppEnv(env) {
  const explicit = String(env.APP_ENV ?? "").trim().toLowerCase();
  if (explicit === "production") return "production";
  if (explicit === "staging" || explicit === "preview") return "staging";
  if (explicit === "local" || explicit === "development" || explicit === "dev") return "local";

  const publicExplicit = String(env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  if (publicExplicit === "production") return "production";
  if (publicExplicit === "staging" || publicExplicit === "preview") return "staging";
  if (publicExplicit === "local" || publicExplicit === "development" || publicExplicit === "dev") return "local";

  const vercelEnv = String(env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "staging";

  return "local";
}

function expectedBucketForEnv(appEnv) {
  return appEnv === "production" ? "famlo-images" : "famlo-images-staging";
}

function diagnostics(env, key) {
  const appEnv = getAppEnv(env);
  return {
    appEnv,
    nextPublicAppEnv: String(env.NEXT_PUBLIC_APP_ENV ?? "").trim() || "(unset)",
    bucketName: trimmed(env.R2_BUCKET_NAME),
    expectedBucketName: expectedBucketForEnv(appEnv),
    hasAccountId: Boolean(trimmed(env.R2_ACCOUNT_ID)),
    hasAccessKeyId: Boolean(trimmed(env.R2_ACCESS_KEY_ID)),
    hasSecretAccessKey: Boolean(trimmed(env.R2_SECRET_ACCESS_KEY)),
    hasPublicUrl: Boolean(trimmed(env.R2_PUBLIC_URL)),
    keyPrefix: key.split("/").slice(0, -1).join("/") || key,
  };
}

function extractError(input) {
  return {
    name: typeof input?.name === "string" ? input.name : "Error",
    code:
      typeof input?.code === "string"
        ? input.code
        : typeof input?.Code === "string"
          ? input.Code
          : null,
    status:
      typeof input?.$metadata?.httpStatusCode === "number"
        ? input.$metadata.httpStatusCode
        : typeof input?.statusCode === "number"
          ? input.statusCode
          : typeof input?.status === "number"
            ? input.status
            : null,
    message: typeof input?.message === "string" ? input.message : "Unknown error",
  };
}

const bucketName = trimmed(process.env.R2_BUCKET_NAME);
const accountId = trimmed(process.env.R2_ACCOUNT_ID);
const accessKeyId = trimmed(process.env.R2_ACCESS_KEY_ID);
const secretAccessKey = trimmed(process.env.R2_SECRET_ACCESS_KEY);
const key = `diagnostics/${getAppEnv(process.env)}/upload-smoke/${Date.now()}.txt`;
const info = diagnostics(process.env, key);

console.info("[r2-write-test] starting", info);

if (info.bucketName !== info.expectedBucketName) {
  console.error("[r2-write-test] env safety mismatch", info);
  process.exit(2);
}

if (!bucketName || !accountId || !accessKeyId || !secretAccessKey) {
  console.error("[r2-write-test] missing required R2 env vars", info);
  process.exit(2);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

try {
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: Buffer.from(`famlo-r2-smoke-test ${new Date().toISOString()}\n`, "utf8"),
      ContentType: "text/plain; charset=utf-8",
      CacheControl: "no-store",
    })
  );

  console.info("[r2-write-test] put succeeded", info);

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );

  console.info("[r2-write-test] cleanup succeeded", info);
} catch (error) {
  console.error("[r2-write-test] failed", {
    ...info,
    ...extractError(error),
  });
  process.exit(1);
}
