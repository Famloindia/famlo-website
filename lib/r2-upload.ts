import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

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

async function uploadBufferToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET_NAME"),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

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
  const publicBase = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");

  if (isOptimizableImage(file)) {
    const safeBaseName = stripFileExtension(sanitizeFileName(file.name));
    const baseKey = `${folder}/${Date.now()}-${safeBaseName}`;
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
      uploadBufferToR2(fullBuffer, fullKey, "image/webp"),
      uploadBufferToR2(previewBuffer, previewKey, "image/webp"),
    ]);

    return `${publicBase}/${fullKey}`;
  }

  const uniqueName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const key = `${folder}/${uniqueName}`;
  await uploadBufferToR2(buffer, key, file.type || "application/octet-stream");
  return `${publicBase}/${key}`;
}
