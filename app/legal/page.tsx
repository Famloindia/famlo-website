"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Shield, FileText, Info } from "lucide-react";

type LegalTab = "privacy" | "terms";

export default function LegalPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<LegalTab>("privacy");

  return (
    <main className="shell" style={{ paddingTop: "60px", paddingBottom: "100px" }}>
      <div className="panel" style={{ maxWidth: "900px", margin: "0 auto", padding: "clamp(24px, 6vw, 64px)", background: "#fff" }}>
        
        <div style={{ marginBottom: "40px" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#1A56DB", textDecoration: "none", fontSize: "14px", fontWeight: 700, marginBottom: "24px" }}>
            <ChevronLeft size={16} />
            Back to Homepage
          </Link>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "20px" }}>
            <div>
              <span style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#1A56DB", display: "block", marginBottom: "8px" }}>
                Legal Documents
              </span>
              <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 900, margin: 0, color: "#0F172A", letterSpacing: "-0.02em" }}>
                {activeTab === "privacy" ? "Privacy Policy" : "Terms and Conditions"}
              </h1>
              <p style={{ marginTop: "16px", fontSize: "16px", color: "#64748B", fontWeight: 500 }}>
                {activeTab === "privacy" 
                  ? "Effective Date: 29 Apr 2026 | Last Updated: 29 Apr 2026"
                  : "Last Updated: 25 April 2026"}
              </p>
            </div>

            {/* Tab Switcher */}
            <div style={{ 
              display: "flex", 
              background: "#F1F5F9", 
              padding: "4px", 
              borderRadius: "12px",
              gap: "4px"
            }}>
              <button 
                onClick={() => setActiveTab("privacy")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 700,
                  transition: "all 0.2s ease",
                  background: activeTab === "privacy" ? "#fff" : "transparent",
                  color: activeTab === "privacy" ? "#1A56DB" : "#64748B",
                  boxShadow: activeTab === "privacy" ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                }}
              >
                <Shield size={16} /> Privacy
              </button>
              <button 
                onClick={() => setActiveTab("terms")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 700,
                  transition: "all 0.2s ease",
                  background: activeTab === "terms" ? "#fff" : "transparent",
                  color: activeTab === "terms" ? "#1A56DB" : "#64748B",
                  boxShadow: activeTab === "terms" ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                }}
              >
                <FileText size={16} /> Terms
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "32px", fontSize: "16px", lineHeight: "1.7", color: "#334155" }}>
          
          {activeTab === "privacy" ? (
            <>
              <section>
                <p style={{ fontWeight: 600, color: "#0F172A" }}>famlo (www.famlo.in)</p>
              </section>

              <section id="introduction">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>1. Introduction</h2>
                <p>
                  This Privacy Policy (“Policy”) describes how famlo (“famlo”, “we”, “us”, or “our”) collects, uses, stores, processes, discloses, transfers, and protects the personal data of users who access or use our website at www.famlo.in, our mobile application (if any), and any related services, features, content, dashboards, or applications offered by us (collectively, the “Platform”).
                </p>
                <p>
                  famlo is an online travel marketplace that enables individuals (“Hosts”) to list their residential properties as homestays and assists Hosts in obtaining the necessary legal registrations and approvals for operating such homestays. The Platform also enables travellers and guests (“Guests” or “Users”) to discover, book, and pay for homestay accommodations and to engage with registered local companions (“Hommis”), who provide guided walking or vehicle-based tours and city-exploration services. Hosts are also provided with a dashboard to manage their listings, bookings, availability, pricing, and communications.
                </p>
                <p>
                  This Policy is published in compliance with: (i) the Digital Personal Data Protection Act, 2023 (“DPDP Act”); (ii) the Information Technology Act, 2000, and the rules made thereunder, including the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 (“SPDI Rules”); (iii) the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 (“Intermediary Rules”); and (iv) the Consumer Protection (E-Commerce) Rules, 2020.
                </p>
                <p>
                  By accessing, browsing, registering on, or otherwise using the Platform, you confirm that you have read, understood, and agree to be bound by this Policy and our Terms of Service. If you do not agree with any part of this Policy, you must immediately discontinue use of the Platform.
                </p>
              </section>

              <section id="applicability">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>2. Applicability and Scope</h2>
                <p>
                  This Policy applies to all Users of the Platform, whether registered or unregistered, and to all personal data collected by famlo through the Platform, including data collected from Hosts, Guests, Hommis, browsers, prospective customers, and any third parties whose data is shared with us by the foregoing categories of Users (such as travel companions).
                </p>
                <p>
                  This Policy does not govern the privacy practices of any third-party websites, applications, or services that may be linked to or accessed through the Platform. We are not responsible for the privacy practices of such third parties, and Users are advised to review the privacy policies of such third parties separately.
                </p>
              </section>

              <section id="definitions">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>3. Definitions</h2>
                <ul style={{ display: "grid", gap: "12px", paddingLeft: "20px" }}>
                  <li><strong>“Data Fiduciary”</strong> shall have the same meaning as ascribed to it under the DPDP Act, and refers to famlo, which alone or in conjunction with other persons determines the purpose and means of processing of personal data.</li>
                  <li><strong>“Data Principal”</strong> shall have the same meaning as ascribed to it under the DPDP Act, and refers to the individual to whom the personal data relates.</li>
                  <li><strong>“Personal Data”</strong> means any data about an individual who is identifiable by or in relation to such data, as defined under the DPDP Act.</li>
                  <li><strong>“Sensitive Personal Data or Information” (“SPDI”)</strong> shall have the meaning ascribed under Rule 3 of the SPDI Rules, including financial information, passwords, biometric information, physical/physiological information, and identity-document information.</li>
                  <li><strong>“Processing”</strong> means any operation or set of operations performed on personal data, including collection, recording, organisation, structuring, storage, use, retrieval, disclosure, alignment, restriction, erasure, or destruction.</li>
                </ul>
              </section>

              <section id="information-collected">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>4. Information We Collect</h2>
                <p>We collect personal data and other information from Users in the following categories. The specific data collected depends on the nature of your interaction with the Platform (i.e., whether you are a Guest, a Host, a Hommi, or a casual visitor).</p>
                
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "20px", marginBottom: "12px" }}>4.1 Account and Registration Data</h3>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li>Full name (first name and surname);</li>
                  <li>Email address;</li>
                  <li>Mobile number (with country code);</li>
                  <li>Date of birth (to verify that you are at least 18 (eighteen) years of age);</li>
                  <li>Password (stored in encrypted/hashed form);</li>
                  <li>Profile photograph (optional);</li>
                  <li>Gender (optional);</li>
                  <li>Residential or correspondence address (where required for billing or compliance).</li>
                </ul>

                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>4.2 Host Identity and KYC Data</h3>
                <p>If you register as a Host or list a property on the Platform, we additionally collect the following “Sensitive Personal Data” and identification information for the purposes of identity verification, regulatory compliance, anti-fraud screening, tax reporting, and assistance in obtaining homestay registrations and approvals:</p>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li>Government-issued photo identification (Aadhaar, PAN, Passport, Voter ID, or DL);</li>
                  <li>PAN details for TDS reporting and GST compliance;</li>
                  <li>Proof of ownership or legal right to list the property;</li>
                  <li>Photographs of the property and its amenities;</li>
                  <li>Bank account details for payout disbursement;</li>
                  <li>Correspondence with municipal, tourism, or other regulatory authorities;</li>
                  <li>Selfie or live-photograph for identity matching.</li>
                </ul>

                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>4.3 Booking, Stay and Travel Companion Data</h3>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li>Booking details and property selected;</li>
                  <li>Names and IDs of travel companions (where required);</li>
                  <li>Special requests, dietary preferences, or accessibility requirements;</li>
                  <li>Reviews, ratings, and content posted by you;</li>
                  <li>Communications between Users exchanged through the Platform.</li>
                </ul>

                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>4.4 Payment Information</h3>
                <p>famlo does not directly store full payment-card numbers or net-banking credentials. Payments are processed by Razorpay (PCI-DSS certified). We may retain Transaction IDs, amount, status, and billing details.</p>

                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>4.5 Location Data</h3>
                <p>With your opt-in consent, we collect precise geolocation data to provide nearby discovery and tour guidance. You may withdraw this consent at any time.</p>

                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>4.6 Device, Technical and Usage Data</h3>
                <p>We automatically collect IP addresses, device identifiers, browser types, and usage patterns for analytics and fraud prevention.</p>
              </section>

              <section id="processing-purposes">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>5. Purposes for Which We Process Your Data</h2>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li>To operate, authenticate, and maintain your account;</li>
                  <li>To facilitate bookings and communications between Guests, Hosts, and Hommis;</li>
                  <li>To verify identities and perform background checks;</li>
                  <li>To assist Hosts in obtaining regulatory registrations and approvals;</li>
                  <li>To process payments, payouts, and taxes;</li>
                  <li>To provide customer support and resolve disputes;</li>
                  <li>To detect, prevent, and investigate illegal or harmful activities;</li>
                  <li>To comply with applicable laws and regulatory requests.</li>
                </ul>
              </section>

              <section id="legal-basis">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>6. Legal Basis for Processing</h2>
                <p>In accordance with the DPDP Act, we process your personal data on one or more of the following legal bases: Consent, Performance of Contract, Legitimate Uses (Section 7 of the DPDP Act), and Legal Obligations.</p>
              </section>

              <section id="data-sharing">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>7. Sharing and Disclosure of Your Personal Data</h2>
                <p>famlo does not sell your personal data. We share it with:</p>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li>Hosts, Guests, and Hommis to facilitate bookings;</li>
                  <li>Payment Service Providers (Razorpay);</li>
                  <li>Service Providers and Technology Vendors;</li>
                  <li>Government and Law-Enforcement Authorities (when required by law);</li>
                  <li>Professional Advisors (auditors, lawyers).</li>
                </ul>
              </section>

              <section id="retention">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>8. Data Retention</h2>
                <p>We retain data only as long as necessary. Financial and KYC records may be retained for 7-8 years to comply with Indian taxation and AML laws.</p>
              </section>

              <section id="rights">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>9. Your Rights as a Data Principal</h2>
                <p>Under the DPDP Act, you have the right to: Access your data summary, request Correction/Erasure, seek Grievance Redressal, Nominate an individual, and Withdraw Consent.</p>
              </section>

              <section id="children">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>10. Children’s Personal Data</h2>
                <p>The Platform is not intended for individuals under 18. We do not knowingly collect data from children without verifiable parental consent.</p>
              </section>

              <section id="marketing">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>11. Marketing and Promotional Communications</h2>
                <p>You may opt out of marketing emails at any time. We will still send transactional emails related to your bookings.</p>
              </section>

              <section id="cookies">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>12. Cookies and Similar Technologies</h2>
                <p>We use cookies for essential functionality, performance analytics, and marketing. You can manage preferences via your browser settings.</p>
              </section>

              <section id="security">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>13. Data Security</h2>
                <p>We implement industry-standard safeguards including TLS encryption, data-at-rest encryption, and regular security audits.</p>
              </section>

              <section id="third-party">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>14. Third-Party Links and Integrations</h2>
                <p>This policy does not apply to third-party sites linked from our Platform. Please review their policies separately.</p>
              </section>

              <section id="location-transfers">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>15. Data Storage Location and Cross-Border Transfers</h2>
                <p>Currently, all data is stored on servers within India. We do not transfer personal data outside India.</p>
              </section>

              <section id="changes">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>16. Changes to this Policy</h2>
                <p>We may update this policy periodically. material changes will be notified via email or in-app notice.</p>
              </section>

              <section id="contact">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>17. Contact Us</h2>
                <p>Email: hello@famlo.in | Registered Office: TISC IIT Jodhpur</p>
              </section>

              <section id="grievance">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>18. Grievance Officer</h2>
                <p><strong>Name:</strong> Aryan Krishan (Founder)</p>
                <p><strong>Email:</strong> aryan@famlo.in</p>
                <p><strong>Address:</strong> TISC IIT Jodhpur</p>
              </section>

              <section id="governing-law">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>19. Governing Law and Jurisdiction</h2>
                <p>This Policy is governed by Indian law. Disputes are subject to the exclusive jurisdiction of courts at Hisar, Haryana, India.</p>
              </section>

              <section id="acknowledgement">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>20. Acknowledgement and Consent</h2>
                <p>By using the Platform, you acknowledge that you have read and consent to this Privacy Policy.</p>
              </section>
            </>
          ) : (
            <>
              <section>
                <p style={{ fontWeight: 600, color: "#0F172A" }}>WELCOME TO FAMLO</p>
                <p>
                  These Terms and Conditions govern your use of the Famlo platform and services. By accessing or using Famlo, you agree to be bound by these Terms. Please read them carefully.
                </p>
              </section>

              <section id="terms-definitions">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>1. DEFINITIONS AND INTERPRETATION</h2>
                <ul style={{ display: "grid", gap: "12px", paddingLeft: "20px" }}>
                  <li><strong>"Famlo," "we," "us," or "our"</strong> refers to the Famlo platform and service.</li>
                  <li><strong>"User," "you," or "your"</strong> refers to any person accessing or using the platform.</li>
                  <li><strong>"Host"</strong> refers to users who list homestay properties on the platform.</li>
                  <li><strong>"Guest"</strong> refers to users who book homestay accommodations through the platform.</li>
                  <li><strong>"Listing"</strong> refers to a homestay property advertised on the platform.</li>
                  <li><strong>"Services"</strong> refers to all features, tools, and functionality provided by Famlo.</li>
                </ul>
              </section>

              <section id="terms-acceptance">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>2. ACCEPTANCE OF TERMS</h2>
                <p>
                  By creating an account, accessing, or using the Famlo platform, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. If you do not agree to these Terms, you must not use the platform.
                </p>
                <p>These Terms constitute a legally binding agreement between you and Famlo.</p>
              </section>

              <section id="terms-description">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>3. PLATFORM DESCRIPTION</h2>
                <p>Famlo is an online marketplace that connects Hosts who wish to offer homestay accommodations with Guests seeking such accommodations in India. Famlo provides:</p>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li>A platform for Hosts to create and manage property listings</li>
                  <li>A dashboard for Hosts to track bookings and payments</li>
                  <li>Payment processing services for transactions between Hosts and Guests</li>
                  <li>A booking management system</li>
                  <li>A review and rating system for both Hosts and Guests</li>
                </ul>
                <div style={{ marginTop: "16px", padding: "16px", background: "#F8FAFC", borderRadius: "8px", borderLeft: "4px solid #1A56DB" }}>
                  <p style={{ margin: 0 }}><strong>IMPORTANT:</strong> Famlo acts solely as an intermediary platform. We do not own, operate, manage, or control any listings. We are not a party to the agreements entered into between Hosts and Guests. The actual homestay experience is provided by independent Hosts.</p>
                </div>
              </section>

              <section id="terms-eligibility">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>4. USER ELIGIBILITY</h2>
                <p>To use the Famlo platform, you must:</p>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li>Be at least 18 years of age</li>
                  <li>Have the legal capacity to enter into binding contracts</li>
                  <li>Provide accurate, current, and complete information during registration</li>
                  <li>Comply with all applicable laws and regulations in India</li>
                </ul>
                <p>If you are registering on behalf of a business entity, you represent that you have the authority to bind that entity to these Terms.</p>
              </section>

              <section id="terms-accounts">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>5. USER ACCOUNTS</h2>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "20px", marginBottom: "12px" }}>5.1 Account Creation</h3>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li>Provide accurate and truthful information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Notify us immediately of any unauthorized use of your account</li>
                  <li>Accept responsibility for all activities conducted through your account</li>
                </ul>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>5.2 Account Verification</h3>
                <p>Famlo reserves the right to verify user information at any time. Hosts will be verified by Famlo before their listings are activated. Guests will be verified by Hosts at the time of check-in. Failure to provide accurate information may result in account suspension.</p>
              </section>

              <section id="terms-host-obligations">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>6. HOST OBLIGATIONS AND RESPONSIBILITIES</h2>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "20px", marginBottom: "12px" }}>6.1 Listing Requirements</h3>
                <p>Hosts must provide accurate property info, use genuine photos, describe amenities truthfully, keep calendars current, and respond promptly to inquiries.</p>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>6.2 Legal Compliance</h3>
                <p>Hosts must comply with local laws, obtain necessary permits, fulfill tax obligations, and ensure property safety.</p>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>6.3 Guest Relations</h3>
                <p>Hosts must honor bookings, provide described accommodations, verify Guest identity, and treat Guests professionally.</p>
              </section>

              <section id="terms-guest-bookings">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>7. GUEST BOOKINGS AND RESPONSIBILITIES</h2>
                <p>When booking, Guests enter a binding agreement with the Host, agree to pay total fees, comply with house rules, and provide ID at check-in.</p>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>7.2 Guest Conduct</h3>
                <p>Guests must treat property with respect, leave it in good condition, follow house rules, and report damages immediately.</p>
              </section>

              <section id="terms-commission">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>8. COMMISSION STRUCTURE AND FEES</h2>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "20px", marginBottom: "12px" }}>8.1 Host Commission</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
                  <thead>
                    <tr style={{ background: "#F1F5F9" }}>
                      <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #E2E8F0" }}>Tier</th>
                      <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #E2E8F0" }}>Bookings</th>
                      <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #E2E8F0" }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>Tier 1</td><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>1 - 50</td><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>18%</td></tr>
                    <tr><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>Tier 2</td><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>51 - 100</td><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>15%</td></tr>
                    <tr><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>Tier 3</td><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>101+</td><td style={{ padding: "12px", borderBottom: "1px solid #E2E8F0" }}>12%</td></tr>
                  </tbody>
                </table>
                <p>Commission is deducted before release of funds to the Host. Service fees for Guests may be introduced in the future.</p>
              </section>

              <section id="terms-payments">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>9. PAYMENT PROCESSING</h2>
                <p>Guests pay full booking amount upfront. Famlo holds funds in escrow until check-in. All payments must be made through the platform; direct payments are prohibited.</p>
              </section>

              <section id="terms-cancellation">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>10. CANCELLATION AND REFUND POLICY</h2>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "20px", marginBottom: "12px" }}>10.1 Guest Cancellations</h3>
                <ul style={{ display: "grid", gap: "8px", paddingLeft: "20px" }}>
                  <li><strong>24h+ before check-in:</strong> Full refund.</li>
                  <li><strong>Less than 24h:</strong> Deductions apply for service and preparation.</li>
                </ul>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "24px", marginBottom: "12px" }}>10.2 Host Cancellations</h3>
                <p>Guests receive full refund; Hosts may face penalties. Extenuating circumstances are handled at Famlo's discretion.</p>
              </section>

              <section id="terms-reviews">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>11. REVIEWS AND RATINGS</h2>
                <p>Users may review each other after stays. Reviews must be truthful, non-offensive, and comply with policies. Famlo may moderate content.</p>
              </section>

              <section id="terms-verification">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>12. VERIFICATION AND IDENTITY</h2>
                <p>Hosts must complete verification before activation. Guests must verify identity with the Host at check-in.</p>
              </section>

              <section id="terms-prohibited">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>13. PROHIBITED CONDUCT</h2>
                <p>Prohibited actions include illegal use, fraud, bypassing the platform, discrimination, harassment, scraping, or spreading malware.</p>
              </section>

              <section id="terms-liability">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>14. LIABILITY AND DISCLAIMERS</h2>
                <p>Famlo is an intermediary platform and is not a party to rental agreements. Services are provided "AS IS" without warranties.</p>
                <p style={{ padding: "16px", background: "#FEF2F2", borderRadius: "8px", borderLeft: "4px solid #EF4444" }}>
                  <strong>LIMITATION:</strong> Famlo is not liable for injury, property damage, or disputes between users. Users use the platform at their own risk.
                </p>
              </section>

              <section id="terms-disputes">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>15. DISPUTE RESOLUTION</h2>
                <p>Users should first attempt direct resolution. Famlo may provide voluntary mediation services. Legal action is subject to Section 17.</p>
              </section>

              <section id="terms-ip">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>16. INTELLECTUAL PROPERTY RIGHTS</h2>
                <p>Famlo owns its platform IP. By posting content, users grant Famlo a license to use it for platform operations and marketing.</p>
              </section>

              <section id="terms-law">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>17. GOVERNING LAW AND JURISDICTION</h2>
                <p>Governed by laws of India. Disputes are subject to exclusive jurisdiction of courts at Hisar, Haryana, India.</p>
              </section>

              <section id="terms-privacy-ref">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>18. PRIVACY AND DATA PROTECTION</h2>
                <p>Governed by our Privacy Policy and applicable Indian laws (IT Act 2000).</p>
              </section>

              <section id="terms-termination">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>19. TERMINATION</h2>
                <p>Users may terminate accounts anytime. Famlo may terminate for violations, illegal activities, or legal requirements.</p>
              </section>

              <section id="terms-changes">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>20. CHANGES TO TERMS</h2>
                <p>Famlo may modify terms anytime with notice of material changes. Continued use constitutes acceptance.</p>
              </section>

              <section id="terms-misc">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>21. MISCELLANEOUS PROVISIONS</h2>
                <p>Includes entire agreement, severability, waiver, assignment, and force majeure clauses.</p>
              </section>

              <section id="terms-contact-final">
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>22. CONTACT INFORMATION</h2>
                <div style={{ display: "grid", gap: "8px" }}>
                  <p><strong>Email:</strong> Hello@famlo.in</p>
                  <p><strong>Phone:</strong> +91 74044 77395</p>
                  <p><strong>Address:</strong> TISC IIT Jodhpur</p>
                </div>
              </section>

              <section id="legal-notice" style={{ marginTop: "40px", padding: "24px", background: "#FFFBEB", borderRadius: "16px", border: "1px solid #FEF3C7", display: "flex", gap: "16px" }}>
                <div style={{ color: "#D97706" }}><Info size={24} /></div>
                <div>
                  <h4 style={{ margin: "0 0 8px", color: "#92400E", fontSize: "1rem", fontWeight: 800 }}>Important Legal Notice</h4>
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "#92400E", lineHeight: 1.5 }}>
                    These Terms and Conditions are a template. As your business grows, it is strongly recommended to consult with a qualified attorney to customize these terms and ensure full compliance with all evolving Indian laws and regulations.
                  </p>
                </div>
              </section>
            </>
          )}

        </div>
        
        <div style={{ marginTop: "64px", paddingTop: "40px", borderTop: "1px solid #E2E8F0", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "#64748B", fontWeight: 600 }}>
            &copy; {new Date().getFullYear()} famlo. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
