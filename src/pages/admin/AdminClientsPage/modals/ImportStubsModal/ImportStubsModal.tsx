import { useRef, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";
import { useAppDispatch } from "@store/hooks";
import { fetchClientStubs } from "@store/slices/clientStubsSlice";

import styles from "../../AdminClientsPage.module.scss";

// ── CSV template ──────────────────────────────────────────────────────────────

const HEADERS = [
  "first_name",
  "last_name",
  "email",
  "codename",
  "session_date",
  "session_time",
  "duration_minutes",
  "status",
  "amount_paid",
  "currency",
  "session_notes",
  "code",
];

const TEMPLATE_ROWS = [
  ["Jane", "Smith", "jane@example.com", "Jasmine", "2026-07-01", "10:00", "60", "attended", "85.00", "GBP", "", ""],
  ["Jane", "Smith", "", "", "2026-07-08", "10:00", "60", "attended", "85.00", "GBP", "", ""],
  ["Bob", "Jones", "", "", "2026-07-05", "14:00", "50", "no_show", "", "GBP", "Late cancellation", "PROMO10"],
  ["Alice", "Brown", "alice@example.com", "", "", "", "", "", "", "", "", ""],
];

function downloadTemplate() {
  const lines = [
    HEADERS.join(","),
    ...TEMPLATE_ROWS.map((r) => r.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",")),
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "offline_clients_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
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

type ParsedRow = {
  first_name: string;
  last_name: string;
  email: string;
  codename: string;
  session_date: string;
  session_time: string;
  duration_minutes: string;
  status: string;
  amount_paid: string;
  currency: string;
  session_notes: string;
  code: string;
};

type ImportResult = {
  clientsCreated: number;
  sessionsCreated: number;
  errors: string[];
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportStubsModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();

  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");
    setRows([]);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const all = parseCSV(text);
        if (all.length < 2) {
          setParseError("File appears empty or only has a header row.");
          return;
        }
        const [header, ...data] = all;
        const idx = (col: string) => header.findIndex((h) => h.toLowerCase().trim() === col);
        const col = {
          first_name: idx("first_name"),
          last_name: idx("last_name"),
          email: idx("email"),
          codename: idx("codename"),
          session_date: idx("session_date"),
          session_time: idx("session_time"),
          duration_minutes: idx("duration_minutes"),
          status: idx("status"),
          amount_paid: idx("amount_paid"),
          currency: idx("currency"),
          session_notes: idx("session_notes"),
          code: idx("code"),
        };
        if (col.first_name === -1 || col.last_name === -1) {
          setParseError("CSV must have first_name and last_name columns.");
          return;
        }
        const get = (row: string[], c: number) => (c === -1 ? "" : (row[c] ?? "").trim());
        const parsed: ParsedRow[] = data.map((row) => ({
          first_name: get(row, col.first_name),
          last_name: get(row, col.last_name),
          email: get(row, col.email),
          codename: get(row, col.codename),
          session_date: get(row, col.session_date),
          session_time: get(row, col.session_time),
          duration_minutes: get(row, col.duration_minutes),
          status: get(row, col.status),
          amount_paid: get(row, col.amount_paid),
          currency: get(row, col.currency),
          session_notes: get(row, col.session_notes),
          code: get(row, col.code),
        }));
        const valid = parsed.filter((r) => r.first_name && r.last_name);
        if (valid.length === 0) {
          setParseError("No valid rows found. Each row needs at least first_name and last_name.");
          return;
        }
        setRows(valid);
      } catch {
        setParseError("Failed to parse file. Make sure it's a valid CSV.");
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!userProfile || rows.length === 0) return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }

    setImporting(true);
    const errors: string[] = [];
    let clientsCreated = 0;
    let sessionsCreated = 0;

    // Group rows by client key: email (if present) or "first_name|last_name"
    const clientMap = new Map<string, { rows: ParsedRow[]; stubId: string | null }>();
    for (const row of rows) {
      const key = row.email
        ? row.email.toLowerCase()
        : `${row.first_name.toLowerCase()}|${row.last_name.toLowerCase()}`;
      if (!clientMap.has(key)) {
        clientMap.set(key, { rows: [], stubId: null });
      }
      clientMap.get(key)!.rows.push(row);
    }

    for (const [, group] of clientMap) {
      const first = group.rows[0];
      const { data: stub, error: stubErr } = await supabase
        .from("client_stubs")
        .insert({
          created_by: userProfile.id,
          first_name: first.first_name,
          last_name: first.last_name,
          email: first.email || null,
          codename: first.codename || null,
        })
        .select("id")
        .single();

      if (stubErr || !stub) {
        errors.push(
          `Failed to create client ${first.first_name} ${first.last_name}: ${stubErr?.message ?? "unknown error"}`,
        );
        continue;
      }
      clientsCreated++;
      group.stubId = stub.id;

      for (const row of group.rows) {
        if (!row.session_date) continue;
        const time = row.session_time || "09:00";
        const scheduled_at = new Date(`${row.session_date}T${time}:00`).toISOString();
        const status = ["attended", "scheduled", "no_show", "cancelled"].includes(row.status) ? row.status : "attended";

        const { error: sessErr } = await supabase.from("stub_sessions").insert({
          stub_id: stub.id,
          admin_id: userProfile.id,
          scheduled_at,
          duration_minutes: row.duration_minutes ? Number(row.duration_minutes) : null,
          status,
          amount_paid: row.amount_paid ? Number(row.amount_paid) : null,
          currency: row.currency || "GBP",
          notes: row.session_notes || null,
          code: row.code || null,
        });

        if (sessErr) {
          errors.push(`Session for ${first.first_name} ${first.last_name} (${row.session_date}): ${sessErr.message}`);
        } else {
          sessionsCreated++;
        }
      }
    }

    await dispatch(fetchClientStubs());
    setResult({ clientsCreated, sessionsCreated, errors });
    setImporting(false);
  };

  // ── Done screen ───────────────────────────────────────────────────────────

  if (result) {
    return (
      <Modal title="Import complete" size="sm" onClose={onClose} actions={<Button onClick={onClose}>Done</Button>}>
        <p className={styles.modalText}>
          <strong>{result.clientsCreated}</strong> offline {result.clientsCreated === 1 ? "client" : "clients"} created,{" "}
          <strong>{result.sessionsCreated}</strong> {result.sessionsCreated === 1 ? "session" : "sessions"} added.
        </p>
        {result.errors.length > 0 && (
          <div style={{ marginTop: "var(--sp-4)" }}>
            <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--danger)", margin: "0 0 var(--sp-2)" }}>
              {result.errors.length} {result.errors.length === 1 ? "error" : "errors"}:
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.2em", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    );
  }

  // ── Preview screen ────────────────────────────────────────────────────────

  if (rows.length > 0) {
    const clientCount = new Set(rows.map((r) => (r.email ? r.email.toLowerCase() : `${r.first_name}|${r.last_name}`)))
      .size;
    const sessionCount = rows.filter((r) => r.session_date).length;

    return (
      <Modal
        title="Preview import"
        size="lg"
        onClose={onClose}
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRows([]);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Back
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Importing…" : `Import ${clientCount} ${clientCount === 1 ? "client" : "clients"}`}
            </Button>
          </>
        }
      >
        <p className={styles.modalText}>
          <strong>{clientCount}</strong> offline {clientCount === 1 ? "client" : "clients"} and{" "}
          <strong>{sessionCount}</strong> {sessionCount === 1 ? "session" : "sessions"} will be created.
        </p>
        <div style={{ overflowX: "auto", marginTop: "var(--sp-4)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr>
                {["Name", "Email", "Codename", "Session date", "Status", "Amount", "Code"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    {r.first_name} {r.last_name}
                  </td>
                  <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{r.email || "—"}</td>
                  <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{r.codename || "—"}</td>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    {r.session_date ? `${r.session_date} ${r.session_time || "09:00"}` : "—"}
                  </td>
                  <td style={{ padding: "6px 10px" }}>{r.status || (r.session_date ? "attended" : "—")}</td>
                  <td style={{ padding: "6px 10px" }}>{r.amount_paid ? `£${r.amount_paid}` : "—"}</td>
                  <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{r.code || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && (
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "var(--sp-2)" }}>
              Showing first 50 of {rows.length} rows.
            </p>
          )}
        </div>
      </Modal>
    );
  }

  // ── Upload screen ─────────────────────────────────────────────────────────

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
          <Button onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
        </>
      }
    >
      <p className={styles.modalText}>
        Upload a CSV to bulk-create offline clients and their sessions. Download the template to see the expected format
        — rows with the same email (or same name if no email) are treated as one client with multiple sessions.
      </p>
      <div style={{ marginBottom: "var(--sp-4)" }}>
        <Button variant="secondary" size="sm" onClick={downloadTemplate}>
          Download template
        </Button>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleFile} />
      {parseError && <p className={styles.modalError}>{parseError}</p>}
    </Modal>
  );
}
