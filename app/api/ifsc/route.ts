import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "IFSC code is required." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://ifsc.razorpay.com/${code}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Bank not found." }, { status: 404 });
    }

    const data = (await response.json()) as { BANK?: string; BRANCH?: string };
    return NextResponse.json({
      bank: data.BANK ?? null,
      branch: data.BRANCH ?? null
    });
  } catch {
    return NextResponse.json(
      { error: "IFSC lookup is unavailable right now." },
      { status: 500 }
    );
  }
}
