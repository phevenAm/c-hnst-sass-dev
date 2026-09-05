import NewTabLink from "../../../components/shared/NewTabLink/NewTabLink";

import styles from "./PrivacyPage.module.scss";

export default function PrivacyPage() {
  return (
    <div className="page">
      <div className={`inner ${styles.container}`}>
        <h1>Privacy Policy</h1>
        <p className={styles.updated}>Last updated: 4 September 2026</p>

        <section>
          <h2>1. Who we are</h2>
          <p>
            Clarity is operated by Clarity, a sole trader ("we", "us", "our"). Our business address is [Registered
            business address — TBD, pending forwarding address registration]. For privacy questions, contact us at{" "}
            <a href="mailto:hello@withclarity.uk">hello@withclarity.uk</a>.
          </p>
        </section>

        <section>
          <h2>2. What this policy covers</h2>
          <p>
            This policy explains how Clarity collects and uses personal data when you use the platform — either as a{" "}
            <strong>practitioner</strong> (a counsellor or therapist who manages a practice) or as a{" "}
            <strong>client</strong> (someone invited to the platform by their practitioner).
          </p>
          <p>
            <strong>Clarity and your practitioner.</strong> When you use Clarity as a client, your practitioner is the
            data controller of your clinical and session data. Clarity processes that data on their behalf as a data
            processor. Your practitioner's own privacy notice will apply to the clinical aspects of your care. This
            policy covers Clarity's processing as operator of the platform.
          </p>
        </section>

        <section>
          <h2>3. What data we collect and why</h2>

          <h3>3.1 Practitioners</h3>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Why we collect it</th>
                <th>Legal basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Name and email address</td>
                <td>Account creation, login, communications</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Date of birth</td>
                <td>Account verification</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Business / practice name</td>
                <td>Displaying your practice identity</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Counsellor display name</td>
                <td>Personalising client emails sent on your behalf</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Bank account details (if entered)</td>
                <td>Displaying payment information to clients</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Stripe customer and subscription ID</td>
                <td>Managing your subscription</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>CPD and supervision records</td>
                <td>Powering your professional development log</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Availability rules and calendar entries</td>
                <td>Powering the scheduling features</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Encryption key material (if you turn on note encryption)</td>
                <td>Protecting your session notes with optional client-side encryption</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Feedback and bug reports</td>
                <td>Improving the platform</td>
                <td>Legitimate interests</td>
              </tr>
            </tbody>
          </table>

          <h3>3.2 Clients</h3>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Why we collect it</th>
                <th>Legal basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Name and email address</td>
                <td>Account creation and login</td>
                <td>Contract performance (with your practitioner)</td>
              </tr>
              <tr>
                <td>Date of birth</td>
                <td>Age-gating for restricted materials</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Session records (date, time, location, duration, payment status)</td>
                <td>Showing you your appointments</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Session notes written by your practitioner</td>
                <td>Clinical record-keeping by your practitioner</td>
                <td>Art. 9(2)(h) — health care (your practitioner relies on this basis)</td>
              </tr>
              <tr>
                <td>Form and wellbeing check-in responses (outcome measures, feedback, onboarding)</td>
                <td>Outcome tracking by your practitioner</td>
                <td>Art. 9(2)(h) — health care</td>
              </tr>
              <tr>
                <td>Private journal entries</td>
                <td>Personal journalling — only you can read these</td>
                <td>Your consent</td>
              </tr>
              <tr>
                <td>Consent record</td>
                <td>Recording that you agreed to the terms of access</td>
                <td>Legal obligation / legitimate interests</td>
              </tr>
              <tr>
                <td>Unsubscribe preferences</td>
                <td>Honouring your email opt-outs</td>
                <td>Legal obligation (PECR)</td>
              </tr>
              <tr>
                <td>Notifications</td>
                <td>In-app alerts about your sessions</td>
                <td>Contract performance</td>
              </tr>
            </tbody>
          </table>

          <h3>3.3 All users</h3>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Why we collect it</th>
                <th>Legal basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Profile photo (if uploaded)</td>
                <td>Profile display</td>
                <td>Contract performance</td>
              </tr>
              <tr>
                <td>Session and authentication cookies</td>
                <td>Keeping you logged in securely</td>
                <td>Contract performance / legitimate interests</td>
              </tr>
              <tr>
                <td>Access logs (IP address, browser, timestamp)</td>
                <td>Security and debugging</td>
                <td>Legitimate interests</td>
              </tr>
              <tr>
                <td>Email delivery records</td>
                <td>Auditing that notifications were sent</td>
                <td>Legitimate interests</td>
              </tr>
              <tr>
                <td>Audit log of actions</td>
                <td>Accountability and fraud prevention</td>
                <td>Legitimate interests</td>
              </tr>
            </tbody>
          </table>

          <p>We do not collect payment card details directly — these are handled entirely by Stripe.</p>
        </section>

        <section>
          <h2>4. Special-category data</h2>
          <p>
            Session notes and form responses may constitute <strong>health data</strong> under Article 9 UK GDPR. This
            data is processed on behalf of your practitioner, who is the data controller for your clinical information.
            Your practitioner relies on Article 9(2)(h) (health care purposes under UK law) as the condition for
            processing this data. If you have questions about why your clinical data is held, please contact your
            practitioner directly.
          </p>
          <p>
            Practitioners can optionally turn on client-side encryption for session notes. Where a practitioner has
            enabled it, Clarity cannot read the content of those notes. Where it isn't enabled, notes are stored without
            that additional protection — see our <NewTabLink href="/security">Security page</NewTabLink> for details.
          </p>
          <p>
            Private journal entries are encrypted client-side. Neither Clarity nor your practitioner can read your
            journal.
          </p>
        </section>

        <section>
          <h2>5. How long we keep your data</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Active account data</td>
                <td>Held for the duration of the account</td>
              </tr>
              <tr>
                <td>Paused practitioner accounts</td>
                <td>Retained in full while paused (read-only); nothing is deleted until the account is deleted</td>
              </tr>
              <tr>
                <td>Deleted practitioner accounts</td>
                <td>
                  Erased immediately on deletion — the practitioner profile, practice settings, and all client records
                  in that practice (sessions, attendance, payments, session notes). No retention period. A full export
                  is offered to the practitioner immediately before deletion. Backups containing the data are
                  overwritten within 30 days.
                </td>
              </tr>
              <tr>
                <td>Deleted client accounts</td>
                <td>
                  Login and personal details (name, date of birth, contact details, photo) removed immediately. Session
                  history, attendance, payments and encrypted notes are kept by the practitioner as an{" "}
                  <strong>anonymised</strong> record (name replaced with a codename) in line with their clinical
                  record-keeping obligations (typically 8 years for adult records under NHS / professional body
                  guidance). This anonymised record is erased if the practitioner deletes their account.
                </td>
              </tr>
              <tr>
                <td>Billing records</td>
                <td>7 years (UK tax law) — held by our payment processor (Stripe), not in the deleted practice</td>
              </tr>
              <tr>
                <td>Email delivery logs</td>
                <td>90 days</td>
              </tr>
              <tr>
                <td>Audit logs</td>
                <td>12 months</td>
              </tr>
              <tr>
                <td>Access / hosting logs</td>
                <td>Up to 30 days (managed by Netlify)</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>6. Who we share your data with</h2>
          <p>
            We share data only with the subprocessors listed at{" "}
            <NewTabLink href="/legal/subprocessors">Subprocessors</NewTabLink>. We do not sell your data.
          </p>
          <p>
            Where subprocessors are based outside the UK or EEA, transfers are covered by the UK International Data
            Transfer Agreement (IDTA) or equivalent safeguards — see the subprocessor list for details.
          </p>
        </section>

        <section>
          <h2>7. Your rights under UK GDPR</h2>
          <p>You have the right to:</p>
          <ul>
            <li>
              <strong>Access</strong> the personal data we hold about you (Article 15)
            </li>
            <li>
              <strong>Correct</strong> inaccurate data (Article 16)
            </li>
            <li>
              <strong>Delete</strong> your data, subject to our legal obligations to retain certain records (Article 17)
            </li>
            <li>
              <strong>Restrict</strong> processing in certain circumstances (Article 18)
            </li>
            <li>
              <strong>Data portability</strong> — receive a copy of your data in a machine-readable format (Article 20)
            </li>
            <li>
              <strong>Object</strong> to processing based on legitimate interests (Article 21)
            </li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:hello@withclarity.uk">hello@withclarity.uk</a>. We will respond within one calendar
            month.
          </p>
          <p>
            <strong>Note for clients:</strong> rights relating to your clinical records (session notes, form responses)
            should be exercised with your practitioner as the data controller for that data.
          </p>
          <p>
            You have the right to lodge a complaint with the <strong>Information Commissioner's Office (ICO)</strong> at{" "}
            <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">
              ico.org.uk
            </a>{" "}
            or by calling 0303 123 1113.
          </p>
        </section>

        <section>
          <h2>8. Cookies</h2>
          <p>
            We use essential cookies only — session and authentication cookies required to operate the service. We do
            not use tracking, advertising, or analytics cookies.
          </p>
        </section>

        <section>
          <h2>9. Profile photos</h2>
          <p>
            Profile photos are stored in publicly accessible storage. Do not upload a photo you do not wish to be
            publicly visible.
          </p>
        </section>

        <section>
          <h2>10. Changes to this policy</h2>
          <p>
            We will notify active users by email if we make material changes to this policy. The "last updated" date at
            the top reflects the most recent version. Continued use of the platform after a notified change constitutes
            acceptance.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            For any privacy-related questions: <a href="mailto:hello@withclarity.uk">hello@withclarity.uk</a>
          </p>
          <p>
            For complaints, you may also contact the ICO:{" "}
            <a href="https://ico.org.uk/make-a-complaint" target="_blank" rel="noopener noreferrer">
              ico.org.uk/make-a-complaint
            </a>
          </p>
        </section>

        <p className={styles.contact}>
          Questions? Contact us at <a href="mailto:hello@withclarity.uk">hello@withclarity.uk</a>
        </p>
      </div>
    </div>
  );
}
