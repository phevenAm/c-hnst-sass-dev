import styles from "./SubprocessorsPage.module.scss";

export default function SubprocessorsPage() {
  return (
    <div className="page">
      <div className={`inner ${styles.container}`}>
        <h1>Subprocessors</h1>
        <p className={styles.updated}>Last updated: 24 August 2026</p>

        <p>
          These are the third-party companies ("subprocessors") that Clarity uses to deliver its service and that
          may process personal data on our behalf.
        </p>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Subprocessor</th>
                <th>Purpose</th>
                <th>Data received</th>
                <th>Location</th>
                <th>International transfer safeguard</th>
                <th>DPA / Privacy</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Supabase</td>
                <td>Database, authentication, file storage, edge functions</td>
                <td>All personal data; session notes (optionally encrypted); form and check-in responses</td>
                <td>[TODO: confirm Supabase project region — Project Settings → Infrastructure. Must be EU region for UK GDPR compliance without extra safeguards]</td>
                <td>IDTA (if US region) / not required (if EU region)</td>
                <td>
                  <a href="https://supabase.com/legal/dpa" target="_blank" rel="noopener noreferrer">DPA</a> ·{" "}
                  <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
                </td>
              </tr>
              <tr>
                <td>Resend</td>
                <td>Transactional email delivery</td>
                <td>Recipient name and email; session dates and times; appointment details</td>
                <td>United States</td>
                <td>UK IDTA / Resend DPA</td>
                <td>
                  <a href="https://resend.com/legal/dpa" target="_blank" rel="noopener noreferrer">DPA</a> ·{" "}
                  <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy</a>
                </td>
              </tr>
              <tr>
                <td>Stripe</td>
                <td>Subscription billing and payment processing</td>
                <td>Practitioner name and email; subscription status</td>
                <td>United States</td>
                <td>EU–US Data Privacy Framework</td>
                <td>
                  <a href="https://stripe.com/legal/dpa" target="_blank" rel="noopener noreferrer">DPA</a> ·{" "}
                  <a href="https://stripe.com/gb/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
                </td>
              </tr>
              <tr>
                <td>Netlify</td>
                <td>Frontend hosting and CDN</td>
                <td>HTTP access logs (IP address, browser, timestamp)</td>
                <td>[TODO: confirm Netlify region/edge configuration]</td>
                <td>UK IDTA / Netlify DPA</td>
                <td>
                  <a href="https://www.netlify.com/legal/data-processing-agreement/" target="_blank" rel="noopener noreferrer">DPA</a> ·{" "}
                  <a href="https://www.netlify.com/privacy/" target="_blank" rel="noopener noreferrer">Privacy</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section>
          <h2>International transfers</h2>
          <p>
            Where a subprocessor is based in the US, personal data transfers from the UK are covered by the{" "}
            <strong>UK International Data Transfer Agreement (IDTA)</strong> or, where applicable, the{" "}
            <strong>EU–US Data Privacy Framework</strong>. Each subprocessor maintains a Data Processing Agreement
            documenting these safeguards.
          </p>
          <p>
            <strong>Important:</strong> Clarity's database is hosted by Supabase. If the Supabase project region is
            outside the EU/EEA, all personal data (including any encrypted session notes) is transferred to the US.
            [TODO: verify region in Supabase dashboard and update this page before publishing.]
          </p>
        </section>

        <section>
          <h2>Updates</h2>
          <p>
            We will update this list when we add or remove subprocessors. We will provide reasonable advance notice
            to practitioners of any material changes.
          </p>
        </section>

        <p className={styles.contact}>
          Questions? Contact us at <a href="mailto:hello@clarity.app">hello@clarity.app</a>
        </p>
      </div>
    </div>
  );
}
