---
name: feature-legal-pages
description: Privacy Policy and Subprocessor List drafted for WithMe — NOT live, requires TODO items before launch
metadata:
  type: project
---

Draft legal documents exist at `docs/legal/privacy-policy.md` and `docs/legal/subprocessors.md`.

**Why:** UK GDPR requires a published privacy policy before any user data is collected. The subprocessor list documents third-party data processors (Supabase, Vercel, Stripe).

**Status: INCOMPLETE — do not launch without completing these:**

1. [ ] Confirm company name (Clarity _____ Ltd) and get Companies House registration number
2. [ ] Set up a privacy contact email (e.g. privacy@yourdomain.com)
3. [ ] Set registered company address
4. [ ] Check Supabase project region (dashboard → Project Settings → Infrastructure)
5. [ ] Check Vercel function region (dashboard → Project → Settings → Functions)
6. [ ] Confirm why DOB is collected from clients (age verification? practitioner view?)
7. [ ] Decide on analytics — if adding Posthog/GA, add cookie section + consent banner
8. [ ] Have a UK solicitor review both documents before going live
9. [ ] Build `/privacy` and `/legal/subprocessors` pages on the site and link from footer

**App name:** WithMe (not final)
**T&Cs:** Explicitly prohibit storage of clinical notes / sensitive health data — this scopes the privacy policy to ordinary personal data only, which simplifies compliance significantly.
