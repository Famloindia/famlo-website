// lib/resend.ts

/**
 * Resend Direct HTTP API Utility
 * 
 * Uses the built-in fetch to send emails via Resend's REST API.
 * Requires RESEND_API_KEY and MAIL_FROM_EMAIL in .env.local.
 */

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.MAIL_FROM_EMAIL || "hello@resend.dev";

  if (!apiKey) {
    console.warn(`[Resend Mock] To ${to}: ${subject} (API KEY MISSING)`);
    return { success: true, id: "mock-" + Date.now() };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: `Famlo <${fromEmail}>`,
        to: [to],
        subject: subject,
        html: html,
      })
    });
    clearTimeout(timeout);

    const data = await res.json();
    
    if (!res.ok) {
      console.error("Resend API Error:", data);
      return { success: false, error: data.message };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error("Resend delivery failed:", err);
    return { success: false };
  }
}
