"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  ChevronRight, 
  HelpCircle, 
  User, 
  Home, 
  Compass, 
  MessageSquare, 
  CreditCard, 
  ShieldCheck, 
  Search,
  ArrowRight,
  ChevronDown,
  Info
} from "lucide-react";

type HelpCategory = "guest" | "host" | "hommie" | "contact";

export default function HelpCenterPage(): React.JSX.Element {
  const [activeCategory, setActiveCategory] = useState<HelpCategory>("guest");

  const categories = [
    { id: "guest", label: "I am a Guest", icon: User },
    { id: "host", label: "I am a Host", icon: Home },
    { id: "hommie", label: "I am a Hommie", icon: Compass },
    { id: "contact", label: "Contact Support", icon: MessageSquare },
  ] as const;

  return (
    <main className="shell" style={{ paddingTop: "60px", paddingBottom: "100px" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        
        {/* Hero Section */}
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#1A56DB", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: "12px" }}>
            Support Center
          </span>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 900, color: "#0F172A", marginBottom: "24px", letterSpacing: "-0.02em" }}>
            How can we help you today?
          </h1>
          <p style={{ fontSize: "18px", color: "#64748B", maxWidth: "600px", margin: "0 auto", lineHeight: 1.6 }}>
            Famlo is a people-first homestay and local connection platform. We&apos;re here to ensure your experience is smooth and meaningful.
          </p>
        </div>

        {/* Category Switcher */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
          gap: "16px", 
          marginBottom: "48px" 
        }}>
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  padding: "24px",
                  borderRadius: "20px",
                  border: "2px solid",
                  borderColor: isActive ? "#1A56DB" : "#E2E8F0",
                  background: isActive ? "#F0F7FF" : "#fff",
                  color: isActive ? "#1A56DB" : "#64748B",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  textAlign: "center"
                }}
              >
                <div style={{ 
                  width: "48px", 
                  height: "48px", 
                  borderRadius: "12px", 
                  background: isActive ? "#1A56DB" : "#F1F5F9", 
                  color: isActive ? "#fff" : "#64748B",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "4px"
                }}>
                  <Icon size={24} />
                </div>
                <span style={{ fontWeight: 800, fontSize: "15px" }}>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="panel" style={{ padding: "clamp(24px, 6vw, 48px)", background: "#fff" }}>
          
          {activeCategory === "guest" && (
            <div style={{ display: "grid", gap: "48px" }}>
              <HelpSection title="A. Booking a Stay" topics={[
                "How to search for homes on Famlo",
                "What information is shown before booking",
                "Why exact address is shared only after booking/confirmation",
                "How to request or confirm a booking",
                "What happens after payment",
                "How to contact the host"
              ]} />
              <HelpSection title="B. During the Stay" topics={[
                "Check-in process",
                "Check-out process",
                "House rules",
                "What to do if the host is not reachable",
                "Emergency help",
                "How to submit a story/review after stay"
              ]} />
              <HelpSection title="C. Payments & Refunds" topics={[
                "How payment works",
                "Platform fee / tax status explanation",
                "Cancellation policy",
                "Refund timeline",
                "Failed payment issue",
                "Manual refund support"
              ]} />
              <HelpSection title="D. Safety & Trust" topics={[
                "Host verification",
                "Guest responsibility",
                "Emergency button",
                "Reporting unsafe behaviour",
                "Privacy of personal details"
              ]} />
            </div>
          )}

          {activeCategory === "host" && (
            <div style={{ display: "grid", gap: "48px" }}>
              <HelpSection title="A. Becoming a Famlo Host" topics={[
                "Who can list on Famlo",
                "How to onboard your home",
                "Required photos",
                "Required documents/KYC",
                "Verification process",
                "Approval timeline"
              ]} />
              <HelpSection title="B. Managing Your Listing" topics={[
                "How to update room details",
                "How to update price",
                "How to add house rules",
                "How to update photos",
                "How to pause/unpause listing"
              ]} />
              <HelpSection title="C. Bookings & Calendar" topics={[
                "How booking requests work",
                "How to approve or reject booking",
                "How calendar blocking works",
                "iCal integration with other OTAs",
                "Avoiding double booking",
                "WhatsApp booking approval notifications"
              ]} />
              <HelpSection title="D. Payouts & Commission" topics={[
                "How host payout works",
                "Famlo commission",
                "Tax status on platform commission",
                "Payout timeline",
                "Cancellation penalty and host preparation fee"
              ]} />
            </div>
          )}

          {activeCategory === "hommie" && (
            <div style={{ display: "grid", gap: "48px" }}>
              <HelpSection title="A. Becoming a Hommie" topics={[
                "Who is a Hommie",
                "What services can Hommies offer",
                "City walk, food walk, cultural help, local support",
                "Verification process"
              ]} />
              <HelpSection title="B. Guest Interaction Rules" topics={[
                "Safety rules",
                "Communication guidelines",
                "Payment rules",
                "What not to do"
              ]} />
            </div>
          )}

          {activeCategory === "contact" && (
            <div style={{ display: "grid", gap: "32px" }}>
              <div>
                <h2 style={{ fontSize: "24px", fontWeight: 900, color: "#0F172A", marginBottom: "16px" }}>Need direct help?</h2>
                <p style={{ fontSize: "16px", color: "#64748B", lineHeight: 1.6, marginBottom: "32px" }}>
                  Need help with a booking, hosting, payment, refund, or safety issue? Famlo Support is here to help you.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                  <ContactCard 
                    title="WhatsApp Support" 
                    value="+91 74044 77395" 
                    desc="Quick questions & chat support"
                    link="https://wa.me/917404477395"
                  />
                  <ContactCard 
                    title="Email Support" 
                    value="hello@famlo.in" 
                    desc="Formal requests & documentation"
                    link="mailto:hello@famlo.in"
                  />
                  <ContactCard 
                    title="Response Time" 
                    value="10 AM – 7 PM" 
                    desc="Usually within 24 working hours"
                  />
                </div>
              </div>

              <div style={{ marginTop: "24px", padding: "24px", background: "#FEF2F2", borderRadius: "16px", border: "1px solid #FECACA", display: "flex", gap: "16px" }}>
                <div style={{ color: "#DC2626" }}><Info size={24} /></div>
                <div>
                  <h4 style={{ margin: "0 0 8px", color: "#991B1B", fontSize: "16px", fontWeight: 800 }}>Emergency Support</h4>
                  <p style={{ margin: 0, fontSize: "14px", color: "#991B1B", lineHeight: 1.5 }}>
                    If you are currently on a stay and need urgent safety assistance, please use the <strong>Emergency Button</strong> in your active booking dashboard or call our helpline immediately.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

function HelpSection({ title, topics }: { title: string, topics: string[] }) {
  return (
    <div>
      <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
        {title}
      </h3>
      <div style={{ display: "grid", gap: "12px" }}>
        {topics.map((topic, i) => (
          <div 
            key={i} 
            style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between",
              padding: "16px 20px", 
              background: "#F8FAFC", 
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              border: "1px solid transparent"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.borderColor = "#1A56DB";
              e.currentTarget.style.transform = "translateX(4px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#F8FAFC";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.transform = "translateX(0)";
            }}
          >
            <span style={{ fontSize: "15px", fontWeight: 600, color: "#334155" }}>{topic}</span>
            <ChevronRight size={16} color="#94A3B8" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactCard({ title, value, desc, link }: { title: string, value: string, desc: string, link?: string }) {
  const content = (
    <div style={{ padding: "24px", borderRadius: "16px", border: "1px solid #E2E8F0", background: "#fff", transition: "all 0.2s ease" }}>
      <span style={{ fontSize: "12px", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>
        {title}
      </span>
      <div style={{ fontSize: "18px", fontWeight: 900, color: "#0F172A", marginBottom: "4px" }}>
        {value}
      </div>
      <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>{desc}</p>
    </div>
  );

  if (link) {
    return (
      <a href={link} target="_blank" style={{ textDecoration: "none", display: "block" }}>
        {content}
      </a>
    );
  }

  return content;
}
