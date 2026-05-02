"use client";

import Link from "next/link";
import { 
  Mail, 
  MessageCircle, 
  Home, 
  MapPin, 
  Briefcase, 
  Newspaper, 
  ShieldCheck, 
  UserCheck, 
  Clock, 
  ChevronRight,
  ExternalLink,
  Camera,
  Share2,
  Play,
  Search,
  ArrowRight,
  Info,
  Video
} from "lucide-react";

export default function ContactPage(): React.JSX.Element {
  return (
    <main className="shell" style={{ paddingTop: "60px", paddingBottom: "100px" }}>
      {/* Hero Section */}
      <section className="fade-up visible" style={{ textAlign: "center", marginBottom: "64px" }}>
        <span className="section-label">Get in Touch</span>
        <h1 style={{ marginBottom: "24px" }}>Contact Us</h1>
        <p style={{ 
          maxWidth: "700px", 
          margin: "0 auto", 
          fontSize: "1.1rem", 
          color: "var(--text-secondary)",
          lineHeight: "1.6"
        }}>
          We'd love to hear from you. Whether you're planning a getaway, opening up your home, or just
          want to say hello — reach out, and a real human at famlo will get back to you.
        </p>
      </section>

      {/* Quick Help Banner */}
      <section className="panel" style={{ 
        marginBottom: "48px", 
        padding: "32px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        gap: "32px",
        flexWrap: "wrap",
        background: "linear-gradient(90deg, #1890ff 0%, #096dd9 100%)",
        color: "white",
        border: "none"
      }}>
        <div style={{ flex: "1", minWidth: "300px" }}>
          <h2 style={{ color: "white", marginBottom: "12px", fontSize: "28px" }}>Quick Help</h2>
          <p style={{ color: "rgba(255,255,255,0.9)", margin: 0 }}>
            For most questions, our Help Centre is the fastest place to find answers — booking changes,
            host onboarding, payouts, cancellations, and more.
          </p>
        </div>
        <Link href="/help" className="btn-primary" style={{ 
          background: "white", 
          color: "#1890ff", 
          display: "flex", 
          alignItems: "center", 
          gap: "8px",
          textDecoration: "none",
          fontWeight: "700"
        }}>
          Visit the Help Centre <ArrowRight size={18} />
        </Link>
      </section>

      <div style={{ marginBottom: "64px", textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
          If you can't find what you need there, the right contact channel below will get you sorted.
        </p>
      </div>

      {/* Contact Channels Grid */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", 
        gap: "24px",
        marginBottom: "80px"
      }}>
        {/* General Enquiries */}
        <div className="panel" style={{ padding: "32px", display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: "var(--accent-light)", padding: "10px", borderRadius: "12px", color: "var(--accent-primary)" }}>
              <Mail size={24} />
            </div>
            <h3 style={{ margin: 0 }}>General Enquiries</h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
            For anything that doesn't fit the categories below — partnerships, feedback, a kind word, a
            complaint, or just curiosity about what we do.
          </p>
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Email</span>
              <a href="mailto:hello@famlo.in" style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 700 }}>hello@famlo.in</a>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Response time</span>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Within 24 working hours</span>
            </div>
          </div>
        </div>

        {/* Guest Support */}
        <div className="panel" style={{ padding: "32px", display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: "#f6ffed", padding: "10px", borderRadius: "12px", color: "#52c41a" }}>
              <MessageCircle size={24} />
            </div>
            <h3 style={{ margin: 0 }}>Guest Support</h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
            Booking issues, refunds, check-in problems, payment queries, or help during your stay.
          </p>
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Email: <a href="mailto:hello@famlo.in" style={{ color: "var(--accent-primary)", textDecoration: "none" }}>hello@famlo.in</a></span>
              <span style={{ fontSize: "0.85rem", background: "var(--bg-primary)", padding: "4px 8px", borderRadius: "4px" }}>
                Subject: Guest Support – [Your Booking ID]
              </span>
            </div>
            <div style={{ background: "#fff1f0", padding: "12px", borderRadius: "8px", border: "1px solid #ffa39e" }}>
              <p style={{ fontSize: "0.8rem", color: "#cf1322", margin: 0, fontWeight: 600 }}>
                Urgent stay issues? Mark your email "URGENT" in the subject line for prioritisation.
              </p>
            </div>
          </div>
        </div>

        {/* For Hosts */}
        <div className="panel" style={{ padding: "32px", display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: "#fff7e6", padding: "10px", borderRadius: "12px", color: "#faad14" }}>
              <Home size={24} />
            </div>
            <h3 style={{ margin: 0 }}>For Hosts</h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
            Listing your home, KYC and verification, payouts, dashboard issues, or help with homestay
            registration and approvals.
          </p>
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Email: <a href="mailto:hello@famlo.in" style={{ color: "var(--accent-primary)", textDecoration: "none" }}>hello@famlo.in</a></span>
              <span style={{ fontSize: "0.85rem", background: "var(--bg-primary)", padding: "4px 8px", borderRadius: "4px" }}>
                Subject: Host Support – [Your Property/Listing Name]
              </span>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              <Link href="/joinfamlo" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.9rem", color: "var(--accent-primary)", fontWeight: 700, textDecoration: "none" }}>
                Become a Host <ChevronRight size={16} />
              </Link>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                New to famlo? Visit Become a Host to get started, or write to us and we'll walk you through it.
              </p>
            </div>
          </div>
        </div>

        {/* For Hommis */}
        <div className="panel" style={{ padding: "32px", display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: "#e6fffb", padding: "10px", borderRadius: "12px", color: "#13c2c2" }}>
              <MapPin size={24} />
            </div>
            <h3 style={{ margin: 0 }}>For Hommis</h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
            Interested in becoming a registered Hommi and showing travellers around your city — on foot or with a vehicle? We'd love to talk.
          </p>
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Email: <a href="mailto:hello@famlo.in" style={{ color: "var(--accent-primary)", textDecoration: "none" }}>hello@famlo.in</a></span>
              <span style={{ fontSize: "0.85rem", background: "var(--bg-primary)", padding: "4px 8px", borderRadius: "4px" }}>
                Subject: Hommi Application – [Your City]
              </span>
            </div>
          </div>
        </div>

        {/* Partnerships & Business */}
        <div className="panel" style={{ padding: "32px", display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: "#f9f0ff", padding: "10px", borderRadius: "12px", color: "#722ed1" }}>
              <Briefcase size={24} />
            </div>
            <h3 style={{ margin: 0 }}>Partnerships & Business</h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
            Channel manager integrations, OTA partnerships, corporate stays, tourism boards, travel agents, or media collaborations.
          </p>
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Email: <a href="mailto:hello@famlo.in" style={{ color: "var(--accent-primary)", textDecoration: "none" }}>hello@famlo.in</a></span>
              <span style={{ fontSize: "0.85rem", background: "var(--bg-primary)", padding: "4px 8px", borderRadius: "4px" }}>
                Subject: Partnerships – [Your Organisation]
              </span>
            </div>
          </div>
        </div>

        {/* Press & Media */}
        <div className="panel" style={{ padding: "32px", display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: "#fff0f6", padding: "10px", borderRadius: "12px", color: "#eb2f96" }}>
              <Newspaper size={24} />
            </div>
            <h3 style={{ margin: 0 }}>Press & Media</h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
            For press queries, brand assets, founder interviews, or media kits.
          </p>
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Email: <a href="mailto:hello@famlo.in" style={{ color: "var(--accent-primary)", textDecoration: "none" }}>hello@famlo.in</a></span>
              <span style={{ fontSize: "0.85rem", background: "var(--bg-primary)", padding: "4px 8px", borderRadius: "4px" }}>
                Subject: Press – [Publication Name]
              </span>
            </div>
          </div>
        </div>

        {/* Legal & Privacy */}
        <div className="panel" style={{ padding: "32px", display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: "#f0f5ff", padding: "10px", borderRadius: "12px", color: "#2f54eb" }}>
              <ShieldCheck size={24} />
            </div>
            <h3 style={{ margin: 0 }}>Legal, Privacy & Data Protection</h3>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
            Questions about Privacy Policy, Terms of Service, copyright issues, data-protection rights (DPDP Act, 2023), or law-enforcement requests.
          </p>
          <div style={{ paddingTop: "8px", borderTop: "1px solid var(--border-color)", marginTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Email: <a href="mailto:hello@famlo.in" style={{ color: "var(--accent-primary)", textDecoration: "none" }}>hello@famlo.in</a></span>
              <span style={{ fontSize: "0.85rem", background: "var(--bg-primary)", padding: "4px 8px", borderRadius: "4px" }}>
                Subject: Legal – [Brief description]
              </span>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <Link href="/legal" style={{ fontSize: "0.85rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}>Legal & Privacy Center</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Grievance Officer Section */}
      <section style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "32px" }}>
          <span className="section-label">Compliance</span>
          <h2 style={{ fontSize: "36px", marginBottom: "16px" }}>Grievance Officer</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "800px" }}>
            In accordance with the Information Technology Act, 2000 and other applicable rules, the contact
            details of our designated Grievance Officer are as follows:
          </p>
        </div>

        <div className="panel" style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "40px",
          padding: "40px",
          background: "#fff"
        }}>
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div style={{ background: "var(--accent-light)", padding: "12px", borderRadius: "50%", color: "var(--accent-primary)" }}>
                <UserCheck size={24} />
              </div>
              <div>
                <h4 style={{ margin: "0 0 4px", fontSize: "1.1rem", fontWeight: 700 }}>Aryan Krishan</h4>
                <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.95rem" }}>Founder & Grievance Officer</p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "16px", paddingLeft: "56px" }}>
              <div>
                <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", color: "var(--accent-primary)", marginBottom: "4px" }}>Email</span>
                <a href="mailto:aryan@famlo.in" style={{ fontSize: "1rem", color: "var(--text-primary)", textDecoration: "none", fontWeight: 600 }}>aryan@famlo.in</a>
              </div>
              <div>
                <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", color: "var(--accent-primary)", marginBottom: "4px" }}>Working Hours</span>
                <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-secondary)" }}>Monday to Friday, 10:00 AM – 6:00 PM IST</p>
              </div>
              <div>
                <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", color: "var(--accent-primary)", marginBottom: "4px" }}>Address for Service</span>
                <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-secondary)" }}>TISC IIT Jodhpur, Rajasthan, India</p>
              </div>
            </div>
          </div>

          <div style={{ background: "var(--bg-primary)", padding: "32px", borderRadius: "16px" }}>
            <h4 style={{ marginBottom: "20px", fontSize: "1.1rem" }}>Commitments</h4>
            <ul style={{ display: "grid", gap: "16px", padding: 0, listStyle: "none" }}>
              <li style={{ display: "flex", gap: "12px" }}>
                <div style={{ color: "var(--accent-primary)", marginTop: "2px" }}><Clock size={18} /></div>
                <div>
                  <strong style={{ display: "block", fontSize: "0.95rem" }}>Acknowledge Complaint</strong>
                  <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Within 24 hours of receipt</span>
                </div>
              </li>
              <li style={{ display: "flex", gap: "12px" }}>
                <div style={{ color: "var(--accent-primary)", marginTop: "2px" }}><ShieldCheck size={18} /></div>
                <div>
                  <strong style={{ display: "block", fontSize: "0.95rem" }}>Resolve Complaint</strong>
                  <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Within 15 days of receipt</span>
                </div>
              </li>
            </ul>
            <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid var(--border-color)" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                If your complaint relates to personal data and you are not satisfied, you may escalate to the Data Protection Board of India.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Response Time Table */}
      <section style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "32px" }}>
          <span className="section-label">Reliability</span>
          <h2 style={{ fontSize: "36px", marginBottom: "16px" }}>Response Time Commitments</h2>
        </div>

        <div className="panel" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={{ padding: "20px 24px", fontWeight: 700, borderBottom: "1px solid var(--border-color)" }}>Type of Request</th>
                  <th style={{ padding: "20px 24px", fontWeight: 700, borderBottom: "1px solid var(--border-color)" }}>Acknowledgement</th>
                  <th style={{ padding: "20px 24px", fontWeight: 700, borderBottom: "1px solid var(--border-color)" }}>Resolution</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", fontWeight: 600 }}>General enquiry</td>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Within 24 hours</td>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Within 3 working days</td>
                </tr>
                <tr>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", fontWeight: 600 }}>Guest / Host support</td>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Within 12 hours</td>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Within 2 working days</td>
                </tr>
                <tr>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", fontWeight: 600 }}>Urgent in-stay issue</td>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", color: "#cf1322", fontWeight: 700 }}>Within 2 hours</td>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", color: "#cf1322", fontWeight: 700 }}>As soon as possible</td>
                </tr>
                <tr>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", fontWeight: 600 }}>Grievance / complaint</td>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Within 24 hours</td>
                  <td style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Within 15 days</td>
                </tr>
                <tr>
                  <td style={{ padding: "20px 24px", color: "var(--text-primary)", fontWeight: 600 }}>Data protection / legal</td>
                  <td style={{ padding: "20px 24px", color: "var(--text-secondary)" }}>Within 48 hours</td>
                  <td style={{ padding: "20px 24px", color: "var(--text-secondary)" }}>As required by law</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: "20px 24px", background: "var(--accent-light)", borderTop: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "10px" }}>
            <Info size={16} style={{ color: "var(--accent-primary)" }} />
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              <strong>Working hours:</strong> Monday to Saturday, 10:00 AM – 7:00 PM IST. Emails received outside these hours will be addressed on the next working day.
            </p>
          </div>
        </div>
      </section>

      {/* Social & Office */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", 
        gap: "48px",
        marginBottom: "80px"
      }}>
        {/* Connect With Us */}
        <div>
          <h3 style={{ marginBottom: "24px" }}>Connect With Us</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
            Follow famlo for travel inspiration, host stories, and updates from across India.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <a href="https://instagram.com/famlo.in" target="_blank" className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", textDecoration: "none" }}>
              <Camera size={18} /> Instagram
            </a>
            <a href="https://linkedin.com/company/famlo" target="_blank" className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", textDecoration: "none" }}>
              <Share2 size={18} /> LinkedIn
            </a>
            <a href="https://youtube.com/@famlo" target="_blank" className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", textDecoration: "none" }}>
              <Play size={18} /> YouTube
            </a>
            <a href="https://reddit.com/r/famloindia" target="_blank" className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", textDecoration: "none" }}>
              <Search size={18} /> Reddit
            </a>
          </div>
          <p style={{ marginTop: "24px", fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
            Please note: social media is not a support channel. For any issue requiring assistance, please
            email us at hello@famlo.in.
          </p>
        </div>

        {/* Registered Office */}
        <div>
          <h3 style={{ marginBottom: "24px" }}>Registered Office</h3>
          <div className="panel" style={{ padding: "32px", display: "grid", gap: "16px" }}>
            <div style={{ display: "flex", gap: "16px" }}>
              <div style={{ color: "var(--accent-primary)" }}><MapPin size={24} /></div>
              <div>
                <strong style={{ display: "block", marginBottom: "4px" }}>famlo</strong>
                <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  TISC IIT Jodhpur,<br />
                  Rajasthan, 342030<br />
                  India
                </p>
              </div>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
              Please use email for the fastest response. Postal correspondence is accepted but takes longer to action.
            </p>
          </div>
        </div>
      </div>

      {/* Closing Note */}
      <section className="panel" style={{ 
        padding: "48px", 
        textAlign: "center", 
        background: "linear-gradient(180deg, var(--bg-card) 0%, var(--bg-primary) 100%)",
        border: "1px dashed var(--accent-primary)"
      }}>
        <h3 style={{ marginBottom: "20px" }}>A Note from Us</h3>
        <p style={{ 
          maxWidth: "700px", 
          margin: "0 auto 24px", 
          fontSize: "1.1rem", 
          color: "var(--text-secondary)",
          lineHeight: "1.7"
        }}>
          famlo is built by a small team that genuinely cares about every stay, every host, and every
          traveller who trusts us. If something isn't working — tell us. If something delighted you — tell us
          that too. Either way, we read every email.
        </p>
        <div style={{ fontSize: "1.2rem", fontWeight: 700, fontFamily: "var(--font-display)" }}>
          — Team famlo
        </div>
      </section>
    </main>
  );
}
