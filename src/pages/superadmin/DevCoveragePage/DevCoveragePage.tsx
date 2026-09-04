import { Link } from "react-router-dom";

import { ALL_TEST_FILES, COVERAGE, SUITE_SUMMARY } from "./devCoverageData";

import styles from "./DevCoveragePage.module.scss";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function DevCoveragePage() {
  const unitFiles = ALL_TEST_FILES.filter((f) => f.kind === "unit");
  const e2eFiles = ALL_TEST_FILES.filter((f) => f.kind === "e2e");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Test coverage</h1>
          <p className={styles.subtitle}>
            Hand-maintained. Two different strengths of claim live here, kept visually apart: whole-suite counts below
            say only "this exists and was green on the date shown" — the deep-dive cards further down say what was
            actually verified beyond that.
          </p>
        </div>
        <Link to="/superadmin" className={styles.backLink}>
          ← Superadmin
        </Link>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{SUITE_SUMMARY.unit.testsPassed}</span>
          <span className={styles.statLabel}>unit tests passing</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{unitFiles.length}</span>
          <span className={styles.statLabel}>unit test files</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{SUITE_SUMMARY.e2e.tests}</span>
          <span className={styles.statLabel}>e2e tests (real DB)</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{e2eFiles.length}</span>
          <span className={styles.statLabel}>e2e spec files</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{COVERAGE.length}</span>
          <span className={styles.statLabel}>deep-dive write-ups</span>
        </div>
      </div>

      <div className={styles.suiteNote}>
        <p>
          Unit: <code>{SUITE_SUMMARY.unit.command}</code> — {SUITE_SUMMARY.unit.testsPassed} passed,{" "}
          {SUITE_SUMMARY.unit.testsTodo} todo, {SUITE_SUMMARY.unit.filesPassed} files passed /{" "}
          {SUITE_SUMMARY.unit.filesSkipped} skipped. Ran {fmtDate(SUITE_SUMMARY.unit.ranAt)}.
        </p>
        <p>
          E2E: {SUITE_SUMMARY.e2e.note} Counted {fmtDate(SUITE_SUMMARY.e2e.ranAt)}.
        </p>
      </div>

      <h2 className={styles.groupHeading}>Deep-dive write-ups</h2>
      <div className={styles.entries}>
        {COVERAGE.map((entry) => (
          <article key={entry.id} className={styles.card}>
            <header className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>{entry.title}</h3>
              <span className={styles.verifiedAt}>Last verified {fmtDate(entry.verifiedAt)}</span>
            </header>
            <p className={styles.summary}>{entry.summary}</p>

            {entry.backend && entry.backend.length > 0 && (
              <section className={styles.section}>
                <h4 className={styles.sectionTitle}>Backend</h4>
                <ul className={styles.list}>
                  {entry.backend.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
            )}

            {(entry.unit?.length || entry.e2e?.length) && (
              <section className={styles.section}>
                <h4 className={styles.sectionTitle}>Tests</h4>
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
                <h4 className={styles.sectionTitle}>How this was verified</h4>
                <ul className={styles.list}>
                  {entry.verification.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </section>
            )}

            {entry.gaps && entry.gaps.length > 0 && (
              <section className={`${styles.section} ${styles.gaps}`}>
                <h4 className={styles.sectionTitle}>Known gaps</h4>
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

      <h2 className={styles.groupHeading}>Full test inventory</h2>
      <p className={styles.groupSubheading}>
        Every test file in the repo, mechanically counted — not individually narrated like the write-ups above.
      </p>

      <details className={styles.inventory} open>
        <summary>Unit — {unitFiles.length} files</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>File</th>
              <th># tests</th>
            </tr>
          </thead>
          <tbody>
            {unitFiles.map((f) => (
              <tr key={f.file}>
                <td className={styles.fileCell}>{f.file}</td>
                <td>{f.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details className={styles.inventory}>
        <summary>E2E — {e2eFiles.length} files</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>File</th>
              <th># tests</th>
            </tr>
          </thead>
          <tbody>
            {e2eFiles.map((f) => (
              <tr key={f.file}>
                <td className={styles.fileCell}>{f.file}</td>
                <td>{f.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
