import { Link } from "react-router-dom";

import styles from "./TermsPage.module.scss";

export default function TermsPage() {
  return (
    <div className="page">
      <div className={`inner ${styles.container}`}>
        <h1>Terms of Service</h1>
        <p className={styles.updated}>Last updated: 24 August 2026</p>

        <section>
          <h2>1. About these terms</h2>
          <p>
            These Terms of Service ("Terms") govern your use of the Clarity platform ("Clarity", "the platform",
            "we", "us") operated by [Trading name — TBD], a sole trader. Our business address is [Registered
            business address — TBD, pending forwarding address registration].
          </p>
          <p>
            By creating an account or accessing the platform you agree to these Terms. If you do not agree, do not
            use the platform.
          </p>
          <p>
            For questions about these Terms, contact us at <a href="mailto:hello@Clarity.app">hello@Clarity.app</a>.
          </p>
        </section>

        <section>
          <h2>2. Definitions</h2>
          <ul>
            <li>
              <strong>Practitioner</strong> — a counsellor, therapist, or other registered professional who
              subscribes to Clarity and uses it to manage their practice.
            </li>
            <li>
              <strong>Client</strong> — a person invited to the platform by a Practitioner to access their client
              portal.
            </li>
            <li>
              <strong>Practice data</strong> — session records, notes, form and check-in responses, communications,
              and any other data a Practitioner creates or stores in relation to their clients.
            </li>
            <li>
              <strong>Platform</strong> — the Clarity web application and any associated services.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Who can use Clarity</h2>
          <h3>Practitioners</h3>
          <p>
            You must be a qualified and appropriately registered mental health or counselling professional (or
            operating under the supervision of one) to subscribe as a Practitioner. By creating a Practitioner
            account you confirm that you hold any professional registrations required to practise in your
            jurisdiction. You must be at least 18 years old.
          </p>
          <h3>Clients</h3>
          <p>
            Clients may only access the platform via an invitation from a Practitioner. By accepting an invitation
            you confirm you are at least 16 years old, or that your parent or guardian has given consent if you are
            between 13 and 16.
          </p>
        </section>

        <section>
          <h2>4. Accounts</h2>
          <p>
            You are responsible for keeping your login credentials secure. Do not share your account with anyone
            else. You must notify us immediately at <a href="mailto:hello@Clarity.app">hello@Clarity.app</a> if you
            suspect your account has been compromised. We may suspend or terminate accounts that show signs of
            unauthorised use.
          </p>
        </section>

        <section>
          <h2>5. Subscriptions and billing (Practitioners)</h2>
          <p>
            Clarity is offered on a subscription basis. Pricing is displayed on our website at the time of purchase.
            By subscribing you authorise us to charge the applicable fee to your payment method via Stripe on a
            recurring basis.
          </p>
          <p>
            Where a free trial is offered, your subscription will begin automatically at the end of the trial period
            unless you cancel beforehand.
          </p>
          <p>
            You may cancel your subscription at any time from your account settings. Cancellation takes effect at
            the end of your current billing period. We do not offer refunds for unused time within a billing period.
          </p>
          <p>We will give you at least 30 days' notice of any price increase by email. Continued use after the notice period constitutes acceptance of the new price.</p>
          <p>
            If a payment fails we will notify you by email and attempt to retry. If payment is not received within
            14 days of the original due date we may suspend access to your account until the outstanding amount is
            paid.
          </p>
        </section>

        <section>
          <h2>6. Acceptable use</h2>
          <p>You must not use the platform to:</p>
          <ul>
            <li>Store or process data you are not legally entitled to process</li>
            <li>Violate any applicable law, regulation, or professional code of conduct</li>
            <li>Attempt to access another user's account or data</li>
            <li>Upload malicious code, viruses, or anything that could damage the platform or its users</li>
            <li>Reverse-engineer, scrape, or copy the platform</li>
            <li>Use the platform in a way that places an unreasonable load on our infrastructure</li>
            <li>Impersonate any person or organisation</li>
          </ul>
        </section>

        <section>
          <h2>7. Data, privacy, and the controller/processor relationship</h2>
          <h3>7.1 Practitioner as data controller</h3>
          <p>
            When you use Clarity to store information about your clients, <strong>you are the data controller</strong>{" "}
            of that data under UK GDPR. You are responsible for having a valid lawful basis for processing your
            clients' personal data, providing your clients with your own privacy notice covering your clinical
            practice, complying with all applicable data protection law (including UK GDPR and the Data Protection
            Act 2018), holding any required Appropriate Policy Documents for processing special-category health data
            under DPA 2018 Schedule 1, and responding to data subject rights requests from your clients.
          </p>
          <h3>7.2 Clarity as data processor</h3>
          <p>
            Clarity processes your clients' data <strong>on your behalf</strong> and only in accordance with your
            instructions (as expressed through your use of the platform features) and these Terms. We do not use
            client data for any purpose other than delivering the platform to you.
          </p>
          <p>
            A Data Processing Agreement (DPA) between you and Clarity, as required by Article 28 UK GDPR, is set out
            at Schedule 1 below. By accepting these Terms you also accept the DPA.
          </p>
          <h3>7.3 Our own processing</h3>
          <p>
            We process your personal data (as a Practitioner) as a data controller for the purposes of operating
            your account, managing your subscription, and communicating with you. See our{" "}
            <Link to="/privacy">Privacy Policy</Link> for details.
          </p>
          <h3>7.4 Encryption</h3>
          <p>
            You can optionally turn on client-side encryption for session notes. Where you enable it, Clarity does
            not hold the decryption key and cannot read the content of your session notes.{" "}
            <strong>You are responsible for not losing access to your encryption passphrase.</strong> Loss of the
            passphrase may result in permanent loss of access to notes encrypted under it — we cannot recover them
            for you. Where you don't enable it, notes are stored without that additional protection. See our{" "}
            <Link to="/security">Security page</Link> for more detail.
          </p>
          <h3>7.5 Your data protection obligations</h3>
          <p>
            By using Clarity you warrant that you have a valid lawful basis under UK GDPR for each category of
            personal data you process through the platform. If you process health data (including session notes and
            wellbeing form results), you warrant that you have a valid Article 9(2) condition and, where required, a
            DPA 2018 Schedule 1 Appropriate Policy Document.
          </p>
        </section>

        <section>
          <h2>8. Client data and deletion</h2>
          <p>
            You may delete a client's Clarity account at any time from your admin dashboard. Deletion removes the
            client's login credentials and profile. Session records and any encrypted notes may be retained in your
            Clarity account in line with your professional record-keeping obligations.
          </p>
          <p>
            As a data controller, you are responsible for retaining clinical records for the period required by your
            professional body (typically 8 years for adult clients under BACP, UKCP, and similar guidance).
            Clarity's deletion tools do not override your legal obligations. Do not delete records you are required
            to retain.
          </p>
          <p>
            If you delete your Practitioner account, your account data and your clients' profiles will be deleted in
            accordance with our retention schedule (see our <Link to="/privacy">Privacy Policy</Link>). You should
            export any data you need to retain before deleting your account.
          </p>
        </section>

        <section>
          <h2>9. Security</h2>
          <p>
            We implement reasonable technical and organisational measures to protect the platform, including
            optional client-side encryption of session notes, row-level access controls, and authentication
            requirements — see our <Link to="/security">Security page</Link> for details. However, no online service
            is completely secure. You are responsible for maintaining the security of your account credentials and
            (if enabled) your encryption passphrase, ensuring your devices and networks are reasonably secure, and
            notifying us promptly if you become aware of a security issue.
          </p>
        </section>

        <section>
          <h2>10. Availability</h2>
          <p>
            We aim to keep Clarity available but do not guarantee uninterrupted service. We may take the platform
            offline for maintenance, updates, or for reasons beyond our control. We will endeavour to provide
            advance notice of planned downtime where practical. We do not offer a specific uptime SLA at this time.
          </p>
        </section>

        <section>
          <h2>11. Intellectual property</h2>
          <p>
            All software, design, and content forming part of the Clarity platform is owned by [Trading name — TBD]
            or licensed to us. Nothing in these Terms grants you any right to the platform's intellectual property
            other than the limited licence to use it as described here. You retain ownership of all data you input
            into the platform.
          </p>
        </section>

        <section>
          <h2>12. Limitation of liability</h2>
          <p>To the maximum extent permitted by law:</p>
          <ul>
            <li>We are not liable for any indirect, consequential, or incidental loss arising from your use of the platform</li>
            <li>Our total liability to you in any 12-month period is limited to the amount you paid us in subscription fees during that period</li>
            <li>We are not liable for loss of data caused by your loss of your encryption passphrase</li>
          </ul>
          <p>
            Nothing in these Terms limits our liability for death or personal injury caused by our negligence,
            fraud, or any other liability that cannot be excluded by law.
          </p>
          <p>
            <strong>Important:</strong> Clarity is a practice-management tool, not a clinical system. We are not
            liable for any harm to a client arising from clinical decisions, missed appointments, communication
            failures, or any other aspect of the therapeutic relationship. You remain professionally responsible for
            your clients' care.
          </p>
        </section>

        <section>
          <h2>13. Indemnity</h2>
          <p>
            You agree to indemnify us against any claims, losses, or costs (including reasonable legal fees) arising
            from your breach of these Terms, your violation of any applicable law, or your infringement of any third
            party's rights.
          </p>
        </section>

        <section>
          <h2>14. Third-party services</h2>
          <p>
            Clarity integrates with third-party services including Stripe (payments) and Resend (email). Your use of
            those services is also subject to their own terms. We are not responsible for the acts or omissions of
            third-party services. A full list is published on our{" "}
            <Link to="/legal/subprocessors">Subprocessors</Link> page.
          </p>
        </section>

        <section>
          <h2>15. Termination</h2>
          <p>
            We may suspend or terminate your account immediately if you materially breach these Terms and (where the
            breach is capable of remedy) fail to remedy it within 14 days of written notice. You may terminate your
            account at any time by cancelling your subscription and deleting your account. On termination, your
            right to use the platform ceases immediately. Sections 7, 11, 12, and 13 survive termination.
          </p>
        </section>

        <section>
          <h2>16. Changes to the platform and these Terms</h2>
          <p>
            We may update these Terms from time to time. We will give you at least 30 days' notice of material
            changes by email. Continued use after the notice period constitutes acceptance of the updated Terms. We
            may also change, suspend, or discontinue features of the platform. We will give reasonable notice of
            significant changes where practical.
          </p>
        </section>

        <section>
          <h2>17. Governing law</h2>
          <p>
            These Terms are governed by the law of England and Wales. Any disputes will be subject to the exclusive
            jurisdiction of the courts of England and Wales.
          </p>
        </section>

        <section>
          <h2>18. Complaints</h2>
          <p>
            If you have a concern about the platform or these Terms, please contact us first at{" "}
            <a href="mailto:hello@Clarity.app">hello@Clarity.app</a>. We will endeavour to resolve complaints within
            10 working days.
          </p>
        </section>

        <section>
          <h2>Schedule 1 — Data Processing Agreement</h2>
          <p>
            [TODO: this schedule needs a full Article 28-compliant DPA, drafted or reviewed by a UK-qualified
            solicitor, before Clarity processes client data on behalf of practitioners at scale. It must cover:
            subject matter (practice management processing — sessions, notes, forms, communications), duration (term
            of the subscription), nature and purpose (storage and display of practice data), types of personal data
            (client identity, session records, any encrypted notes, form responses, communications), categories of
            data subjects (clients of the practitioner), processing only on documented instructions, confidentiality
            obligations on Clarity staff, security measures (encryption, access controls, RLS), sub-processor
            approval and flow-down obligations, assistance with data subject rights and security breaches, deletion
            or return of data on termination, and audit rights.]
          </p>
        </section>

        <p className={styles.contact}>
          Questions? Contact us at <a href="mailto:hello@Clarity.app">hello@Clarity.app</a>
        </p>
      </div>
    </div>
  );
}
