import React, { useEffect, useState } from "react";
import Modal from "../Modal/Modal";
import styles from "./AdminTermsAndConditionsModal.module.scss";

type modalProps = {
  onClose: () => void;
  action: React.ReactNode;
};

const AdminTermsAndConditionsModal = ({ action, onClose }: modalProps) => {
  return (
    <Modal title="Terms &amp; Conditions" onClose={onClose}>
      {/* <p className={styles.updated}>Last updated: July 2026</p> */}

      <section>
        <h2>1. Introduction</h2>
        <p>
          These Terms &amp; Conditions ("Terms") govern your use of WithMe ("the Platform"), operated by WithMe ("we",
          "us", "our"). By registering an account or subscribing to the Platform, you agree to be bound by these Terms.
        </p>
      </section>

      <section>
        <h2>2. Service description</h2>
        <p>
          WithMe is a practice management platform for independent counsellors and therapists. It provides tools for
          managing clients, scheduling sessions, sending surveys, and accepting payments. The Platform is provided on a
          subscription basis.
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
          Stripe account. WithMe does not take a cut of client payments.
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
        <h2>5. Acceptable use</h2>
        <p>
          You must not use the Platform for any unlawful purpose or in a way that could harm WithMe or any third party.
          You are responsible for maintaining the confidentiality of your login credentials and for all activity under
          your account.
        </p>
      </section>

      <section>
        <h2>6. Cancellation &amp; account deletion</h2>
        <p>
          You may cancel your subscription at any time via Settings → Manage subscription. You may delete your account
          and all associated data at any time via Settings → Delete account. Deletion is permanent and cannot be undone.
        </p>
      </section>

      <section>
        <h2>7. Limitation of liability</h2>
        <p>
          The Platform is provided "as is". To the fullest extent permitted by law, WithMe excludes all liability for
          indirect, consequential, or incidental loss arising from use of the Platform. Our total liability in any
          12-month period shall not exceed the subscription fees paid by you in that period.
        </p>
      </section>

      <section>
        <h2>8. Governing law</h2>
        <p>
          These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive
          jurisdiction of the courts of England and Wales.
        </p>
      </section>

      <p className={styles.contact}>
        Questions? Contact us at <a href="mailto:hello@withme.app">hello@withme.app</a>
      </p>

      <div className={styles.modalAction}>{action}</div>
    </Modal>
  );
};

export default AdminTermsAndConditionsModal;
