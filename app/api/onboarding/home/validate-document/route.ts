import { NextResponse } from "next/server";

import { verifyGovernmentIdDocument } from "@/lib/document-verification";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const selectedDocumentType = String(formData.get("selectedDocumentType") ?? "");
    const uploadMethod = String(formData.get("uploadMethod") ?? "device");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No document file provided." }, { status: 400 });
    }

    const result = await verifyGovernmentIdDocument({
      file,
      selectedDocumentType,
      uploadMethod,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Document validation failed." },
      { status: 500 }
    );
  }
}
