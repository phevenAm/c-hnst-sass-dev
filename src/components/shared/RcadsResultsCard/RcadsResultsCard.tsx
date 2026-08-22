import { useEffect, useState } from "react";

import dayjs from "dayjs";

import Card from "@components/shared/Card/Card";

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

  if (loading) return null;
  if (!row || !Array.isArray(row.answers) || row.answers.length !== 47) return null;

  const result = computeRcadsResult(row.answers, row.date_of_birth, row.gender, row.submitted_at);
  const age = ageInYears(row.date_of_birth, row.submitted_at);

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <h2>RCADS assessment</h2>
        <span className={styles.meta}>
          {dayjs(row.submitted_at).format("D MMM YYYY")} · age {age} · {row.gender}
        </span>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Scale</th>
            <th>Raw</th>
            <th>T-score</th>
          </tr>
        </thead>
        <tbody>
          {result.subscales.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td>{s.raw ?? "—"}</td>
              <td>
                <span className={`${styles.tPill} ${bandClass(s.band)}`}>{s.tScoreDisplay}</span>
              </td>
            </tr>
          ))}
          <tr className={styles.totalRow}>
            <td>Total Anxiety</td>
            <td>{result.totalAnxiety.raw ?? "—"}</td>
            <td>
              <span className={`${styles.tPill} ${bandClass(result.totalAnxiety.band)}`}>
                {result.totalAnxiety.tScoreDisplay}
              </span>
            </td>
          </tr>
          <tr className={styles.totalRow}>
            <td>Total RCADS</td>
            <td>{result.totalRcads.raw ?? "—"}</td>
            <td>
              <span className={`${styles.tPill} ${bandClass(result.totalRcads.band)}`}>
                {result.totalRcads.tScoreDisplay}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p className={styles.legend}>
        <span className={`${styles.dot} ${styles.borderline}`} /> T ≥ 65 borderline
        <span className={`${styles.dot} ${styles.clinical}`} /> T ≥ 70 clinical
      </p>
    </Card>
  );
}
