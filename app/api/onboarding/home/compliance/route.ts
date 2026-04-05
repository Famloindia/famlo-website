import { NextResponse } from "next/server";

import { mergeDraftPayload } from "@/lib/host-onboarding";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    draftId?: string;
    compliancePatch?: Record<string, unknown>;
    listingStatus?: string;
  };

  const draftId = String(body.draftId ?? "").trim();

  if (!draftId) {
    return NextResponse.json({ error: "Draft ID is required." }, { status: 400 });
  }

  try {
    await mergeDraftPayload({
      draftId,
      compliancePatch: body.compliancePatch ?? {},
      listingStatus: body.listingStatus
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save compliance." },
      { status: 500 }
    );
  }
}
