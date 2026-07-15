"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-inner">
        <div className="footer-brand">
          <span className="footer-logo">Famlo</span>
          <p className="footer-tagline">Cultural stays and local connections. Live like local.</p>
        </div>
        
        <div className="footer-links-grid">
          <div className="link-col">
            <h4>Platform</h4>
            <Link href="/homestays">Stays</Link>
            <Link href="/joinfamlo">Become a Partner</Link>
            <Link href="/joinfamlo">Join Famlo</Link>
          </div>
          <div className="link-col">
            <h4>Company</h4>
            <Link href="/about">Our Story</Link>
            <Link href="/trust">Trust & Safety</Link>
            <Link href="/careers">Careers</Link>
          </div>
          <div className="link-col">
            <h4>Support</h4>
            <Link href="/help">Help Center</Link>
            <Link href="/contact">Contact Us</Link>
            <Link href="/legal">Privacy & Terms</Link>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .footer {
          background: var(--text-primary);
          color: #FFFFFF;
          padding: 80px 0;
          margin-top: 120px;
        }

        .footer-inner {
          display: grid;
          grid-template-columns: 1.5fr 3fr;
          gap: 60px;
          padding-bottom: 60px;
        }

        @media (max-width: 768px) {
          .footer-inner {
            grid-template-columns: 1fr;
            gap: 40px;
          }
        }

        .footer-logo {
          font-family: var(--font-display);
          font-size: 32px;
          display: block;
          margin-bottom: 16px;
        }

        .footer-tagline {
          color: rgba(255, 255, 255, 0.6);
          font-size: 16px;
          max-width: 300px;
        }

        .footer-links-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 40px;
        }

        .link-col h4 {
          color: #FFFFFF;
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 24px;
        }

        .link-col a {
          display: block;
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          margin-bottom: 12px;
          font-size: 15px;
          transition: color 200ms ease;
        }

        .link-col a:hover {
          color: var(--accent-primary);
        }

      `}</style>
    </footer>
  );
}
