import { escapeHtml, asNumber, asString, type JsonRecord } from "@/lib/platform-utils";

function shell(title: string, eyebrow: string, sections: string[]): string {
  return `<!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a">
      <div style="max-width:760px;margin:0 auto;padding:32px 20px">
        <div style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:28px;border-radius:24px;color:white">
          <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.75">${escapeHtml(eyebrow)}</div>
          <h1 style="margin:10px 0 0;font-size:32px;line-height:1.1">${escapeHtml(title)}</h1>
        </div>
        <div style="background:white;margin-top:16px;border-radius:24px;padding:28px;box-shadow:0 16px 40px rgba(15,23,42,.08)">
          ${sections.join("")}
        </div>
      </div>
    </body>
  </html>`;
}

function detailGrid(items: Array<{ label: string; value: string }>): string {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0">
    ${items
      .map(
        (item) => `<div style="padding:14px 16px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b">${escapeHtml(item.label)}</div>
          <div style="margin-top:8px;font-size:16px;font-weight:700;color:#0f172a">${escapeHtml(item.value)}</div>
        </div>`
      )
      .join("")}
  </div>`;
}

export function renderBookingReceipt(payload: JsonRecord): string {
  const totalPrice = asNumber(payload.total_price);
  return shell("Famlo Booking Receipt", "Guest Document", [
    `<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <div style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#0f172a,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900">F</div>
      <div>
        <div style="font-size:18px;font-weight:900;color:#0f172a">Famlo</div>
        <div style="font-size:12px;color:#64748b;font-weight:700">System-generated business receipt</div>
      </div>
    </div>`,
    `<p style="font-size:15px;line-height:1.7;color:#334155">Your booking is secured in Famlo. Keep this receipt for support, travel, and reimbursement records.</p>`,
    detailGrid([
      { label: "Receipt No.", value: asString(payload.receipt_number) ?? "N/A" },
      { label: "Issued At", value: asString(payload.issued_at) ?? "Now" },
      { label: "Booking ID", value: asString(payload.booking_id) ?? "N/A" },
      { label: "Property", value: asString(payload.property_name) ?? "Famlo Stay" },
      { label: "Location", value: asString(payload.property_location) ?? "Location pending" },
      { label: "Host Name", value: asString(payload.host_name) ?? "Famlo Host" },
      { label: "Guest", value: asString(payload.guest_name) ?? "Guest" },
      { label: "Check-in", value: asString(payload.check_in_date) ?? "N/A" },
      { label: "Check-out", value: asString(payload.check_out_date) ?? "N/A" },
      { label: "Guests", value: String(asNumber(payload.guests_count, 1)) },
      { label: "Booking Type", value: asString(payload.booking_type) ?? "Stay" },
      { label: "Total Amount Paid", value: `INR ${totalPrice.toLocaleString("en-IN")}` },
      { label: "Payment Method", value: asString(payload.payment_method) ?? "Online" },
      { label: "Payment Status", value: asString(payload.payment_status) ?? "pending" },
      { label: "Transaction Date", value: asString(payload.transaction_date) ?? "Pending" },
    ]),
    `<div style="padding:18px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#334155">Customer Support</div>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569">${escapeHtml(asString(payload.support_details) ?? "Email support@famlo.in or use the Famlo app for assistance.")}</p>
    </div>`,
    `<div style="padding:18px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#c2410c">Cancellation Policy</div>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#9a3412">${escapeHtml(asString(payload.cancellation_policy) ?? "Refer to your booking confirmation for the applicable Famlo cancellation policy.")}</p>
    </div>`,
    `<div style="padding:18px;border-radius:18px;background:#eff6ff;border:1px solid #bfdbfe">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#1d4ed8">What happens next</div>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1e3a8a">Your host and Famlo updates will stay connected in bookings and messages. Reach out to Famlo support if you need itinerary or payment help.</p>
    </div>`,
    `<p style="margin-top:20px;font-size:12px;color:#64748b;font-weight:700">Note: This is a system-generated business receipt.</p>`,
  ]);
}

export function renderPayoutStatement(payload: JsonRecord): string {
  return shell("Famlo Payout Statement", "Host Document", [
    `<p style="font-size:15px;line-height:1.7;color:#334155">This statement summarizes the payout calculation for your completed booking.</p>`,
    detailGrid([
      { label: "Payout ID", value: asString(payload.payout_id) ?? "N/A" },
      { label: "Booking ID", value: asString(payload.booking_id) ?? "N/A" },
      { label: "Host Name", value: asString(payload.host_name) ?? "Famlo Host" },
      { label: "Property", value: asString(payload.property_name) ?? "Famlo Stay" },
      { label: "Booking Amount", value: `INR ${asNumber(payload.gross_booking_value).toLocaleString("en-IN")}` },
      { label: "Platform Commission", value: `INR ${asNumber(payload.platform_fee).toLocaleString("en-IN")}` },
      { label: "GST on Commission", value: `INR ${asNumber(payload.platform_fee_tax).toLocaleString("en-IN")}` },
      { label: "Net Payout to Host", value: `INR ${asNumber(payload.amount).toLocaleString("en-IN")}` },
      { label: "Payout Date", value: asString(payload.payout_date) ?? "Pending" },
      { label: "Payout Status", value: asString(payload.status) ?? "scheduled" },
    ]),
    `<div style="padding:18px;border-radius:18px;background:#f0fdf4;border:1px solid #bbf7d0">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#15803d">Notes</div>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#166534">${escapeHtml(asString(payload.hold_reason) ?? "No payout hold is currently recorded on this statement.")}</p>
    </div>`,
  ]);
}

export function renderCompliancePack(payload: JsonRecord): string {
  const sections = (payload.sections as Array<{ label?: string; value?: string }> | null) ?? [];
  return shell("Famlo Annual Compliance Pack", "Tax & Compliance", [
    `<p style="font-size:15px;line-height:1.7;color:#334155">This annual pack combines payout, tax, and booking summary data for accounting and compliance review.</p>`,
    detailGrid([
      { label: "Year", value: asString(payload.year) ?? "N/A" },
      { label: "Host", value: asString(payload.host_name) ?? "Famlo Host" },
      { label: "Gross Revenue", value: `INR ${asNumber(payload.gross_revenue)}` },
      { label: "Net Payout", value: `INR ${asNumber(payload.net_payout)}` },
      { label: "Tax Liability", value: `INR ${asNumber(payload.tax_liability)}` },
      { label: "Bookings", value: String(asNumber(payload.booking_count)) },
    ]),
    `<div style="margin-top:20px">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:10px">Pack Breakdown</div>
      ${sections
        .map(
          (section) => `<div style="padding:14px 16px;border:1px solid #e2e8f0;border-radius:16px;margin-bottom:10px">
            <div style="font-weight:700;color:#0f172a">${escapeHtml(section.label ?? "Section")}</div>
            <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#475569">${escapeHtml(section.value ?? "")}</div>
          </div>`
        )
        .join("")}
    </div>`,
  ]);
}

export function renderEmailTemplate(input: {
  eyebrow: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
}): string {
  const cta =
    input.ctaLabel && input.ctaUrl
      ? `<a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;margin-top:18px;background:#0f172a;color:white;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700">${escapeHtml(input.ctaLabel)}</a>`
      : "";
  return shell(input.title, input.eyebrow, [
    `<p style="font-size:15px;line-height:1.8;color:#334155">${escapeHtml(input.message)}</p>${cta}`,
    `<p style="margin-top:28px;font-size:13px;line-height:1.7;color:#64748b">${escapeHtml(input.footer ?? "Famlo operations sent this update automatically.")}</p>`,
  ]);
}
