import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

export type FinanceDocumentArtifactType = "guest_tax_invoice" | "platform_fee_invoice" | "credit_note";

type FinanceDocumentFileRow = {
  id: string;
  artifact_type: FinanceDocumentArtifactType;
  artifact_id: string;
  storage_path: string;
  checksum: string;
  mime_type: string;
  file_size_bytes: number;
  generated_at: string;
  generated_by: string | null;
};

function getDocumentStorageRoot(): string {
  return process.env.FINANCE_DOCUMENT_STORAGE_DIR?.trim() || join(process.cwd(), ".generated", "finance-documents");
}

function toSafeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildFinanceDocumentStoragePath(
  artifactType: FinanceDocumentArtifactType,
  artifactId: string,
  fileName: string
): string {
  return join(getDocumentStorageRoot(), toSafeSegment(artifactType), toSafeSegment(artifactId), fileName);
}

export async function loadStoredFinancePdf(
  supabase: SupabaseClient,
  artifactType: FinanceDocumentArtifactType,
  artifactId: string
): Promise<{ metadata: FinanceDocumentFileRow; bytes: Buffer } | null> {
  const { data, error } = await supabase
    .from("finance_document_files")
    .select("id,artifact_type,artifact_id,storage_path,checksum,mime_type,file_size_bytes,generated_at,generated_by")
    .eq("artifact_type", artifactType)
    .eq("artifact_id", artifactId)
    .maybeSingle();

  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    const message = String((error as { message?: string }).message ?? "").toLowerCase();
    if (code === "42P01" || message.includes("does not exist") || message.includes("schema cache")) {
      return null;
    }
    throw error;
  }
  if (!data) return null;
  const bytes = await readFile(data.storage_path);
  return {
    metadata: data as FinanceDocumentFileRow,
    bytes,
  };
}

export async function persistFinancePdfFile(
  supabase: SupabaseClient,
  input: {
    artifactType: FinanceDocumentArtifactType;
    artifactId: string;
    fileName: string;
    bytes: Buffer;
    generatedBy?: string | null;
  }
): Promise<FinanceDocumentFileRow> {
  const storagePath = buildFinanceDocumentStoragePath(input.artifactType, input.artifactId, input.fileName);
  await mkdir(dirname(storagePath), { recursive: true });
  await writeFile(storagePath, input.bytes);

  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("finance_document_files")
    .select("id")
    .eq("artifact_type", input.artifactType)
    .eq("artifact_id", input.artifactId)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("finance_document_files")
      .update({
        storage_path: storagePath,
        checksum,
        mime_type: "application/pdf",
        file_size_bytes: input.bytes.length,
        generated_at: now,
        generated_by: input.generatedBy ?? null,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("id,artifact_type,artifact_id,storage_path,checksum,mime_type,file_size_bytes,generated_at,generated_by")
      .single();
    if (error) throw error;
    return data as FinanceDocumentFileRow;
  }

  const { data, error } = await supabase
    .from("finance_document_files")
    .insert({
      artifact_type: input.artifactType,
      artifact_id: input.artifactId,
      storage_path: storagePath,
      checksum,
      mime_type: "application/pdf",
      file_size_bytes: input.bytes.length,
      generated_at: now,
      generated_by: input.generatedBy ?? null,
      updated_at: now,
    })
    .select("id,artifact_type,artifact_id,storage_path,checksum,mime_type,file_size_bytes,generated_at,generated_by")
    .single();
  if (error) throw error;
  return data as FinanceDocumentFileRow;
}
