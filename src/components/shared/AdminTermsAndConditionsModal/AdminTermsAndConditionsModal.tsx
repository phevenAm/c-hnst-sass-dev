import React from "react";

import Modal from "../Modal/Modal";

import styles from "./AdminTermsAndConditionsModal.module.scss";

type modalProps = {
  onClose: () => void;
  action: React.ReactNode;
};

const AdminTermsAndConditionsModal = ({ action, onClose }: modalProps) => {
  return (
    <Modal title="Terms &amp; Conditions" onClose={onClose}>
      <p className={styles.updated}>Last updated: 24 August 2026</p>

      <section>
        <h2>1. Introduction</h2>
        <p>
          These Terms &amp; Conditions ("Terms") govern your use of Clarity ("the Platform"), operated by Clarity ("we",
          "us", "our"). By registering an account or subscribing to the Platform, you agree to be bound by these Terms.
        </p>
      </section>

      <section>
        <h2>2. Service description</h2>
        <p>
          Clarity is a practice management platform for independent counsellors and therapists. It provides tools for
          managing clients, scheduling sessions, storing session notes, sending surveys, and accepting payments, among
          other practice-management features added over time. The Platform is provided on a subscription basis.
        </p>
      </section>

      <section>
        <h2>3. Subscription &amp; payment</h2>
        <p>
          Access to the Platform requires an active monthly subscription at the current published rate. Subscriptions
          are billed monthly in advance via Stripe. You may cancel at any time through your account settings; access
          continues until the end of the current billing period.
        </p>
        <p>
          Client payments processed through Stripe Connect are made directly between your clients and your connected
          Stripe account. Clarity itself does not take a cut of client payments, though Stripe's own processing fees
          apply.
        </p>
      </section>

      <section>
        <h2>4. Data &amp; privacy</h2>
        <p>
          You remain the data controller for all client data stored on the Platform. You are responsible for obtaining
          appropriate consent from your clients and for complying with applicable data protection law (including UK
          GDPR). We process data only as a data processor on your behalf. Full details are set out in our Privacy
          Policy.
        </p>
        <p>
          If your subscription lapses, your account and data will be retained for 12 months. After this period, all
          account data will be permanently deleted unless you reactivate your subscription or export your data.
        </p>
      </section>

      <section>
        <h2>5. Session notes</h2>
        <p>
          Clarity supports storing session notes directly in the Platform, with optional client-side encryption you can
          enable so note content is unreadable to anyone without your unlock code, Clarity included. Encryption is
          opt-in and the unlock code is generated only for you — if it's lost, there is no way for us to recover access
          to notes encrypted under it. Whether or not you enable encryption, you remain solely responsible for meeting
          your own professional record-keeping obligations (retention periods, access controls, and identification
          practices) in line with BACP guidance and UK GDPR.
        </p>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>
          You must not use the Platform for any unlawful purpose or in a way that could harm Clarity or any third party.
          You are responsible for maintaining the confidentiality of your login credentials and for all activity under
          your account.
        </p>
      </section>

      <section>
        <h2>7. Cancellation &amp; account deletion</h2>
        <p>
          You may cancel your subscription at any time via Settings → Manage subscription. You may delete your account
          and all associated data at any time via Settings → Delete account. Deletion is permanent and cannot be undone.
        </p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p>
          The Platform is provided "as is". To the fullest extent permitted by law, Clarity excludes all liability for
          indirect, consequential, or incidental loss arising from use of the Platform. Our total liability in any
          12-month period shall not exceed the subscription fees paid by you in that period.
        </p>
      </section>

      <section>
        <h2>9. Governing law</h2>
        <p>
          These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive
          jurisdiction of the courts of England and Wales.
        </p>
      </section>

      <p className={styles.contact}>
        This is a summary — read the full{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>,{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, and{" "}
        <a href="/security" target="_blank" rel="noopener noreferrer">Security</a> page. Questions? Contact us at{" "}
        <a href="mailto:hello@Clarity.app">hello@Clarity.app</a>
      </p>

      <div className={styles.modalAction}>{action}</div>
    </Modal>
  );
};

export default AdminTermsAndConditionsModal;
