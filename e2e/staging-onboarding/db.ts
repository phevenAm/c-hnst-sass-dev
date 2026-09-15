// Privileged DB access against STAGING specifically, via the Management API
// (`supabase db query --linked --project-ref <staging>`) rather than the CLI's
// local link file — the repo dir stays linked to prod (supabase/.temp/project-ref)
// so this never touches what any other concurrent session is doing against prod.
// See e2e/settings/db.ts for the prod-targeting twin this is adapted from.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STAGING_PROJECT_REF } from "./constants";

const tmpDir = mkdtempSync(join(tmpdir(), "staging-onboard-e2e-"));

export function stagingDbQuery<T = Record<string, unknown>>(sql: string): { rows: T[] } {
  const file = join(tmpDir, `q-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql);
  let out: string;
  try {
    out = execFileSync(
      "npx",
      [
        "supabase",
        "db",
        "query",
        "--file",
        file,
        "--linked",
        "--project-ref",
        STAGING_PROJECT_REF,
        "--output-format",
        "json",
      ],
      { encoding: "utf8", shell: true },
    );
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new Error(`stagingDbQuery failed.\nSQL: ${sql}\nstdout: ${e.stdout}\nstderr: ${e.stderr}`);
  }
  const start = out.search(/[[{]/);
  if (start === -1) {
    throw new Error(`\`supabase db query\` produced no JSON. Raw output:\n${out || "(empty)"}`);
  }
  const parsed = JSON.parse(out.slice(start)) as T[] | { rows: T[] };
  return { rows: Array.isArray(parsed) ? parsed : parsed.rows };
}

/**
 * Creates an already-confirmed admin directly in auth.users — same trick as
 * e2e/settings/db.ts's createAuthUser, used here specifically to screenshot
 * the post-confirmation half of the onboarding journey (subscribe -> Stripe
 * checkout -> admin/setup) without calling supabase.auth.signUp() again,
 * which sends a real confirmation email and is subject to Supabase's own
 * auth email-send rate limit (hit while re-running the full-signup spec
 * twice in a row — see staging-onboarding.spec.ts's second test).
 */
export function createConfirmedStagingAdmin(opts: { email: string; password: string }): string {
  const meta = JSON.stringify({ role: "admin", first_name: "E2E", last_name: "Onboard" }).replace(/'/g, "''");
  return stagingDbQuery<{ id: string }>(`
    insert into auth.users
      (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role,
       raw_user_meta_data, raw_app_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', '${opts.email}',
            extensions.crypt('${opts.password}', extensions.gen_salt('bf', 10)), now(),
            'authenticated', 'authenticated', '${meta}'::jsonb,
            '{"provider":"email","providers":["email"]}'::jsonb, now(), now(),
            '', '', '', '')
    returning id;
  `).rows[0].id;
}
