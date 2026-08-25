import { useMemo, useRef, useState } from "react";

import { csvToIso } from "@Helpers/sessionDate";
import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";
import { useAppDispatch } from "@store/hooks";
import { fetchClientStubs } from "@store/slices/clientStubsSlice";

import sharedStyles from "../../AdminClientsPage.module.scss";

import styles from "./ImportStubsModal.module.scss";

// ── Templates ─────────────────────────────────────────────────────────────────

export const CLIENT_HEADERS = ["client_id", "first_name", "last_name", "email", "codename"];

export const SESSION_HEADERS = [
  "client_id",
  "session_date",
  "session_time",
  "duration_minutes",
  "status",
  "price_pence",
  "paid",
  "amount_paid",
  "currency",
  "session_notes",
  "reference_code",
  "location",
];

const CLIENT_INSTRUCTIONS = [
  "# ================================================================",
  "# Clarity — Offline Client Import  |  clients.csv",
  "# ================================================================",
  "#",
  "# HOW TO USE",
  "# 1. Fill in one row per client below the header row.",
  "# 2. client_id is YOUR reference (1, 2, 3…). It is not stored in",
  "#    the app — it only links clients to their sessions in",
  "#    sessions.csv. Any unique value works.",
  "# 3. email and codename are optional.",
  "# 4. These comment lines are ignored by the importer.",
  "#",
  "# COLUMNS",
  "#  client_id   — unique ID you choose (links rows in sessions.csv)",
  "#  first_name  — required",
  "#  last_name   — required",
  "#  email       — optional; lets you send a sign-up invite later",
  "#  codename    — optional; replaces the client name in the UI",
  "#",
];

const SESSION_INSTRUCTIONS = [
  "# ================================================================",
  "# Clarity — Offline Session Import  |  sessions.csv",
  "# ================================================================",
  "#",
  "# HOW TO USE",
  "# 1. Fill in one row per session below the header row.",
  "# 2. client_id must match a value from clients.csv.",
  "# 3. These comment lines are ignored by the importer.",
  "#",
  "# COLUMNS",
  "#  client_id         — must match a row in clients.csv",
  "#  session_date      — DD/MM/YYYY  or  YYYY-MM-DD",
  "#  session_time      — HH:MM  24-hour (e.g. 09:00, 14:30)",
  "#  duration_minutes  — e.g. 50 or 60  (optional)",
  "#  status            — attended / scheduled / no_show / cancelled",
  "#  price_pence       — session fee in pence e.g. 8500 = £85 (optional)",
  "#  paid              — true / false / yes / no (default: false)",
  "#  amount_paid       — legacy: decimal e.g. 85.00 (ignored if price_pence set)",
  "#  currency          — GBP / USD / EUR  (default: GBP)",
  "#  session_notes     — optional free-text notes",
  "#  reference_code    — optional session ID  e.g. S-001",
  "#  location          — optional address or meeting link",
  "#",
];

const CLIENT_ROWS = [
  ["1", "Jane", "Smith", "jane@example.com", "Jasmine"],
  ["2", "Bob", "Jones", "", ""],
  ["3", "Alice", "Brown", "alice@example.com", "Ali"],
];

const SESSION_ROWS = [
  ["1", "2026-05-01", "10:00", "60", "attended", "8500", "true", "", "GBP", "Good progress this week.", "", ""],
  ["1", "2026-05-08", "10:00", "60", "attended", "8500", "true", "", "GBP", "", "", ""],
  ["1", "2026-05-15", "10:00", "60", "no_show", "", "false", "", "GBP", "Cancelled last minute.", "", ""],
  ["2", "2026-05-10", "14:00", "50", "attended", "7000", "true", "", "GBP", "", "S-001", "15 London Rd"],
];

function formatSessionAmount(s: ParsedSession): string {
  let amount = "—";
  if (s.price_pence) amount = `£${(Number(s.price_pence) / 100).toFixed(2)}`;
  else if (s.amount_paid) amount = `£${s.amount_paid}`;
  const isPaid = s.paid && ["true", "1", "yes"].includes(s.paid.toLowerCase());
  return isPaid ? `${amount} ✓` : amount;
}

function csvEscape(v: string) {
  return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
}

function triggerDownload(lines: string[], filename: string) {
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadClientsTemplate() {
  triggerDownload(
    [...CLIENT_INSTRUCTIONS, CLIENT_HEADERS.join(","), ...CLIENT_ROWS.map((r) => r.map(csvEscape).join(","))],
    "clients_template.csv",
  );
}

function downloadSessionsTemplate() {
  triggerDownload(
    [...SESSION_INSTRUCTIONS, SESSION_HEADERS.join(","), ...SESSION_ROWS.map((r) => r.map(csvEscape).join(","))],
    "sessions_template.csv",
  );
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inQuotes) {
        if (ch === '"' && raw[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
      } else {
        field += ch;
      }
    }
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedClient = {
  csvId: string;
  first_name: string;
  last_name: string;
  email: string;
  codename: string;
};

type ParsedSession = {
  csvClientId: string;
  session_date: string;
  session_time: string;
  duration_minutes: string;
  status: string;
  price_pence: string;
  paid: string;
  amount_paid: string;
  currency: string;
  session_notes: string;
  reference_code: string;
  location: string;
};

type ImportResult = {
  clientsCreated: number;
  sessionsCreated: number;
  errors: string[];
};

type SessionGroup = { csvClientId: string; rows: ParsedSession[] };

// Groups consecutive rows sharing a client_id so the preview table can merge
// them under one spanning cell instead of repeating it on every row — CSVs
// exported from a spreadsheet are already sorted this way in practice.
function groupSessionsByClient(rows: ParsedSession[]): SessionGroup[] {
  const groups: SessionGroup[] = [];
  for (const row of rows) {
    const current = groups[groups.length - 1];
    if (current && current.csvClientId === row.csvClientId) {
      current.rows.push(row);
    } else {
      groups.push({ csvClientId: row.csvClientId, rows: [row] });
    }
  }
  return groups;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportStubsModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();

  const clientsFileRef = useRef<HTMLInputElement>(null);
  const sessionsFileRef = useRef<HTMLInputElement>(null);

  const [clients, setClients] = useState<ParsedClient[]>([]);
  const [sessions, setSessions] = useState<ParsedSession[]>([]);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<"upload" | "preview">("upload");

  const sessionGroups = useMemo(() => groupSessionsByClient(sessions), [sessions]);

  const parseClientsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const all = parseCSV(ev.target?.result as string);
        if (all.length < 2) {
          setParseError("Clients file appears empty or only has a header row.");
          return;
        }
        const [header, ...data] = all;
        const idx = (col: string) => header.findIndex((h) => h.toLowerCase().trim() === col);
        const col = {
          csvId: idx("client_id"),
          first_name: idx("first_name"),
          last_name: idx("last_name"),
          email: idx("email"),
          codename: idx("codename"),
        };
        if (col.first_name === -1 || col.last_name === -1) {
          setParseError("Clients CSV must have first_name and last_name columns.");
          return;
        }
        const get = (row: string[], c: number) => (c === -1 ? "" : (row[c] ?? "").trim());
        const parsed: ParsedClient[] = data
          .map((row) => ({
            csvId: get(row, col.csvId),
            first_name: get(row, col.first_name),
            last_name: get(row, col.last_name),
            email: get(row, col.email),
            codename: get(row, col.codename),
          }))
          .filter((r) => r.first_name && r.last_name);
        if (parsed.length === 0) {
          setParseError("No valid client rows found (each row needs at least first_name and last_name).");
          return;
        }
        setClients(parsed);
      } catch {
        setParseError("Failed to parse clients file. Make sure it's a valid CSV.");
      }
    };
    reader.readAsText(file);
  };

  const parseSessionsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const all = parseCSV(ev.target?.result as string);
        if (all.length < 2) {
          setSessions([]);
          return;
        }
        const [header, ...data] = all;
        const idx = (col: string) => header.findIndex((h) => h.toLowerCase().trim() === col);
        const col = {
          csvClientId: idx("client_id"),
          session_date: idx("session_date"),
          session_time: idx("session_time"),
          duration_minutes: idx("duration_minutes"),
          status: idx("status"),
          price_pence: idx("price_pence"),
          paid: idx("paid"),
          amount_paid: idx("amount_paid"),
          currency: idx("currency"),
          session_notes: idx("session_notes"),
          reference_code: idx("reference_code"),
          location: idx("location"),
        };
        if (col.csvClientId === -1 || col.session_date === -1) {
          setParseError("Sessions CSV must have client_id and session_date columns.");
          return;
        }
        const get = (row: string[], c: number) => (c === -1 ? "" : (row[c] ?? "").trim());
        const parsed: ParsedSession[] = data
          .map((row) => ({
            csvClientId: get(row, col.csvClientId),
            session_date: get(row, col.session_date),
            session_time: get(row, col.session_time),
            duration_minutes: get(row, col.duration_minutes),
            status: get(row, col.status),
            price_pence: get(row, col.price_pence),
            paid: get(row, col.paid),
            amount_paid: get(row, col.amount_paid),
            currency: get(row, col.currency),
            session_notes: get(row, col.session_notes),
            reference_code: get(row, col.reference_code),
            location: get(row, col.location),
          }))
          .filter((r) => r.session_date);
        setSessions(parsed);
      } catch {
        setParseError("Failed to parse sessions file. Make sure it's a valid CSV.");
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!userProfile || clients.length === 0) return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }

    setImporting(true);
    const errors: string[] = [];
    let clientsCreated = 0;
    let sessionsCreated = 0;

    const csvIdToStubId = new Map<string, string>();

    for (const client of clients) {
      const { data: stub, error: stubErr } = await supabase
        .from("client_stubs")
        .insert({
          created_by: userProfile.id,
          first_name: client.first_name,
          last_name: client.last_name,
          email: client.email || null,
          codename: client.codename || null,
        })
        .select("id")
        .single();

      if (stubErr || !stub) {
        errors.push(`Failed to create ${client.first_name} ${client.last_name}: ${stubErr?.message ?? "unknown"}`);
        continue;
      }
      clientsCreated++;
      if (client.csvId) csvIdToStubId.set(client.csvId, stub.id);
    }

    for (const session of sessions) {
      const stubId = csvIdToStubId.get(session.csvClientId);
      if (!stubId) {
        errors.push(
          `Session on ${session.session_date}: client_id "${session.csvClientId}" not found in clients file.`,
        );
        continue;
      }
      const scheduled_at = csvToIso(session.session_date, session.session_time || "09:00");
      if (!scheduled_at) {
        errors.push(
          `Session for client "${session.csvClientId}": invalid date "${session.session_date}" — use YYYY-MM-DD format.`,
        );
        continue;
      }
      const status = ["attended", "scheduled", "no_show", "cancelled"].includes(session.status)
        ? session.status
        : "attended";

      let pricePence: number | null = null;
      if (session.price_pence) pricePence = Number(session.price_pence);
      else if (session.amount_paid) pricePence = Math.round(Number(session.amount_paid) * 100);
      const isPaid = ["true", "1", "yes"].includes((session.paid || "").toLowerCase());

      const { error: sessErr } = await supabase.from("stub_sessions").insert({
        stub_id: stubId,
        admin_id: userProfile.id,
        scheduled_at,
        duration_minutes: session.duration_minutes ? Number(session.duration_minutes) : null,
        status,
        price_pence: pricePence,
        paid: isPaid,
        amount_paid: session.amount_paid ? Number(session.amount_paid) : null,
        currency: session.currency || "GBP",
        notes: session.session_notes || null,
        code: session.reference_code || null,
        location: session.location || null,
      });

      if (sessErr) {
        errors.push(`Session ${session.session_date} (client ${session.csvClientId}): ${sessErr.message}`);
      } else {
        sessionsCreated++;
      }
    }

    await dispatch(fetchClientStubs());
    setResult({ clientsCreated, sessionsCreated, errors });
    setImporting(false);
  };

  // ── Done ──────────────────────────────────────────────────────────────────

  if (result) {
    return (
      <Modal title="Import complete" size="sm" onClose={onClose} actions={<Button onClick={onClose}>Done</Button>}>
        <p className={sharedStyles.modalText}>
          <strong>{result.clientsCreated}</strong> offline {result.clientsCreated === 1 ? "client" : "clients"} created,{" "}
          <strong>{result.sessionsCreated}</strong> {result.sessionsCreated === 1 ? "session" : "sessions"} added.
        </p>
        {result.errors.length > 0 && (
          <div style={{ marginTop: "var(--sp-4)" }}>
            <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--danger)", margin: "0 0 var(--sp-2)" }}>
              {result.errors.length} {result.errors.length === 1 ? "error" : "errors"}:
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.2em", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    );
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  if (step === "preview" && clients.length > 0) {
    return (
      <Modal
        title="Preview import"
        size="lg"
        onClose={onClose}
        actions={
          <>
            <Button variant="ghost" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing
                ? "Importing…"
                : `Import ${clients.length} ${clients.length === 1 ? "client" : "clients"}${sessions.length > 0 ? ` + ${sessions.length} sessions` : ""}`}
            </Button>
          </>
        }
      >
        <div className={styles.previewGroup}>
          {/* Clients preview */}
          <div>
            <p className={styles.previewLabel}>
              {clients.length} {clients.length === 1 ? "client" : "clients"}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {["ID", "Name", "Email", "Codename"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: CSV preview rows have no stable id and are re-derived from the file on every parse
                    <tr key={`${c.csvId}-${c.first_name}-${c.last_name}-${i}`}>
                      <td className={`${styles.mono} ${styles.muted}`}>{c.csvId || "—"}</td>
                      <td className={styles.primaryCell}>
                        {c.first_name} {c.last_name}
                      </td>
                      <td className={styles.muted}>{c.email || "—"}</td>
                      <td className={styles.muted}>{c.codename || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sessions preview — grouped by client_id, with a merged cell
              spanning each client's rows instead of repeating their ID. */}
          {sessions.length > 0 && (
            <div>
              <p className={styles.previewLabel}>
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {["Client ID", "Date", "Status", "Amount", "Notes"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessionGroups.map((group) =>
                      group.rows.map((s, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: CSV preview rows have no stable id and are re-derived from the file on every parse
                        <tr key={`${group.csvClientId}-${s.session_date}-${s.session_time}-${i}`}>
                          {i === 0 && (
                            <td className={styles.groupCell} rowSpan={group.rows.length}>
                              {group.csvClientId}
                            </td>
                          )}
                          <td className={`${styles.primaryCell} ${styles.noWrap}`}>
                            {s.session_date} {s.session_time || "09:00"}
                          </td>
                          <td className={styles.primaryCell}>{s.status || "attended"}</td>
                          <td className={styles.primaryCell}>{formatSessionAmount(s)}</td>
                          <td className={`${styles.muted} ${styles.truncate}`}>{s.session_notes || "—"}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  return (
    <Modal
      title="Import offline clients"
      size="sm"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => setStep("preview")} disabled={clients.length === 0}>
            Preview import
          </Button>
        </>
      }
    >
      <p className={sharedStyles.modalText}>
        Use two CSVs: one for clients (name, email, codename) and one for their sessions (date, amount, notes). The
        client_id column links them together.
      </p>

      <div className={styles.uploadPanel}>
        <div className={styles.templateRow}>
          <Button variant="secondary" size="sm" onClick={downloadClientsTemplate}>
            Clients template ↓
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadSessionsTemplate}>
            Sessions template ↓
          </Button>
        </div>

        {/* Clients file */}
        <div className={styles.fileField}>
          <p className={styles.fileFieldLabel}>
            Clients CSV <span className={styles.required}>*</span>
          </p>
          <div className={styles.fileFieldRow}>
            <Button size="sm" variant="secondary" onClick={() => clientsFileRef.current?.click()}>
              Choose file
            </Button>
            {clients.length > 0 && (
              <span className={styles.fileReady}>
                {clients.length} {clients.length === 1 ? "client" : "clients"} ready
              </span>
            )}
          </div>
          <input
            ref={clientsFileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={parseClientsFile}
          />
        </div>

        {/* Sessions file */}
        <div className={styles.fileField}>
          <p className={styles.fileFieldLabel}>
            Sessions CSV <span className={styles.optional}>(optional)</span>
          </p>
          <div className={styles.fileFieldRow}>
            <Button size="sm" variant="secondary" onClick={() => sessionsFileRef.current?.click()}>
              Choose file
            </Button>
            {sessions.length > 0 && (
              <span className={styles.fileReady}>
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"} ready
              </span>
            )}
          </div>
          <input
            ref={sessionsFileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={parseSessionsFile}
          />
        </div>
      </div>

      {parseError && <p className={sharedStyles.modalError}>{parseError}</p>}
    </Modal>
  );
}
