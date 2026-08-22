import { useEffect, useState } from "react";

import dayjs from "dayjs";

import { ageInYears, computeRcadsResult, type Gender, type RcadsResult } from "@/Helpers/rcadsScoring";
import { supabase } from "@/lib/supabase";

import styles from "./RcadsResultsCard.module.scss";

type RcadsRow = {
  id: string;
  date_of_birth: string;
  gender: Gender;
  answers: (number | null)[];
  submitted_at: string;
};

function bandClass(band: RcadsResult["totalRcads"]["band"]): string {
  if (band === "clinical") return styles.clinical;
  if (band === "borderline") return styles.borderline;
  return styles.normal;
}

function bandLabel(band: RcadsResult["totalRcads"]["band"]): string {
  if (band === "clinical") return "Clinical";
  if (band === "borderline") return "Borderline";
  return "Normal";
}

/** Renders inside the "View details" modal shared with every other assigned
 * form — RCADS just needs its own content there since its scoring doesn't
 * fit the generic response table (see rcadsScoring.ts). */
export default function RcadsResultsCard({ clientId }: { clientId: string }) {
  const [row, setRow] = useState<RcadsRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("rcads_assessments")
      .select("id, date_of_birth, gender, answers, submitted_at")
      .eq("client_id", clientId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setRow(data as RcadsRow | null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) return <p className={styles.empty}>Loading…</p>;
  if (!row || !Array.isArray(row.answers) || row.answers.length !== 47) {
    return <p className={styles.empty}>No responses yet.</p>;
  }

  const result = computeRcadsResult(row.answers, row.date_of_birth, row.gender, row.submitted_at);
  const age = ageInYears(row.date_of_birth, row.submitted_at);
  const rows = [...result.subscales, result.totalAnxiety, result.totalRcads];

  return (
    <div className={styles.wrap}>
      <span className={styles.meta}>
        Submitted {dayjs(row.submitted_at).format("D MMM YYYY")} · age {age} · {row.gender}
      </span>

      <ul className={styles.rowList}>
        {rows.map((r) => {
          const isTotal = r.key === "totalAnxiety" || r.key === "totalRcads";
          return (
            <li key={r.key} className={`${styles.row} ${bandClass(r.band)} ${isTotal ? styles.rowTotal : ""}`}>
              <span className={styles.rowLabel}>{r.label}</span>
              <span className={styles.rowRaw}>{r.raw ?? "—"} raw</span>
              <span className={styles.rowT}>
                <strong>{r.tScoreDisplay}</strong>
                {r.band && <span className={styles.rowBandLabel}>{bandLabel(r.band)}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <p className={styles.legend}>
        <span className={`${styles.dot} ${styles.borderline}`} /> T ≥ 65 borderline
        <span className={`${styles.dot} ${styles.clinical}`} /> T ≥ 70 clinical
      </p>
    </div>
  );
}
