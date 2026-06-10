//app/joinfamlo/page.tsx

"use client";

import Link from "next/link";
import styles from "./joinfamlo.module.css";
import { Compass, Home } from "lucide-react";

export default function JoinFamloPage(): React.JSX.Element {
  return (
    <div className={styles.joinContainer}>
      <main className={styles.mainSection}>
        <div className={styles.selectionBox}>
          <div className={styles.selectionHeader}>
            <p className={styles.overline}>CHOOSE YOUR PATH</p>
            <h2 className={styles.title}>Join the Movement</h2>
          </div>

          <div className={styles.selectionGrid}>
            <Link href="/joinfamlo/homes" className={styles.selectionCard}>
              <div className={styles.iconFrame}><Home size={32} strokeWidth={1.5} /></div>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>Become a Home Host</h3>
                <p className={styles.cardDesc}>Open your home to verified guests and share your unique heritage.</p>
              </div>
              <div className={styles.cardAction}>
                <span>Get Started</span>
                <Compass size={16} />
              </div>
            </Link>

            <Link href="/partners/hommies" className={styles.selectionCard}>
              <div className={styles.iconFrame}><Compass size={32} strokeWidth={1.5} /></div>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>Become a City Friend</h3>
                <p className={styles.cardDesc}>Show guests the hidden gems of your city as a local expert guide.</p>
              </div>
              <div className={styles.cardAction}>
                <span>Get Started</span>
                <Compass size={16} />
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
