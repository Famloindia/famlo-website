import sharp from "sharp";
import { MAX_DOCUMENT_UPLOAD_BYTES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

export type SupportedIdDocumentType = "aadhaar" | "driving_licence" | "passport" | "voter_id";
export type DocumentUploadMethod = "camera" | "device";
export type DocumentDecision = "pass" | "retry" | "reject";

export interface DocumentVerificationResult {
  decision: DocumentDecision;
  confidenceScore: number;
  reviewStatus: "pending_manual_review" | "retry_required" | "rejected";
  selectedDocumentType: SupportedIdDocumentType;
  uploadMethod: DocumentUploadMethod;
  reasons: string[];
  fraudFlags: string[];
  extractedHints: {
    width?: number;
    height?: number;
    mimeType: string;
    fileName: string;
    isPdf: boolean;
  };
  userMessage: string;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDocumentType(value: string): SupportedIdDocumentType | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "aadhaar" || normalized === "aadhaar card") return "aadhaar";
  if (normalized === "driving licence" || normalized === "driving license" || normalized === "dl") return "driving_licence";
  if (normalized === "passport") return "passport";
  if (normalized === "voter id" || normalized === "voter_id" || normalized === "voter") return "voter_id";
  return null;
}

function isAllowedFileType(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase()) || ALLOWED_IMAGE_EXTENSIONS.test(lowerName) || file.type === "application/pdf" || lowerName.endsWith(".pdf");
}

async function analyzeImage(buffer: Buffer) {
  const pipeline = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await pipeline.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const resized = await pipeline
    .resize(320, 320, { fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = resized.data;
  const channelCount = resized.info.channels || 1;
  const values: number[] = [];
  for (let index = 0; index < pixels.length; index += channelCount) {
    values.push(pixels[index] ?? 0);
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1);
  const stdDev = Math.sqrt(variance);

  let edgeStrength = 0;
  let edgeCount = 0;
  const sampleWidth = resized.info.width;
  const sampleHeight = resized.info.height;
  for (let y = 1; y < sampleHeight - 1; y++) {
    for (let x = 1; x < sampleWidth - 1; x++) {
      const centerIndex = y * sampleWidth + x;
      const left = values[centerIndex - 1] ?? 0;
      const right = values[centerIndex + 1] ?? 0;
      const top = values[centerIndex - sampleWidth] ?? 0;
      const bottom = values[centerIndex + sampleWidth] ?? 0;
      const gradient = Math.abs(right - left) + Math.abs(bottom - top);
      edgeStrength += gradient;
      edgeCount += 1;
    }
  }

  const avgEdgeStrength = edgeStrength / Math.max(edgeCount, 1);
  const aspectRatio = width / Math.max(height, 1);

  return {
    width,
    height,
    meanBrightness: mean,
    stdDev,
    avgEdgeStrength,
    aspectRatio,
  };
}

export async function verifyGovernmentIdDocument(params: {
  file: File;
  selectedDocumentType: string;
  uploadMethod: string;
}): Promise<DocumentVerificationResult> {
  const { file } = params;
  const selectedDocumentType = normalizeDocumentType(params.selectedDocumentType);
  const uploadMethod = params.uploadMethod === "camera" ? "camera" : "device";
  const reasons: string[] = [];
  const fraudFlags: string[] = [];

  if (!selectedDocumentType) {
    return {
      decision: "retry",
      confidenceScore: 0,
      reviewStatus: "retry_required",
      selectedDocumentType: "aadhaar",
      uploadMethod,
      reasons: ["Choose a document type first."],
      fraudFlags: ["missing_document_type"],
      extractedHints: {
        mimeType: file.type,
        fileName: file.name,
        isPdf: false,
      },
      userMessage: "Please choose your document type before uploading.",
    };
  }

  if (!isAllowedFileType(file)) {
    return {
      decision: "reject",
      confidenceScore: 0.05,
      reviewStatus: "rejected",
      selectedDocumentType,
      uploadMethod,
      reasons: ["Unsupported file type."],
      fraudFlags: ["unsupported_file_type"],
      extractedHints: {
        mimeType: file.type,
        fileName: file.name,
        isPdf: false,
      },
      userMessage: "Please upload a JPG, JPEG, PNG, WEBP, HEIC, or PDF document.",
    };
  }

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const maxSize = isPdf ? MAX_DOCUMENT_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;

  if (file.size <= 0) {
    reasons.push("No file data was found.");
    fraudFlags.push("empty_file");
  }

  if (file.size < 50 * 1024) {
    reasons.push("The upload looks too small to read clearly.");
    fraudFlags.push("suspiciously_small_file");
  }

  if (file.size > maxSize) {
    reasons.push(isPdf ? "PDF must be 10MB or smaller." : "Image must be 15MB or smaller.");
    fraudFlags.push("file_too_large");
  }

  let confidence = 0.5;

  if (reasons.length > 0 && fraudFlags.includes("file_too_large")) {
    return {
      decision: "reject",
      confidenceScore: 0.08,
      reviewStatus: "rejected",
      selectedDocumentType,
      uploadMethod,
      reasons,
      fraudFlags,
      extractedHints: {
        mimeType: file.type,
        fileName: file.name,
        isPdf,
      },
      userMessage: reasons[0] ?? "Please try again with a supported file.",
    };
  }

  if (isPdf) {
    return {
      decision: reasons.some((reason) => /small/i.test(reason)) ? "retry" : "pass",
      confidenceScore: clamp(confidence, 0, 1),
      reviewStatus: reasons.some((reason) => /small/i.test(reason)) ? "retry_required" : "pending_manual_review",
      selectedDocumentType,
      uploadMethod,
      reasons,
      fraudFlags,
      extractedHints: {
        mimeType: file.type,
        fileName: file.name,
        isPdf: true,
      },
      userMessage:
        reasons.some((reason) => /small/i.test(reason))
          ? "We could not verify this document clearly. Please try again with a clearer file."
          : "Document uploaded successfully. Famlo will review it manually.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const image = await analyzeImage(buffer);

  if (image.width < 900 || image.height < 600) {
    reasons.push("The image is too low-resolution.");
    fraudFlags.push("low_resolution");
    confidence -= 0.2;
  }

  if (image.meanBrightness < 55) {
    reasons.push("The image is too dark.");
    fraudFlags.push("too_dark");
    confidence -= 0.16;
  } else if (image.meanBrightness > 235) {
    reasons.push("The image is too bright.");
    fraudFlags.push("too_bright");
    confidence -= 0.16;
  }

  if (image.stdDev < 22) {
    reasons.push("The image looks blurry or unreadable.");
    fraudFlags.push("low_contrast");
    confidence -= 0.18;
  }

  if (image.avgEdgeStrength < 18) {
    reasons.push("The document text area is not clear enough.");
    fraudFlags.push("weak_text_edges");
    confidence -= 0.18;
  }

  if (selectedDocumentType !== "passport" && (image.aspectRatio < 1.1 || image.aspectRatio > 1.95)) {
    reasons.push("The document framing looks incomplete.");
    fraudFlags.push("document_edges_unclear");
    confidence -= 0.14;
  }

  if (selectedDocumentType === "passport" && (image.aspectRatio < 0.6 || image.aspectRatio > 1.8)) {
    reasons.push("The passport image framing looks incomplete.");
    fraudFlags.push("document_edges_unclear");
    confidence -= 0.14;
  }

  let decision: DocumentDecision = "pass";
  let reviewStatus: DocumentVerificationResult["reviewStatus"] = "pending_manual_review";
  let userMessage = "Document uploaded successfully. Famlo will review it manually.";

  if (confidence < 0.26) {
    decision = "reject";
    reviewStatus = "rejected";
    userMessage = `This does not appear to be a valid ${selectedDocumentType.replaceAll("_", " ")}. Please upload a real and clear government ID.`;
  } else if (confidence < 0.38) {
    decision = "retry";
    reviewStatus = "retry_required";
    userMessage = "We could not verify this document clearly. Please try again with a clearer image.";
  }

  return {
    decision,
    confidenceScore: clamp(Number(confidence.toFixed(2)), 0, 1),
    reviewStatus,
    selectedDocumentType,
    uploadMethod,
    reasons,
    fraudFlags,
    extractedHints: {
      width: image.width,
      height: image.height,
      mimeType: file.type,
      fileName: file.name,
      isPdf: false,
    },
    userMessage,
  };
}
