import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

function getR2Client(): S3Client {
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

export async function uploadFileToR2(file: File, folder: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const uniqueName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const key = `${folder}/${uniqueName}`;

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    })
  );

  const publicBase = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");
  return `${publicBase}/${key}`;
}
