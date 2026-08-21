// Privileged DB access for e2e/settings specs — same `supabase db query
// --linked` approach as e2e/stripe/seed-fixtures.mjs, but usable from a
// .spec.ts file (Playwright loads specs through tsx, so a plain ESM/TS
// import works here, unlike the plain-node seed script).
//
// Used only for things RLS legitimately blocks a client/admin session from
// doing (seeding a session row, resetting a client's consent flag). Setting
// values a real admin session is allowed to write (practice_settings for
// their own admin_id) go through supabase-js instead, so the test exercises
// the same RLS path the app does.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "settings-e2e-"));

export function dbQuery<T = Record<string, unknown>>(sql: string): { rows: T[] } {
  const file = join(tmpDir, `q-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql);
  let out: string;
  try {
    out = execFileSync("npx", ["supabase", "db", "query", "--file", file, "--linked"], {
      encoding: "utf8",
      shell: true,
    });
  } catch (err) {
    // execFileSync's own thrown error only ever showed "Command failed" plus
    // whatever made it to stdout before the CLI errored — the actual
    // Postgres/CLI error message is on stderr, which was silently dropped.
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new Error(`dbQuery failed.\nSQL: ${sql}\nstdout: ${e.stdout}\nstderr: ${e.stderr}`);
  }
  const jsonStart = out.indexOf("{");
  return JSON.parse(out.slice(jsonStart));
}

// Each `supabase db query` invocation pays a ~4s CLI/login-role startup cost
// regardless of query complexity — batching several statements into one
// query.rows via a CTE (see below) is the difference between a test taking
// 10s and one taking 40s. Use these instead of several dbQuery() calls in a
// row wherever the statements don't depend on each other's results.

export function lookupFixtureIds(adminEmail: string, clientEmail: string): { adminId: string; clientId: string } {
  const rows = dbQuery<{ who: string; id: string }>(`
    select 'admin' as who, id from auth.users where email = '${adminEmail}'
    union all
    select 'client' as who, id from auth.users where email = '${clientEmail}';
  `).rows;
  const adminId = rows.find((r) => r.who === "admin")?.id;
  const clientId = rows.find((r) => r.who === "client")?.id;
  if (!adminId || !clientId) throw new Error("Fixture ids not found — run: node e2e/settings/seed-fixtures.mjs");
  return { adminId, clientId };
}

type SessionSpec = {
  label: string;
  clientId: string;
  adminId: string;
  scheduledAt: string;
  paid: boolean;
  /** e.g. { block_id: "abc" } — sessions.metadata is jsonb; matches the app's
   *  own block-booking convention (see 20260819000006_block_aware_manual_payment.sql). */
  metadata?: Record<string, unknown>;
};

// Inserts several sessions in a single round trip via a CTE, returning each
// one's id keyed by the label you gave it.
export function insertSessions(specs: SessionSpec[]): Record<string, string> {
  const ctes = specs
    .map((s, i) => {
      const metadataSql = s.metadata ? `'${JSON.stringify(s.metadata)}'::jsonb` : "null";
      return `s${i} as (insert into public.sessions (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid, metadata)
          values ('${s.clientId}', '${s.adminId}', '${s.scheduledAt}', 50, 'scheduled', 'remote', 5000, ${s.paid}, ${metadataSql})
          returning id)`;
    })
    .join(",\n");
  const selects = specs.map((s, i) => `select '${s.label}' as label, id from s${i}`).join("\nunion all\n");
  const rows = dbQuery<{ label: string; id: string }>(`with ${ctes} ${selects};`).rows;
  const byLabel: Record<string, string> = {};
  for (const r of rows) byLabel[r.label] = r.id;
  return byLabel;
}
