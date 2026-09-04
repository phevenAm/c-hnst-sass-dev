import { Link } from "react-router-dom";

import { COVERAGE } from "./devCoverageData";

import styles from "./DevCoveragePage.module.scss";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function DevCoveragePage() {
  const totalUnit = COVERAGE.reduce((sum, e) => sum + (e.unit?.reduce((s, t) => s + t.count, 0) ?? 0), 0);
  const totalE2e = COVERAGE.reduce((sum, e) => sum + (e.e2e?.reduce((s, t) => s + t.count, 0) ?? 0), 0);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Test coverage</h1>
          <p className={styles.subtitle}>
            Hand-maintained — one entry per feature that's actually been tested, with what's still a gap stated plainly.
            Not a coverage-tool report; nobody automated this.
          </p>
        </div>
        <Link to="/superadmin" className={styles.backLink}>
          ← Superadmin
        </Link>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{COVERAGE.length}</span>
          <span className={styles.statLabel}>features catalogued</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{totalUnit}</span>
          <span className={styles.statLabel}>unit tests</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{totalE2e}</span>
          <span className={styles.statLabel}>e2e tests (real DB)</span>
        </div>
      </div>

      <div className={styles.entries}>
        {COVERAGE.map((entry) => (
          <article key={entry.id} className={styles.card}>
            <header className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{entry.title}</h2>
              <span className={styles.verifiedAt}>Last verified {fmtDate(entry.verifiedAt)}</span>
            </header>
            <p className={styles.summary}>{entry.summary}</p>

            {entry.backend && entry.backend.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Backend</h3>
                <ul className={styles.list}>
                  {entry.backend.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
            )}

            {(entry.unit?.length || entry.e2e?.length) && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Tests</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>File</th>
                      <th># tests</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.unit?.map((t) => (
                      <tr key={t.file}>
                        <td>
                          <span className={styles.pillUnit}>unit</span>
                        </td>
                        <td className={styles.fileCell}>{t.file}</td>
                        <td>{t.count}</td>
                        <td className={styles.noteCell}>{t.note ?? ""}</td>
                      </tr>
                    ))}
                    {entry.e2e?.map((t) => (
                      <tr key={t.file}>
                        <td>
                          <span className={styles.pillE2e}>e2e</span>
                        </td>
                        <td className={styles.fileCell}>{t.file}</td>
                        <td>{t.count}</td>
                        <td className={styles.noteCell}>{t.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {entry.verification && entry.verification.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>How this was verified</h3>
                <ul className={styles.list}>
                  {entry.verification.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </section>
            )}

            {entry.gaps && entry.gaps.length > 0 && (
              <section className={`${styles.section} ${styles.gaps}`}>
                <h3 className={styles.sectionTitle}>Known gaps</h3>
                <ul className={styles.list}>
                  {entry.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
