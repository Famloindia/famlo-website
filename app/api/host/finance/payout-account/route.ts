import { NextRequest, NextResponse } from "next/server";

import { resolveFinanceHostAccess } from "@/lib/finance/host-finance-access";
import { onboardHostPayoutAccount } from "@/lib/finance/payout-account-engine";
import { createAdminSupabaseClient } from "@/lib/supabase";

type PayoutAccountBody = {
  legalName?: string | null;
  bankAccountNumber?: string | null;
  ifsc?: string | null;
  vpa?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveFinanceHostAccess(supabase, request);
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("host_payout_accounts")
      .select("*")
      .eq("host_id", hostAccess.hostId)
      .eq("provider", "RAZORPAYX")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      hostId: hostAccess.hostId,
      accounts: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payout account." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveFinanceHostAccess(supabase, request);
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as PayoutAccountBody;
    const result = await onboardHostPayoutAccount(supabase, {
      hostId: hostAccess.hostId,
      hostUserId: hostAccess.hostUserId,
      legalName: body.legalName ?? hostAccess.displayName,
      bankAccountNumber: body.bankAccountNumber,
      ifsc: body.ifsc,
      vpa: body.vpa,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
    });

    return NextResponse.json({
      success: true,
      hostId: hostAccess.hostId,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to onboard payout account." },
      { status: 500 }
    );
  }
}
