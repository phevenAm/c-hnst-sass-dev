import { Link } from "react-router-dom";

import NewTabLink from "../../../components/shared/NewTabLink/NewTabLink";

import styles from "./SecurityPage.module.scss";

export default function SecurityPage() {
  return (
    <div className="page">
      <div className={`inner ${styles.container}`}>
        <h1>Security</h1>
        <p className={styles.updated}>Last updated: 24 August 2026</p>

        <p className={styles.intro}>
          Clarity holds sensitive client information on behalf of counsellors and therapists. Here's what we do to
          protect it.
        </p>

        <section>
          <h2>Client-side note encryption</h2>
          <p>
            Practitioners can turn on client-side encryption for session notes from their account. When it's on, notes
            are encrypted in your browser before they're ever sent to our servers — Clarity does not hold the decryption
            key and cannot read the content of encrypted notes. The unlock code is generated only for you; if it's lost,
            there is no way for us to recover access to notes encrypted under it.
          </p>
          <p>
            Encryption is opt-in rather than switched on by default, so it doesn't get in the way of practitioners who
            want quick access from any device without managing a passphrase. An encryption status indicator is shown in
            your admin bar at all times so it's always clear whether it's on. Private client journal entries,
            separately, are always encrypted client-side — neither Clarity nor the practitioner can read them.
          </p>
        </section>

        <section>
          <h2>Access controls</h2>
          <p>
            Every table in our database is protected by row-level security (RLS) policies enforced at the database
            layer, not just in application code. Practitioners can only see their own clients' data; clients can only
            see their own records. Demo accounts run under a separate, explicitly scoped set of read-only policies so
            demo data can never mix with real practice data.
          </p>
        </section>

        <section>
          <h2>Infrastructure</h2>
          <p>
            Clarity is built on Supabase (database, authentication, storage) and hosted on Netlify. Payments are
            processed by Stripe — we never see or store card details directly. A full list of the third parties that
            process data on our behalf, and why, is published on our{" "}
            <Link to="/legal/subprocessors">subprocessors page</Link>.
          </p>
        </section>

        <section>
          <h2>Accountability</h2>
          <p>
            Actions taken on client and practice data are recorded in an audit log, giving practitioners a record of who
            did what and when within their own practice.
          </p>
        </section>

        <section>
          <h2>Reporting a security issue</h2>
          <p>
            If you believe you've found a security vulnerability in Clarity, please email us at{" "}
            <a href="mailto:support@withclarity.uk">support@withclarity.uk</a> with details. We ask that you give us a
            reasonable amount of time to investigate and address any issue before disclosing it publicly.
          </p>
        </section>

        <p className={styles.contact}>
          See also our <NewTabLink href="/privacy">Privacy Policy</NewTabLink>,{" "}
          <NewTabLink href="/terms">Terms of Service</NewTabLink>, and{" "}
          <NewTabLink href="/legal/subprocessors">Subprocessors</NewTabLink>.
        </p>
      </div>
    </div>
  );
}
