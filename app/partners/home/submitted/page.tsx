// app/partners/home/submitted/page.tsx

import React from 'react';
import Link from 'next/link';
import { 
  CheckCircle2, 
  Mail, 
  ShieldCheck, 
  Clock, 
  Inbox,
  ArrowRight
} from 'lucide-react';
import styles from './submitted.module.css';

export default function SubmittedPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.successIcon}>
            <CheckCircle2 size={48} color="#10b981" />
          </div>
          
          <h1 className={styles.title}>Submission Complete!</h1>
          <p className={styles.subtitle}>
            Your heritage home application has been received and is now in our verification queue.
          </p>

          <div className={styles.infoBox}>
            <div className={styles.infoItem}>
              <div className={styles.infoIcon}><Clock size={20} /></div>
              <div className={styles.infoText}>
                <strong>What happens next?</strong>
                <p>Our team will manually review your details. This usually takes 24-48 hours.</p>
              </div>
            </div>

            <div className={styles.infoItem}>
              <div className={styles.infoIcon}><Mail size={20} /></div>
              <div className={styles.infoText}>
                <strong>Watch your Inbox</strong>
                <p>
                  Our team will get back to you at your registered email with your 
                  <strong> User ID and Password</strong>. Once received, you can log in to your dashboard.
                </p>
              </div>
            </div>

            <div className={styles.infoItem}>
              <div className={styles.infoIcon}><ShieldCheck size={20} /></div>
              <div className={styles.infoText}>
                <strong>Pro-tip: Check Spam</strong>
                <p>
                  Please check your email regularly, including the <strong>spam folder</strong>, 
                  to ensure you don&apos;t miss your credentials.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <Link href="/" className={styles.primaryBtn}>
              Back to Home <ArrowRight size={18} />
            </Link>
            <p className={styles.contactText}>
              Questions? Contact us at <a href="mailto:support@famlo.in">support@famlo.in</a>
            </p>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>© 2026 Famlo India. All rights reserved.</p>
      </footer>
    </div>
  );
}
