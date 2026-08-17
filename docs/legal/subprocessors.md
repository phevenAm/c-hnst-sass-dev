# Subprocessor List

> **DRAFT — NOT LIVE**
> Before publishing: confirm Supabase region and Netlify region, then publish at `/legal/subprocessors`.

**Last updated:** [TODO: insert date before publishing]

These are the third-party companies ("subprocessors") that Clarity uses to deliver its service and that may process personal data on our behalf.

| Subprocessor | Purpose | Data received | Location | International transfer safeguard | DPA / Privacy |
|---|---|---|---|---|---|
| **Supabase** | Database, authentication, file storage, edge functions | All personal data; encrypted session notes; questionnaire responses | [TODO: check Supabase dashboard → Project Settings → Infrastructure — must be EU region for UK GDPR compliance] | IDTA (if US region) / not required (if EU region) | [Supabase DPA](https://supabase.com/legal/dpa) · [Privacy](https://supabase.com/privacy) |
| **Resend** | Transactional email delivery | Recipient name and email; session dates and times; appointment details | United States | UK IDTA / Resend DPA | [Resend DPA](https://resend.com/legal/dpa) · [Privacy](https://resend.com/legal/privacy-policy) |
| **Stripe** | Subscription billing and payment processing | Practitioner name and email; subscription status | United States | EU–US Data Privacy Framework | [Stripe DPA](https://stripe.com/legal/dpa) · [Privacy](https://stripe.com/gb/privacy) |
| **Netlify** | Frontend hosting and CDN | HTTP access logs (IP address, browser, timestamp) | United States / globally distributed | UK IDTA / Netlify DPA | [Netlify DPA](https://www.netlify.com/legal/data-processing-agreement/) · [Privacy](https://www.netlify.com/privacy/) |

---

## International transfers

Where a subprocessor is based in the US, personal data transfers from the UK are covered by the **UK International Data Transfer Agreement (IDTA)** or, where applicable, the **EU–US Data Privacy Framework**. Each subprocessor maintains a Data Processing Agreement documenting these safeguards.

**Important:** Clarity's database is hosted by Supabase. If the Supabase project region is outside the EU/EEA, all personal data (including encrypted session notes) is transferred to the US. [TODO: Verify region in Supabase dashboard and update this list before publishing.]

---

## Updates

We will update this list when we add or remove subprocessors. We will provide reasonable advance notice to practitioners of any material changes.
