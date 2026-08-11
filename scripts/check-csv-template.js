#!/usr/bin/env node
/**
 * Checks that ImportStubsModal's CSV HEADERS stay in sync with StubSession fields.
 * Run manually: node scripts/check-csv-template.js
 * Also runs automatically in the pre-push hook.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Auto-generated fields that don't need CSV columns
const SKIP_FIELDS = new Set(["id", "stub_id", "admin_id", "created_at"]);

// StubSession fields that map to DIFFERENT CSV column names
const RENAMED = {
  scheduled_at: ["session_date", "session_time"],
  notes: ["session_notes"],
};

// ── Read StubSession type ─────────────────────────────────────────────────────

const globalTypes = readFileSync(join(root, "src/models/globalTypes.ts"), "utf8");
const match = globalTypes.match(/export type StubSession = \{([\s\S]*?)\};/);
if (!match) {
  console.error("❌  Could not find StubSession type in globalTypes.ts");
  process.exit(1);
}

const dbFields = [...match[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).filter((f) => !SKIP_FIELDS.has(f));

// ── Read CSV HEADERS ──────────────────────────────────────────────────────────

const modal = readFileSync(
  join(root, "src/pages/admin/AdminClientsPage/modals/ImportStubsModal/ImportStubsModal.tsx"),
  "utf8",
);
const headersMatch = modal.match(/const HEADERS = \[([\s\S]*?)\];/);
if (!headersMatch) {
  console.error("❌  Could not find HEADERS array in ImportStubsModal.tsx");
  process.exit(1);
}
const csvCols = new Set([...headersMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));

// ── Compare ───────────────────────────────────────────────────────────────────

const missing = [];
for (const field of dbFields) {
  const mapped = RENAMED[field] ?? [field];
  if (!mapped.some((col) => csvCols.has(col))) {
    missing.push(field);
  }
}

if (missing.length) {
  console.error("");
  console.error("❌  CSV template is out of sync with StubSession:");
  for (const f of missing) {
    console.error(`   Missing: "${f}" — add a column to HEADERS in ImportStubsModal.tsx`);
  }
  console.error("");
  process.exit(1);
}

console.log(`OK CSV template covers all ${dbFields.length} StubSession session fields`);
