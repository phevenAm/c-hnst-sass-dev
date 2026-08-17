# Privacy Policy

> **DRAFT — NOT LIVE**
> Before publishing: fill every `[TODO]`, have this reviewed by a UK-qualified solicitor, and publish at `/privacy`.

**Last updated:** [TODO: insert date before publishing]

---

## 1. Who we are

Clarity is operated by [TODO: full registered company name], a company registered in England and Wales (company number [TODO]).

Our registered address is: [TODO: registered address]

For privacy questions, contact us at: [TODO: privacy@yourdomain.com]

---

## 2. What this policy covers

This policy explains how Clarity collects and uses personal data when you use the platform — either as a **practitioner** (a counsellor or therapist who manages a practice) or as a **client** (someone invited to the platform by their practitioner).

**Clarity and your practitioner.** When you use Clarity as a client, your practitioner is the data controller of your clinical and session data. Clarity processes that data on their behalf as a data processor. Your practitioner's own privacy notice will apply to the clinical aspects of your care. This policy covers Clarity's processing as operator of the platform.

---

## 3. What data we collect and why

### 3.1 Practitioners

| Data | Where stored | Why we collect it | Legal basis |
|---|---|---|---|
| Name and email address | `auth.users`, `users` table | Account creation, login, communications | Contract performance |
| Date of birth | `users.dob` | Account verification | Contract performance |
| Business / practice name | `practice_settings` | Displaying your practice identity | Contract performance |
| Counsellor display name | `practice_settings.counsellor_name` | Personalising client emails sent on your behalf | Contract performance |
| Bank account details (if entered) | `practice_settings` | Displaying payment information to clients | Contract performance |
| Stripe customer and subscription ID | `practice_settings` | Managing your subscription | Contract performance |
| CPD and supervision records | `cpd_logs`, `supervision_sessions` | Powering your professional development log | Contract performance |
| Availability rules and calendar entries | `availability_rules`, `admin_private_events` | Powering the scheduling features | Contract performance |
| Encryption key material | `practice_settings` (encrypted) | Protecting your session notes with client-side encryption | Contract performance |
| Feedback and bug reports | `feedback` | Improving the platform | Legitimate interests |

### 3.2 Clients

| Data | Where stored | Why we collect it | Legal basis |
|---|---|---|---|
| Name and email address | `auth.users`, `users` table | Account creation and login | Contract performance (with your practitioner) |
| Date of birth | `users.dob` | Age-gating for restricted materials | Contract performance |
| Session records (date, time, location, duration, payment status) | `sessions` | Showing you your appointments | Contract performance |
| Session notes written by your practitioner | `session_notes` (encrypted) | Clinical record-keeping by your practitioner | Art. 9(2)(h) — health care (your practitioner relies on this basis) |
| Questionnaire and wellbeing survey responses | `responses` | Outcome tracking by your practitioner | Art. 9(2)(h) — health care |
| Private journal entries | `journal_entries` | Personal journalling — only you can read these | Your consent |
| Consent record | `users.has_consented`, `users.consented_at` | Recording that you agreed to the terms of access | Legal obligation / legitimate interests |
| Unsubscribe preferences | `users.email_prefs_disabled`, `users.unsubscribe_token` | Honouring your email opt-outs | Legal obligation (PECR) |
| Notifications | `notifications` | In-app alerts about your sessions | Contract performance |

### 3.3 All users

| Data | Where stored | Why we collect it | Legal basis |
|---|---|---|---|
| Profile photo (if uploaded) | Supabase Storage (`avatars/`) | Profile display | Contract performance |
| Session and authentication cookies | Browser | Keeping you logged in securely | Contract performance / legitimate interests |
| Access logs (IP address, browser, timestamp) | Netlify / hosting infrastructure | Security and debugging | Legitimate interests |
| Email delivery records | `email_logs` | Auditing that notifications were sent | Legitimate interests |
| Audit log of actions | `audit_logs` | Accountability and fraud prevention | Legitimate interests |

We do not collect payment card details directly — these are handled entirely by Stripe.

---

## 4. Special-category data

Session notes and questionnaire responses may constitute **health data** under Article 9 UK GDPR. This data is processed on behalf of your practitioner, who is the data controller for your clinical information. Your practitioner relies on Article 9(2)(h) (health care purposes under UK law) as the condition for processing this data. If you have questions about why your clinical data is held, please contact your practitioner directly.

Session notes are **encrypted client-side** before being stored. Clarity cannot read the content of session notes.

Private journal entries are also encrypted client-side. Neither Clarity nor your practitioner can read your journal.

---

## 5. How long we keep your data

| Data | Retention |
|---|---|
| Active account data | Held for the duration of the account |
| Deleted practitioner accounts | Deleted within 30 days of account deletion |
| Deleted client accounts | Client profile deleted immediately on deletion; session records and encrypted notes may be retained by the practitioner in line with their clinical record-keeping obligations (typically 8 years for adult records under NHS / professional body guidance) |
| Billing records | 7 years (UK tax law) |
| Email delivery logs | 90 days |
| Audit logs | 12 months |
| Access / hosting logs | Up to 30 days (managed by Netlify) |

---

## 6. Who we share your data with

We share data only with the subprocessors listed at [/legal/subprocessors](/legal/subprocessors). We do not sell your data.

Where subprocessors are based outside the UK or EEA, transfers are covered by the UK International Data Transfer Agreement (IDTA) or equivalent safeguards — see the subprocessor list for details.

---

## 7. Your rights under UK GDPR

You have the right to:

- **Access** the personal data we hold about you (Article 15)
- **Correct** inaccurate data (Article 16)
- **Delete** your data, subject to our legal obligations to retain certain records (Article 17)
- **Restrict** processing in certain circumstances (Article 18)
- **Data portability** — receive a copy of your data in a machine-readable format (Article 20)
- **Object** to processing based on legitimate interests (Article 21)

To exercise any of these rights, contact us at [TODO: privacy@yourdomain.com]. We will respond within one calendar month.

**Note for clients:** rights relating to your clinical records (session notes, questionnaire responses) should be exercised with your practitioner as the data controller for that data.

You have the right to lodge a complaint with the **Information Commissioner's Office (ICO)** at [ico.org.uk](https://ico.org.uk) or by calling 0303 123 1113.

---

## 8. Cookies

We use essential cookies only — session and authentication cookies required to operate the service. We do not use tracking, advertising, or analytics cookies.

---

## 9. Profile photos

Profile photos are stored in publicly accessible storage. Do not upload a photo you do not wish to be publicly visible.

---

## 10. Changes to this policy

We will notify active users by email if we make material changes to this policy. The "last updated" date at the top reflects the most recent version. Continued use of the platform after a notified change constitutes acceptance.

---

## 11. Contact

For any privacy-related questions: [TODO: privacy@yourdomain.com]

For complaints, you may also contact the ICO: [ico.org.uk/make-a-complaint](https://ico.org.uk/make-a-complaint)
