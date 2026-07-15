import { NextRequest, NextResponse } from "next/server";

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type ReportFormat = "csv" | "json";

export type CsvColumn<Row extends Record<string, unknown>> = {
  key: keyof Row;
  header: string;
};

const GST_STATE_CODE_TO_NAME = new Map<string, string>([
  ["01", "jammu and kashmir"],
  ["02", "himachal pradesh"],
  ["03", "punjab"],
  ["04", "chandigarh"],
  ["05", "uttarakhand"],
  ["06", "haryana"],
  ["07", "delhi"],
  ["08", "rajasthan"],
  ["09", "uttar pradesh"],
  ["10", "bihar"],
  ["11", "sikkim"],
  ["12", "arunachal pradesh"],
  ["13", "nagaland"],
  ["14", "manipur"],
  ["15", "mizoram"],
  ["16", "tripura"],
  ["17", "meghalaya"],
  ["18", "assam"],
  ["19", "west bengal"],
  ["20", "jharkhand"],
  ["21", "odisha"],
  ["22", "chhattisgarh"],
  ["23", "madhya pradesh"],
  ["24", "gujarat"],
  ["26", "dadra and nagar haveli and daman and diu"],
  ["27", "maharashtra"],
  ["29", "karnataka"],
  ["30", "goa"],
  ["31", "lakshadweep"],
  ["32", "kerala"],
  ["33", "tamil nadu"],
  ["34", "puducherry"],
  ["35", "andaman and nicobar islands"],
  ["36", "telangana"],
  ["37", "andhra pradesh"],
  ["38", "ladakh"],
  ["97", "other territory"],
]);

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function normalizeDateOnly(value: string | null | undefined): string | null {
  const text = asString(value);
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1] ?? null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function parseDateRange(startDate: string | null | undefined, endDate: string | null | undefined): DateRange {
  const normalizedStartDate = normalizeDateOnly(startDate);
  const normalizedEndDate = normalizeDateOnly(endDate);
  if (!normalizedStartDate || !normalizedEndDate) {
    throw new Error("Valid startDate and endDate are required in YYYY-MM-DD format.");
  }
  if (normalizedStartDate > normalizedEndDate) {
    throw new Error("startDate must be on or before endDate.");
  }
  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
  };
}

export function parseDateRangeFromRequest(request: NextRequest): DateRange {
  const startDate = request.nextUrl.searchParams.get("startDate") ?? request.nextUrl.searchParams.get("start");
  const endDate = request.nextUrl.searchParams.get("endDate") ?? request.nextUrl.searchParams.get("end");
  return parseDateRange(startDate, endDate);
}

export function parseReportFormat(request: NextRequest): ReportFormat {
  return request.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
}

export function isDateWithinRange(value: string | null | undefined, range: DateRange): boolean {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return false;
  return normalized >= range.startDate && normalized <= range.endDate;
}

export function csvCell(value: unknown): string {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value == null
          ? ""
          : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv<Row extends Record<string, unknown>>(rows: Row[], columns: CsvColumn<Row>[]): string {
  const header = columns.map((column) => csvCell(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(","));
  return [header, ...body].join("\n");
}

export function buildCsvResponse<Row extends Record<string, unknown>>(
  rows: Row[],
  columns: CsvColumn<Row>[],
  filename: string
): NextResponse {
  return new NextResponse(toCsv(rows, columns), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function buildJsonResponse<Row extends Record<string, unknown>>(
  rows: Row[],
  range: DateRange,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json({
    ok: true,
    startDate: range.startDate,
    endDate: range.endDate,
    count: rows.length,
    rows,
    ...extra,
  });
}

export function getFinancialYearLabel(value: string | null | undefined): string {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return "";
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));
  const fyStartYear = month >= 4 ? year : year - 1;
  return `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`;
}

export function maskPan(lastFour: string | null | undefined): string {
  const normalized = asString(lastFour);
  return normalized ? `XXXXXX${normalized.toUpperCase()}` : "";
}

function normalizeStateName(value: string | null | undefined): string | null {
  const normalized = asString(value)?.toLowerCase().replace(/[^a-z]/g, " ").replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function getStateNameFromGstin(gstin: string | null | undefined): string | null {
  const normalized = asString(gstin)?.toUpperCase();
  if (!normalized || normalized.length < 2) return null;
  return GST_STATE_CODE_TO_NAME.get(normalized.slice(0, 2)) ?? null;
}

export function splitGstByPlaceOfSupply(input: {
  gstAmount: number;
  placeOfSupply: string | null | undefined;
  supplierGstin: string | null | undefined;
}): { cgst: number; sgst: number; igst: number } {
  const gstAmount = Math.max(0, Math.round(asNumber(input.gstAmount)));
  if (gstAmount === 0) {
    return { cgst: 0, sgst: 0, igst: 0 };
  }

  const supplierState = normalizeStateName(getStateNameFromGstin(input.supplierGstin));
  const placeOfSupply = normalizeStateName(input.placeOfSupply);
  if (supplierState && placeOfSupply && supplierState === placeOfSupply) {
    const cgst = Math.floor(gstAmount / 2);
    return {
      cgst,
      sgst: gstAmount - cgst,
      igst: 0,
    };
  }

  return {
    cgst: 0,
    sgst: 0,
    igst: gstAmount,
  };
}
