# Supabase Auth email templates — Clarity brand

These are the **account** emails (confirm signup, magic link, password reset,
email change, reauthentication). They are **not** in this repo's code — Supabase
sends them, and their HTML lives in:

**Dashboard → Authentication → Emails → Templates**

If you ever saw "Rosie" or "withMe" in an email, it was almost certainly one of
these (or the **From** name — see the bottom of this file). The transactional
emails (`supabase/functions/**`) contain no hard-coded names.

Each block below matches the redesigned transactional look
(`supabase/functions/_shared/email.ts`). Paste the HTML into the matching
template, keep the Supabase `{{ ... }}` tags exactly as shown, and set the
**Subject** line noted above each one.

---

## 1. Confirm signup

**Subject:** `Confirm your Clarity account`

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="color-scheme" content="light only" /></head>
<body style="margin:0;padding:0;background:#f5f5ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5ee;">
<tr><td align="center" style="padding:36px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;">
  <tr><td style="background:#1f4940;border-radius:14px 14px 0 0;padding:30px 40px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;"><tr>
      <td style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.14);text-align:center;font-family:Georgia,serif;font-size:19px;font-weight:700;color:#ffffff;line-height:42px;">C</td>
    </tr></table>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#ffffff;margin:0;letter-spacing:0.02em;">Clarity</h1>
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.7);margin:5px 0 0;">Counselling practice management</p>
  </td></tr>
  <tr><td style="background:#fffdf9;padding:36px 40px 30px;border-left:1px solid #e5e0dc;border-right:1px solid #e5e0dc;">
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:600;color:#7a6e67;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.12em;">Confirm your account</p>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:500;color:#2d2520;margin:0 0 20px;line-height:1.35;">Welcome to Clarity</h2>
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;color:#3d3530;line-height:1.7;margin:0 0 22px;">Confirm this is your email address to finish setting up your account.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr>
      <td style="border-radius:999px;background:#1f4940;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 34px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">Confirm my email &rarr;</a>
      </td>
    </tr></table>
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;color:#5c4f48;line-height:1.65;margin:22px 0 0;">If the button doesn't work, copy this link into your browser:<br><span style="color:#2d7264;word-break:break-all;">{{ .ConfirmationURL }}</span></p>
  </td></tr>
  <tr><td style="background:#1a3a35;border-radius:0 0 14px 14px;padding:26px 40px;">
    <p style="font-family:Georgia,serif;font-size:15px;color:#eef4f1;font-weight:600;margin:0 0 14px;">Clarity</p>
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#9db3ac;line-height:1.65;margin:0;">You received this because someone used this address to create a Clarity account. If that wasn't you, you can ignore this email.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
```

---

## 2. Magic Link

**Subject:** `Your Clarity sign-in link`

Same shell as above; swap the body block for:

```html
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:600;color:#7a6e67;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.12em;">Sign in</p>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:500;color:#2d2520;margin:0 0 20px;line-height:1.35;">Here's your sign-in link</h2>
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;color:#3d3530;line-height:1.7;margin:0 0 22px;">Use the button below to sign in to Clarity. This link works once and expires shortly.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr>
      <td style="border-radius:999px;background:#1f4940;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 34px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">Sign in to Clarity &rarr;</a>
      </td>
    </tr></table>
```
Footer note: `You received this because a sign-in link was requested for this address. If it wasn't you, no action is needed.`

---

## 3. Reset Password

**Subject:** `Reset your Clarity password`

Body block:

```html
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:600;color:#7a6e67;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.12em;">Password reset</p>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:500;color:#2d2520;margin:0 0 20px;line-height:1.35;">Choose a new password</h2>
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;color:#3d3530;line-height:1.7;margin:0 0 22px;">Someone asked to reset the password for this Clarity account. Use the button below to set a new one. If it wasn't you, you can safely ignore this email — your password won't change.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr>
      <td style="border-radius:999px;background:#1f4940;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 34px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">Reset my password &rarr;</a>
      </td>
    </tr></table>
```
Footer note: `You received this because a password reset was requested for this address.`

---

## 4. Change Email Address

**Subject:** `Confirm your new Clarity email`

Body block:

```html
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;font-weight:600;color:#7a6e67;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.12em;">Email change</p>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:500;color:#2d2520;margin:0 0 20px;line-height:1.35;">Confirm your new email</h2>
    <p style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;color:#3d3530;line-height:1.7;margin:0 0 22px;">You asked to change your Clarity email from <strong style="color:#2d2520;">{{ .Email }}</strong> to <strong style="color:#2d2520;">{{ .NewEmail }}</strong>. Confirm the change with the button below.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr>
      <td style="border-radius:999px;background:#1f4940;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 34px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">Confirm new email &rarr;</a>
      </td>
    </tr></table>
```
Footer note: `You received this because an email change was requested for this Clarity account.`

---

## The "From" name / address

If the sender still reads "Rosie" / "withMe" rather than "Clarity", it's one of:

- **Supabase Dashboard → Authentication → Emails → SMTP Settings → "Sender name"** — set to `Clarity`.
- The **`RESEND_FROM_EMAIL`** secret used by the transactional functions
  (Dashboard → Edge Functions → Secrets). It should be
  `Clarity <something@your-verified-domain>` — not a person's name.
  Update with: `supabase secrets set RESEND_FROM_EMAIL="Clarity <hello@…>"`.
