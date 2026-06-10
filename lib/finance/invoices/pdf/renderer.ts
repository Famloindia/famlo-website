import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PYTHON_BIN =
  process.env.CODEX_BUNDLED_PYTHON_BIN ??
  "/Users/aryankrishan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

type PdfLineItem = {
  description: string;
  quantity?: string;
  taxableAmount?: number;
  gstRate?: string;
  gstAmount?: number;
  totalAmount: number;
};

type PdfPartyBlock = {
  title: string;
  lines: string[];
};

type RenderFinancePdfInput = {
  title: string;
  subtitle?: string;
  documentNumber: string;
  documentDate: string;
  supplier: PdfPartyBlock;
  recipient: PdfPartyBlock;
  bookingMeta: Array<{ label: string; value: string }>;
  lineItems: PdfLineItem[];
  totals: Array<{ label: string; value: string }>;
  footerLines: string[];
  qrPlaceholder?: string;
};

function escapePythonString(value: string): string {
  return JSON.stringify(value);
}

export async function renderFinancePdf(input: RenderFinancePdfInput): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "famlo-finance-pdf-"));
  const inputPath = join(workDir, "input.json");
  const outputPath = join(workDir, "document.pdf");

  try {
    await writeFile(inputPath, JSON.stringify(input), "utf8");

    const pythonScript = `
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

with open(${escapePythonString(inputPath)}, "r", encoding="utf-8") as f:
    data = json.load(f)

doc = SimpleDocTemplate(${escapePythonString(outputPath)}, pagesize=A4, rightMargin=16*mm, leftMargin=16*mm, topMargin=16*mm, bottomMargin=16*mm)
styles = getSampleStyleSheet()
story = []

title = Paragraph(f"<b>{data['title']}</b>", styles["Title"])
story.append(title)
if data.get("subtitle"):
    story.append(Paragraph(data["subtitle"], styles["Normal"]))
story.append(Spacer(1, 8))

meta_rows = [
    ["Document No.", data["documentNumber"]],
    ["Document Date", data["documentDate"]],
]
meta_table = Table(meta_rows, colWidths=[35*mm, 120*mm])
meta_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), colors.whitesmoke),
    ("BOX", (0,0), (-1,-1), 0.5, colors.grey),
    ("INNERGRID", (0,0), (-1,-1), 0.25, colors.lightgrey),
    ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
]))
story.append(meta_table)
story.append(Spacer(1, 10))

party_rows = [
    [Paragraph(f"<b>{data['supplier']['title']}</b><br/>" + "<br/>".join(data['supplier']['lines']), styles["BodyText"]),
     Paragraph(f"<b>{data['recipient']['title']}</b><br/>" + "<br/>".join(data['recipient']['lines']), styles["BodyText"])],
]
party_table = Table(party_rows, colWidths=[86*mm, 86*mm])
party_table.setStyle(TableStyle([
    ("BOX", (0,0), (-1,-1), 0.5, colors.grey),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
]))
story.append(party_table)
story.append(Spacer(1, 10))

if data.get("bookingMeta"):
    booking_rows = [[Paragraph("<b>Booking Details</b>", styles["BodyText"]), ""]]
    for item in data["bookingMeta"]:
        booking_rows.append([item["label"], item["value"]])
    booking_table = Table(booking_rows, colWidths=[45*mm, 127*mm])
    booking_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.whitesmoke),
        ("BOX", (0,0), (-1,-1), 0.5, colors.grey),
        ("INNERGRID", (0,0), (-1,-1), 0.25, colors.lightgrey),
    ]))
    story.append(booking_table)
    story.append(Spacer(1, 10))

line_headers = ["Description", "Qty", "Taxable", "GST Rate", "GST", "Total"]
line_rows = [line_headers]
for item in data["lineItems"]:
    line_rows.append([
        item.get("description", ""),
        item.get("quantity", "1"),
        item.get("taxableAmount", ""),
        item.get("gstRate", ""),
        item.get("gstAmount", ""),
        item.get("totalAmount", ""),
    ])
line_table = Table(line_rows, colWidths=[60*mm, 14*mm, 26*mm, 22*mm, 20*mm, 24*mm])
line_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e8f0fe")),
    ("BOX", (0,0), (-1,-1), 0.5, colors.grey),
    ("INNERGRID", (0,0), (-1,-1), 0.25, colors.lightgrey),
    ("ALIGN", (1,0), (-1,-1), "RIGHT"),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
story.append(line_table)
story.append(Spacer(1, 10))

total_rows = [[item["label"], item["value"]] for item in data["totals"]]
totals_table = Table(total_rows, colWidths=[110*mm, 62*mm])
totals_table.setStyle(TableStyle([
    ("BOX", (0,0), (-1,-1), 0.5, colors.grey),
    ("INNERGRID", (0,0), (-1,-1), 0.25, colors.lightgrey),
    ("ALIGN", (1,0), (1,-1), "RIGHT"),
    ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
]))
story.append(totals_table)
story.append(Spacer(1, 10))

if data.get("qrPlaceholder"):
    story.append(Paragraph(f"QR / Signature Placeholder: {data['qrPlaceholder']}", styles["Italic"]))
    story.append(Spacer(1, 6))

for line in data.get("footerLines", []):
    story.append(Paragraph(line, styles["BodyText"]))
    story.append(Spacer(1, 3))

doc.build(story)
`;

    await execFileAsync(PYTHON_BIN, ["-c", pythonScript], {
      maxBuffer: 10 * 1024 * 1024,
    });

    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
