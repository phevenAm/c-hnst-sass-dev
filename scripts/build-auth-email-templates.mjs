// Regenerates the Supabase Auth email templates from the shared transactional
// builder (supabase/functions/_shared/email.ts) so they can't drift from the
// rest of Clarity's email design.
//
//   node scripts/build-auth-email-templates.mjs
//
// Writes supabase/templates/auth/*.html. Paste each into
// Dashboard → Authentication → Emails → Templates (subject line printed above
// each), keeping the {{ .Xxx }} tags. The transactional look comes straight
// from _shared/email.ts, so a redesign there flows here on a re-run.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Bundle the Deno module to an in-memory ESM string, then import it via data: URL.
const { outputFiles } = await esbuild.build({
  entryPoints: [join(ROOT, "supabase/functions/_shared/email.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  external: ["jsr:*", "npm:*"],
});
globalThis.Deno = { env: { get: () => undefined } };
const b64 = Buffer.from(outputFiles[0].text).toString("base64");
const { emailTemplate, para } = await import(`data:text/javascript;base64,${b64}`);

const OUT = join(ROOT, "supabase", "templates", "auth");
mkdirSync(OUT, { recursive: true });

const templates = [
  {
    file: "confirmation.html",
    subject: "Confirm your Clarity account",
    label: "Confirm your account",
    title: "Welcome to Clarity",
    body: para("Confirm this is your email address to finish setting up your account."),
    cta: { label: "Confirm my email", url: "{{ .ConfirmationURL }}" },
    footerNote:
      "You received this because someone used this address to create a Clarity account. If that wasn't you, you can ignore this email.",
  },
  {
    file: "magic-link.html",
    subject: "Your Clarity sign-in link",
    label: "Sign in",
    title: "Here's your sign-in link",
    body: para("Use the button below to sign in to Clarity. This link works once and expires shortly."),
    cta: { label: "Sign in to Clarity", url: "{{ .ConfirmationURL }}" },
    footerNote:
      "You received this because a sign-in link was requested for this address. If it wasn't you, no action is needed.",
  },
  {
    file: "recovery.html",
    subject: "Reset your Clarity password",
    label: "Password reset",
    title: "Choose a new password",
    body: para(
      "Someone asked to reset the password for this Clarity account. Use the button below to set a new one. If it wasn't you, you can safely ignore this email — your password won't change.",
    ),
    cta: { label: "Reset my password", url: "{{ .ConfirmationURL }}" },
    footerNote: "You received this because a password reset was requested for this address.",
  },
  {
    file: "email-change.html",
    subject: "Confirm your new Clarity email",
    label: "Email change",
    title: "Confirm your new email",
    body: para(
      'You asked to change your Clarity email from <strong style="color:#2d2520;">{{ .Email }}</strong> to <strong style="color:#2d2520;">{{ .NewEmail }}</strong>. Confirm the change with the button below.',
    ),
    cta: { label: "Confirm new email", url: "{{ .ConfirmationURL }}" },
    footerNote: "You received this because an email change was requested for this Clarity account.",
  },
  {
    file: "invite.html",
    subject: "You've been invited to Clarity",
    label: "Invitation",
    title: "You've been invited to Clarity",
    body: para(
      "Your counsellor uses Clarity to manage sessions and check-ins. Accept the invitation to set up your account.",
    ),
    cta: { label: "Accept invitation", url: "{{ .ConfirmationURL }}" },
    footerNote: "You received this because your counsellor invited you to their Clarity practice.",
  },
];

for (const t of templates) {
  writeFileSync(join(OUT, t.file), `${emailTemplate(t)}\n`);
  console.log(`${t.file}  —  Subject: ${t.subject}`);
}
