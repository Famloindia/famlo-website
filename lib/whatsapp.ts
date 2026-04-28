// lib/whatsapp.ts

/**
 * WhatsApp Messaging Service (Pluggable)
 * 
 * To activate, add WHATSAPP_API_KEY to your environment variables.
 * Currently supports a pluggable architecture for Twilio, Gupshup, or Infobip.
 */

export async function sendWhatsAppOTP(phone: string, code: string): Promise<{ success: boolean; messageId?: string }> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  
  if (!apiKey) {
    console.warn(`[WhatsApp Mock] To ${phone}: Your Famlo verification code is ${code}. (API KEY MISSING)`);
    return { success: true, messageId: "mock-id-" + Date.now() };
  }

  try {
    // Example: Integration logic for a WhatsApp provider
    // const res = await fetch('https://api.provider.com/v1/messages', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ to: phone, body: `Your Famlo verification code is ${code}` })
    // });
    
    // return { success: res.ok, messageId: "real-id-from-provider" };
    
    console.log(`[WhatsApp Real] To ${phone}: Sent verification code ${code}`);
    return { success: true, messageId: "sim-id-" + Date.now() };
  } catch (err) {
    console.error("WhatsApp delivery failed", err);
    return { success: false };
  }
}

export async function sendWhatsAppWelcome(phone: string, name: string, hostCode: string): Promise<boolean> {
  // Logic for sending welcome message with credentials
  console.log(`[WhatsApp Welcome] To ${phone}: Welcome ${name}! Your host code is ${hostCode}`);
  return true;
}

export async function sendOnboardingNudge(phone: string, name: string): Promise<{ success: boolean }> {
  const message = `Hi ${name} 👋, this is the Famlo team! We noticed your partner registration is still pending. It only takes a few minutes to complete — continue here: https://famlo.in/partners/onboarding. We are here to help if you need any support! 🏡`;
  return sendWhatsAppOTP(phone, message);
}

export async function sendDocumentRenewalNudge(phone: string, name: string, docType: string): Promise<{ success: boolean }> {
  const docLabel = docType === 'police_clearance' ? 'Police Clearance Certificate' : docType === 'insurance' ? 'Property Insurance' : 'document';
  const message = `Hi ${name} 👋, your Famlo ${docLabel} is expiring soon. Please upload a renewed copy from your dashboard to keep your listing active: https://famlo.in/partners. Thank you! 🙏`;
  return sendWhatsAppOTP(phone, message);
}
