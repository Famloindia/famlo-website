import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { HostProInvoicePayload } from "@/lib/pro-billing/invoice";

const execFileAsync = promisify(execFile);
const PYTHON_BIN =
  process.env.CODEX_BUNDLED_PYTHON_BIN ??
  "/Users/aryankrishan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

function escapePythonString(value: string): string {
  return JSON.stringify(value);
}

export async function renderHostProTaxInvoicePdf(
  payload: HostProInvoicePayload,
  options?: { logoPath?: string | null }
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "famlo-pro-tax-invoice-"));
  const inputPath = join(workDir, "input.json");
  const outputPath = join(workDir, "document.pdf");
  const logoPath = options?.logoPath ?? join(process.cwd(), "public", "logo-blue.png");

  try {
    await writeFile(inputPath, JSON.stringify({ payload, logoPath }), "utf8");

    const pythonScript = `
import json
from decimal import Decimal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

with open(${escapePythonString(inputPath)}, "r", encoding="utf-8") as f:
    data = json.load(f)

payload = data["payload"]
logo_path = data.get("logoPath")
styles = getSampleStyleSheet()
doc = SimpleDocTemplate(
    ${escapePythonString(outputPath)},
    pagesize=A4,
    rightMargin=16 * mm,
    leftMargin=16 * mm,
    topMargin=14 * mm,
    bottomMargin=14 * mm,
)
story = []

heading = ParagraphStyle(
    "Heading",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=17,
    leading=21,
    textColor=colors.HexColor("#111827"),
)
subheading = ParagraphStyle(
    "Subheading",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=9,
    leading=12,
    textColor=colors.HexColor("#4b5563"),
)
body = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.2,
    leading=12.5,
    textColor=colors.HexColor("#111827"),
)
small = ParagraphStyle(
    "Small",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8.2,
    leading=11,
    textColor=colors.HexColor("#6b7280"),
)
strong = ParagraphStyle(
    "Strong",
    parent=body,
    fontName="Helvetica-Bold",
)

logo_cell = Paragraph("<b>FAMLO</b>", heading)
if logo_path and Path(logo_path).exists():
    logo_cell = Image(logo_path, width=30 * mm, height=12 * mm, kind="proportional")

paid_badge = Table(
    [[Paragraph("<b>PAID</b>", ParagraphStyle("Badge", parent=body, alignment=1, textColor=colors.white, fontSize=8.5))]],
    colWidths=[22 * mm],
)
paid_badge.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#16a34a")),
    ("BOX", (0, 0), (-1, -1), 0, colors.white),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))

header_right = Table(
    [[Paragraph("<b>GST TAX INVOICE</b>", heading), paid_badge]],
    colWidths=[68 * mm, 24 * mm],
)
header_right.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("TOPPADDING", (0, 0), (-1, -1), 0),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
]))

header = Table([[logo_cell, header_right]], colWidths=[60 * mm, 110 * mm])
header.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ("TOPPADDING", (0, 0), (-1, -1), 0),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
]))
story.append(header)
story.append(Spacer(1, 7))

meta_rows = [
    ["Invoice No:", payload["invoiceNumber"], "Invoice Date:", payload["invoiceDate"]],
    ["Payment Reference:", payload["payment"]["reference"], "Payment Date:", payload["paymentDate"]],
]
meta = Table(meta_rows, colWidths=[26 * mm, 60 * mm, 28 * mm, 58 * mm])
meta.setStyle(TableStyle([
    ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#111827")),
    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 3),
    ("LINEBELOW", (0, 1), (-1, 1), 0.5, colors.HexColor("#d1d5db")),
]))
story.append(meta)
story.append(Spacer(1, 8))

supplier_lines = "<br/>".join([
    payload["supplier"]["legalName"],
    f"GSTIN: {payload['supplier']['gstin']}",
    payload["supplier"]["registeredAddress"],
])
billed_lines = "<br/>".join([
    f"Host Name: {payload['hostName']}",
    f"Property: {payload['propertyName']}",
    f"Email: {payload['hostEmail']}",
    f"Phone: {payload['hostPhone']}",
    f"GSTIN: {payload['hostGstin'] or 'Unregistered'}",
    f"Place of Supply: {payload['placeOfSupply']}",
])

party = Table(
    [[
        Paragraph(f"<b>Supplier</b><br/>{supplier_lines}", body),
        Paragraph(f"<b>Billed To</b><br/>{billed_lines}", body),
    ]],
    colWidths=[85 * mm, 85 * mm],
)
party.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
story.append(party)
story.append(Spacer(1, 9))

subscription = payload["subscription"]
subscription_rows = [
    ["Service", subscription["service"]],
    ["Plan", subscription["planLabel"]],
    ["Period", f"{subscription['periodStart']} to {subscription['periodEnd']}"],
    ["Properties", str(subscription["propertyCount"])],
    ["Rooms", str(subscription["roomCount"])],
]
subscription_table = Table(
    [[Paragraph("<b>Subscription Details</b>", strong), ""]] + subscription_rows,
    colWidths=[42 * mm, 128 * mm],
)
subscription_table.setStyle(TableStyle([
    ("SPAN", (0, 0), (1, 0)),
    ("BACKGROUND", (0, 0), (1, 0), colors.HexColor("#f3f4f6")),
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
    ("INNERGRID", (0, 1), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(subscription_table)
story.append(Spacer(1, 9))

charges = payload["charges"]
charge_rows = [[
    Paragraph("<b>Description</b>", subheading),
    Paragraph("<b>Qty</b>", subheading),
    Paragraph("<b>Rate</b>", subheading),
    Paragraph("<b>Taxable Value</b>", subheading),
]]
for item in charges["lineItems"]:
    charge_rows.append([
        Paragraph(item["description"], body),
        Paragraph(str(item["quantity"]), body),
        Paragraph(f"₹{Decimal(str(item['rate'])):.2f}", body),
        Paragraph(f"₹{Decimal(str(item['taxableValue'])):.2f}", body),
    ])

charges_table = Table(charge_rows, colWidths=[90 * mm, 16 * mm, 28 * mm, 36 * mm])
charges_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
    ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.append(charges_table)
story.append(Spacer(1, 8))

tax_rows = [["Taxable Value", f"₹{Decimal(str(charges['taxableValue'])):.2f}"]]
if charges["taxMode"] == "intra_state":
    tax_rows.append(["CGST @ 9%", f"₹{Decimal(str(charges['cgstAmount'])):.2f}"])
    tax_rows.append(["SGST @ 9%", f"₹{Decimal(str(charges['sgstAmount'])):.2f}"])
else:
    tax_rows.append(["IGST @ 18%", f"₹{Decimal(str(charges['igstAmount'])):.2f}"])
tax_rows.extend([
    ["Total GST", f"₹{Decimal(str(charges['totalGst'])):.2f}"],
    ["Round Off", f"₹{Decimal(str(charges['roundOff'])):.2f}"],
    ["Total Payable / Paid", f"₹{Decimal(str(charges['totalPaid'])):.2f}"],
])

totals = Table(tax_rows, colWidths=[120 * mm, 50 * mm])
totals.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, -1), (-1, -1), 10.6),
]))
story.append(totals)
story.append(Spacer(1, 9))

payment = payload["payment"]
payment_rows = [
    [Paragraph("<b>Payment Details</b>", strong), ""],
    ["Payment Status", payment["status"]],
    ["Payment Method", payment["method"]],
    ["Payment Reference", payment["reference"]],
    ["Currency", payment["currency"]],
]
payment_table = Table(payment_rows, colWidths=[42 * mm, 128 * mm])
payment_table.setStyle(TableStyle([
    ("SPAN", (0, 0), (1, 0)),
    ("BACKGROUND", (0, 0), (1, 0), colors.HexColor("#f3f4f6")),
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
    ("INNERGRID", (0, 1), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(payment_table)
story.append(Spacer(1, 8))

story.append(Paragraph(f"<b>Amount in Words:</b> {payload['amountInWords']}", body))
story.append(Spacer(1, 16))
story.append(Paragraph("<b>Authorized Signatory</b><br/>Famlo", body))
story.append(Spacer(1, 12))
story.append(Paragraph("This is a system-generated GST Tax Invoice cum Payment Receipt for Famlo Pro.", small))

doc.build(story)
`;

    await execFileAsync(PYTHON_BIN, ["-c", pythonScript], { maxBuffer: 10 * 1024 * 1024 });
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
