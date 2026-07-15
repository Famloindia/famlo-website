import { computeFinanceContractV1 } from "@/lib/finance/engine";
import { clampMoney, toBpsFromPct } from "@/lib/finance/money";
import { computeRefundAllocationBreakdown } from "@/lib/finance/refunds";

type ScenarioOutput = {
  booking_amount: number;
  discount_amount: number;
  platform_fee: number;
  gst_amount: number;
  pg_fee: number;
  tds_amount: number;
  tcs_amount: number;
  guest_total: number;
  host_payout: number;
  famlo_net_revenue: number;
};

function runContract(input: {
  bookingAmount: number;
  discountAmount: number;
  commissionPct: number;
  gstPct: number;
  payoutGatewayFeeBurden: "platform" | "host";
  pgFeeEnabled: boolean;
  pgFeeRatePct: number;
  pgFeeFixedAmount: number;
  tdsEnabled: boolean;
  tdsPct: number;
  tcsEnabled: boolean;
  tcsPct: number;
}) {
  return computeFinanceContractV1({
    bookingAmount: input.bookingAmount,
    discountAmount: input.discountAmount,
    commissionRateBps: toBpsFromPct(input.commissionPct),
    gstRateBps: toBpsFromPct(input.gstPct),
    stayTaxAmount: 0,
    payoutGatewayFeeBurden: input.payoutGatewayFeeBurden,
    paymentGatewayFee: {
      pgFeeEnabled: input.pgFeeEnabled,
      pgFeeRateBps: toBpsFromPct(input.pgFeeRatePct),
      pgFeeFixedAmount: input.pgFeeFixedAmount,
      pgFeeBorneBy: input.payoutGatewayFeeBurden,
    },
    withholding: {
      tdsEnabled: input.tdsEnabled,
      tdsRateBps: toBpsFromPct(input.tdsPct),
      tcsEnabled: input.tcsEnabled,
      tcsRateBps: toBpsFromPct(input.tcsPct),
    },
    ruleSource: {
      ruleSetId: "regression",
      commissionRuleId: "regression",
      taxRuleIds: ["regression"],
      payoutRuleId: "regression",
      overrideIds: [],
      warnings: [],
    },
  });
}

function toOutput(contract: ReturnType<typeof runContract>): ScenarioOutput {
  return {
    booking_amount: contract.booking_amount,
    discount_amount: contract.discount_amount,
    platform_fee: contract.platform_fee,
    gst_amount: contract.gst_on_platform_fee,
    pg_fee: contract.pg_fee_amount,
    tds_amount: contract.tds_amount,
    tcs_amount: contract.tcs_amount,
    guest_total: contract.guest_total,
    host_payout: contract.host_payout,
    famlo_net_revenue: contract.famlo_net_revenue,
  };
}

function applyRefundScenario(input: {
  contract: ReturnType<typeof runContract>;
  refundAmount: number;
}): ScenarioOutput {
  const contract = input.contract;
  const refundAmount = clampMoney(input.refundAmount);
  const guestTotal = contract.guest_total;

  const breakdown = computeRefundAllocationBreakdown({
    refundAmount,
    guestTotal,
    amountAfterDiscount: contract.amount_after_discount,
    platformFee: contract.platform_fee,
    platformFeeTax: contract.gst_on_platform_fee,
    stayTaxAmount: contract.stay_tax_amount,
  });

  // Interpret output amounts as "net amounts remaining after refund".
  const remainingGuestTotal = clampMoney(guestTotal - refundAmount);
  const remainingPlatformFee = clampMoney(contract.platform_fee - breakdown.platform_fee_reversal);
  const remainingGst = clampMoney(contract.gst_on_platform_fee - breakdown.platform_tax_reversal);
  const remainingHostPayout = clampMoney(contract.host_payout - breakdown.guest_principal);
  const remainingNetRevenue = clampMoney(contract.famlo_net_revenue - breakdown.platform_fee_reversal);

  return {
    booking_amount: contract.booking_amount,
    discount_amount: contract.discount_amount,
    platform_fee: remainingPlatformFee,
    gst_amount: remainingGst,
    pg_fee: contract.pg_fee_amount,
    tds_amount: contract.tds_amount,
    tcs_amount: contract.tcs_amount,
    guest_total: remainingGuestTotal,
    host_payout: remainingHostPayout,
    famlo_net_revenue: remainingNetRevenue,
  };
}

function printScenario(name: string, output: ScenarioOutput, note?: string) {
  console.log(`\n=== ${name} ===`);
  console.log(JSON.stringify(output, null, 2));
  if (note) console.log(`NOTE: ${note}`);
}

function main() {
  const base = {
    bookingAmount: 1000,
    discountAmount: 0,
    commissionPct: 18,
    gstPct: 18,
    payoutGatewayFeeBurden: "platform" as const,
    pgFeeEnabled: false,
    pgFeeRatePct: 0,
    pgFeeFixedAmount: 0,
    tdsEnabled: false,
    tdsPct: 0,
    tcsEnabled: false,
    tcsPct: 0,
  };

  const contractNoCoupon = runContract(base);
  printScenario("1) ₹1000 booking, 18% commission, 18% GST, no coupon", toOutput(contractNoCoupon));

  const contractWithCoupon = runContract({ ...base, discountAmount: 200 });
  printScenario("2) ₹1000 booking with coupon", toOutput(contractWithCoupon), "Assumption: discount_amount = ₹200 flat.");

  const partialRefund = applyRefundScenario({ contract: contractNoCoupon, refundAmount: 500 });
  printScenario("3) partial refund", partialRefund, "Assumption: refund_amount = ₹500 applied against guest_total; output shows remaining amounts.");

  const fullRefundBeforePayout = applyRefundScenario({
    contract: contractNoCoupon,
    refundAmount: contractNoCoupon.guest_total,
  });
  printScenario("4) full refund before payout", fullRefundBeforePayout, "refund_amount = full guest_total; output shows remaining amounts.");

  const fullRefundAfterPayout = fullRefundBeforePayout;
  printScenario(
    "5) full refund after payout",
    fullRefundAfterPayout,
    `refund_amount = full guest_total; if payout already executed, clawback required = ₹${contractNoCoupon.host_payout}.`
  );

  const contractPgPlatform = runContract({
    ...base,
    pgFeeEnabled: true,
    pgFeeRatePct: 2,
    pgFeeFixedAmount: 0,
    payoutGatewayFeeBurden: "platform",
  });
  printScenario("6) PG fee platform-borne", toOutput(contractPgPlatform), "Assumption: pg_fee_rate = 2% of guest_total, fixed = 0.");

  const contractPgHost = runContract({
    ...base,
    pgFeeEnabled: true,
    pgFeeRatePct: 2,
    pgFeeFixedAmount: 0,
    payoutGatewayFeeBurden: "host",
  });
  printScenario("7) PG fee host-borne", toOutput(contractPgHost), "Assumption: pg_fee_rate = 2% of guest_total, fixed = 0.");

  printScenario("8) TDS/TCS disabled", toOutput(contractNoCoupon));

  const contractWithWithholding = runContract({
    ...base,
    tdsEnabled: true,
    tdsPct: 1,
    tcsEnabled: true,
    tcsPct: 0.5,
  });
  printScenario(
    "9) TDS/TCS enabled",
    toOutput(contractWithWithholding),
    "Assumption: TDS=1% and TCS=0.5% on pre-withholding payout base."
  );
}

main();
