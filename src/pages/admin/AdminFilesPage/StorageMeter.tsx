import { formatBytes } from "@Helpers/fileTypes";
import type { StorageReport } from "@models/files";

import styles from "./AdminFilesPage.module.scss";

export default function StorageMeter({ report }: { report: StorageReport | null }) {
  if (!report) return null;
  const { used_bytes, quota_bytes, pool } = report;
  const pct = quota_bytes > 0 ? Math.min(100, (used_bytes / quota_bytes) * 100) : 0;
  let fillClass = "";
  if (pct >= 100) fillClass = styles.meterFillFull;
  else if (pct >= 85) fillClass = styles.meterFillWarn;

  return (
    <div className={styles.meter}>
      <div className={styles.meterRow}>
        <span>{pool === "agency" ? "Agency storage" : "Practice storage"}</span>
        <span>
          {formatBytes(used_bytes)} of {formatBytes(quota_bytes)} used
        </span>
      </div>
      <div className={styles.meterTrack}>
        <div
          className={`${styles.meterFill} ${fillClass}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Storage used"
        />
      </div>
    </div>
  );
}
