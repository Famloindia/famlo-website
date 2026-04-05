import { NextResponse } from "next/server";

import { mergeDraftPayload } from "@/lib/host-onboarding";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    draftId?: string;
    step?: number;
    payloadPatch?: Record<string, unknown>;
  };

  const draftId = String(body.draftId ?? "").trim();

  if (!draftId) {
    return NextResponse.json({ error: "Draft ID is required." }, { status: 400 });
  }

  try {
    await mergeDraftPayload({
      draftId,
      payloadPatch: body.payloadPatch ?? {},
      currentStep: body.step ?? 1,
      listingStatus: "draft"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save draft." },
      { status: 500 }
    );
  }
}
