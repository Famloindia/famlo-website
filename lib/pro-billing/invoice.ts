import { renderEmailTemplate } from "@/lib/document-templates";

export type HostProInvoiceLineItem = {
  description: string;
  quantity: number;
  rate: number;
  taxableValue: number;
};

export type HostProInvoicePayload = {
  invoiceNumber: string;
  receiptNumber: string;
  financialYearLabel: string;
  sequenceNumber: number;
  invoiceDate: string;
  paymentDate: string;
  hostUserId: string;
  hostName: string;
  propertyName: string;
  hostEmail: string;
  hostPhone: string;
  hostGstin: string | null;
  placeOfSupply: string;
  placeOfSupplySource: "property_state" | "host_state" | "supplier_state_fallback";
  supplier: {
    legalName: string;
    gstin: string;
    registeredAddress: string;
    state: string;
  };
  subscription: {
    service: string;
    planLabel: string;
    durationMonths: number;
    periodStart: string;
    periodEnd: string;
    propertyCount: number;
    roomCount: number;
  };
  charges: {
    lineItems: HostProInvoiceLineItem[];
    taxableValue: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalGst: number;
    roundOff: number;
    totalPaid: number;
    taxMode: "intra_state" | "inter_state";
  };
  payment: {
    status: "PAID";
    method: "Razorpay";
    reference: string;
    currency: "INR";
  };
  amountInWords: string;
};

const STATE_BY_GST_PREFIX: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

const SMALL_NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS_WORDS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function padSequence(value: number): string {
  return String(value).padStart(6, "0");
}

function normalizeState(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase().replace(/\s+/g, " ") : null;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function numberBelowOneThousandToWords(value: number): string {
  if (value < 20) return SMALL_NUMBER_WORDS[value] ?? "";
  if (value < 100) {
    const tens = Math.trunc(value / 10);
    const remainder = value % 10;
    return `${TENS_WORDS[tens] ?? ""}${remainder ? ` ${numberBelowOneThousandToWords(remainder)}` : ""}`.trim();
  }
  const hundreds = Math.trunc(value / 100);
  const remainder = value % 100;
  return `${SMALL_NUMBER_WORDS[hundreds]} Hundred${remainder ? ` ${numberBelowOneThousandToWords(remainder)}` : ""}`.trim();
}

function integerToIndianWords(value: number): string {
  if (value === 0) return SMALL_NUMBER_WORDS[0];
  const parts: string[] = [];
  const crores = Math.trunc(value / 10000000);
  if (crores > 0) {
    parts.push(`${numberBelowOneThousandToWords(crores)} Crore`);
    value %= 10000000;
  }
  const lakhs = Math.trunc(value / 100000);
  if (lakhs > 0) {
    parts.push(`${numberBelowOneThousandToWords(lakhs)} Lakh`);
    value %= 100000;
  }
  const thousands = Math.trunc(value / 1000);
  if (thousands > 0) {
    parts.push(`${numberBelowOneThousandToWords(thousands)} Thousand`);
    value %= 1000;
  }
  if (value > 0) {
    parts.push(numberBelowOneThousandToWords(value));
  }
  return parts.join(" ").trim();
}

export function deriveFinancialYearLabel(value: string): string {
  const date = new Date(value);
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYear}`;
}

export function buildHostProInvoiceNumber(financialYearLabel: string, sequenceNumber: number): string {
  return `FAMLO/PRO/${financialYearLabel}/${padSequence(sequenceNumber)}`;
}

export function buildHostProReceiptNumber(invoiceNumber: string): string {
  return `${invoiceNumber}/RCPT`;
}

export function resolveStateFromGstin(gstin: string | null | undefined): string | null {
  if (typeof gstin !== "string" || gstin.trim().length < 2) return null;
  return STATE_BY_GST_PREFIX[gstin.trim().slice(0, 2)] ?? null;
}

export function derivePlaceOfSupply(input: {
  propertyState?: string | null;
  hostState?: string | null;
  supplierState: string;
}): { value: string; source: HostProInvoicePayload["placeOfSupplySource"] } {
  if (typeof input.propertyState === "string" && input.propertyState.trim().length > 0) {
    return { value: input.propertyState.trim(), source: "property_state" };
  }
  if (typeof input.hostState === "string" && input.hostState.trim().length > 0) {
    return { value: input.hostState.trim(), source: "host_state" };
  }
  return { value: input.supplierState.trim(), source: "supplier_state_fallback" };
}

export function amountToWordsInr(value: number): string {
  const rounded = Math.round(value);
  return `Rupees ${integerToIndianWords(rounded)} Only`;
}

export function isSameStateSupply(placeOfSupply: string, supplierState: string): boolean {
  const place = normalizeState(placeOfSupply);
  const supplier = normalizeState(supplierState);
  return Boolean(place && supplier && place === supplier);
}

export function renderHostProInvoiceSummaryHtml(input: {
  hostName: string;
  invoiceNumber: string;
  totalPaid: number;
  invoiceUrl: string;
  dashboardUrl: string;
}): string {
  return renderEmailTemplate({
    eyebrow: "Famlo Pro Billing",
    title: "Your Famlo Pro GST Tax Invoice",
    message: `Hi ${input.hostName}, your Famlo Pro payment has been received. Your GST Tax Invoice cum Payment Receipt is attached or available for download below.`,
    ctaLabel: "Download invoice",
    ctaUrl: input.invoiceUrl,
    footer: `Invoice ${input.invoiceNumber} · Amount paid ${formatMoney(input.totalPaid)} · If the direct link asks you to sign in, open your Famlo Pro Support & Billing workspace: ${input.dashboardUrl}`,
  });
}

export function buildHostProInvoicePayload(input: {
  invoiceNumber: string;
  receiptNumber: string;
  financialYearLabel: string;
  sequenceNumber: number;
  invoiceDate: string;
  paymentDate: string;
  hostUserId: string;
  hostName: string;
  propertyName: string;
  hostEmail: string;
  hostPhone: string;
  hostGstin: string | null;
  placeOfSupply: string;
  placeOfSupplySource: HostProInvoicePayload["placeOfSupplySource"];
  supplier: HostProInvoicePayload["supplier"];
  subscription: HostProInvoicePayload["subscription"];
  charges: HostProInvoicePayload["charges"];
  payment: HostProInvoicePayload["payment"];
}): HostProInvoicePayload {
  return {
    ...input,
    amountInWords: amountToWordsInr(input.charges.totalPaid),
  };
}

export function buildHostProInvoiceLineItems(input: {
  propertyCount: number;
  roomCount: number;
  durationMonths: number;
  taxableValue: number;
}): HostProInvoiceLineItem[] {
  const propertyChargeRate = 199 * Math.max(1, input.durationMonths);
  const roomChargeRate = 100 * Math.max(1, input.durationMonths);
  const propertyChargeValue = input.propertyCount * propertyChargeRate;
  const roomChargeValue = input.roomCount * roomChargeRate;
  const minimumAdjustment = Math.max(0, Number((input.taxableValue - propertyChargeValue - roomChargeValue).toFixed(2)));

  const items: HostProInvoiceLineItem[] = [
    {
      description: "Famlo Pro Property Charge",
      quantity: input.propertyCount,
      rate: propertyChargeRate,
      taxableValue: propertyChargeValue,
    },
    {
      description: "Famlo Pro Room Charge",
      quantity: input.roomCount,
      rate: roomChargeRate,
      taxableValue: roomChargeValue,
    },
  ];

  if (minimumAdjustment > 0) {
    items.push({
      description: "Minimum Subscription Adjustment",
      quantity: 1,
      rate: minimumAdjustment,
      taxableValue: minimumAdjustment,
    });
  }

  return items.filter((item) => item.quantity > 0 || item.taxableValue > 0);
}

export function formatHostProPeriodLabel(periodStart: string, periodEnd: string): string {
  return `${formatDateLabel(periodStart)} to ${formatDateLabel(periodEnd)}`;
}
