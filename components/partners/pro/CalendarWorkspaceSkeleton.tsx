"use client";

import type { ReactElement } from "react";

import styles from "./pro-dashboard.module.css";

export default function CalendarWorkspaceSkeleton(): ReactElement {
  return (
    <div className={styles.calendarWorkspaceStateCard} aria-hidden="true">
      <div className={styles.calendarWorkspaceSkeletonHeader}>
        <div className={styles.calendarWorkspaceSkeletonBadge} />
        <div className={styles.calendarWorkspaceSkeletonTitle} />
      </div>
      <div className={styles.calendarWorkspaceSkeletonGrid}>
        {Array.from({ length: 18 }, (_, index) => (
          <div key={index} className={styles.calendarWorkspaceSkeletonCell} />
        ))}
      </div>
    </div>
  );
}
