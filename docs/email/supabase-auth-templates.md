# Supabase Auth email templates — Clarity brand

These are the **account** emails (confirm signup, magic link, password reset,
email change, invitation). Supabase sends them — their HTML is **not** applied
from this repo automatically; it lives in:

**Dashboard → Authentication → Emails → Templates**

## Keeping them on-brand

The HTML is **generated from the shared transactional builder**
(`supabase/functions/_shared/email.ts`) so it can't drift from the rest of
Clarity's email design (white card, stone ground, teal header/footer, sprout
logo, dark-mode support).

```bash
node scripts/build-auth-email-templates.mjs
```

writes:

| File | Template in the dashboard | Subject |
|---|---|---|
| `supabase/templates/auth/confirmation.html` | Confirm signup | `Confirm your Clarity account` |
| `supabase/templates/auth/magic-link.html` | Magic Link | `Your Clarity sign-in link` |
| `supabase/templates/auth/recovery.html` | Reset Password | `Reset your Clarity password` |
| `supabase/templates/auth/email-change.html` | Change Email Address | `Confirm your new Clarity email` |
| `supabase/templates/auth/invite.html` | Invite user | `You've been invited to Clarity` |

The Go-template tags (`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`)
are baked into the generated files — leave them as-is.

## Applying them

1. Run the generator (above).
2. For each row, open the dashboard template, paste the file contents, set the
   Subject, save.

Re-do this after any change to `_shared/email.ts`.

## The "From" name / address

If the sender reads a person's name rather than "Clarity", it's one of:

- **Dashboard → Authentication → Emails → SMTP Settings → "Sender name"** — set to `Clarity`.
- The **`RESEND_FROM_EMAIL`** secret used by the transactional functions
  (Dashboard → Edge Functions → Secrets). It should be
  `Clarity <something@your-verified-domain>` — not a person's name.
  Update with: `supabase secrets set RESEND_FROM_EMAIL="Clarity <hello@…>"`.
