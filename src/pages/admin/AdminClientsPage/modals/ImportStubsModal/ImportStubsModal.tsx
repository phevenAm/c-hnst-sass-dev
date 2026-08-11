import { useRef, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";
import { useAppDispatch } from "@store/hooks";
import { fetchClientStubs } from "@store/slices/clientStubsSlice";

import styles from "../../AdminClientsPage.module.scss";

// ── Templates ─────────────────────────────────────────────────────────────────

export const CLIENT_HEADERS = ["client_id", "first_name", "last_name", "email", "codename"];

export const SESSION_HEADERS = [
  "client_id",
  "session_date",
  "session_time",
  "duration_minutes",
  "status",
  "amount_paid",
  "currency",
  "session_notes",
  "code",
];

const CLIENT_INSTRUCTIONS = [
  "# CLIENTS — one row per client",
  "# client_id: your own reference number (1, 2, 3…). Not stored — used to link rows in sessions.csv.",
  "# email and codename are optional.",
  "#",
];

const SESSION_INSTRUCTIONS = [
  "# SESSIONS — one row per session. client_id must match a row in clients.csv.",
  "# session_date: YYYY-MM-DD  |  session_time: HH:MM  |  status: attended / scheduled / no_show / cancelled",
  "# amount_paid: pounds (e.g. 85.00)  |  currency: GBP / USD / EUR  |  code: optional promo code",
  "#",
];

const CLIENT_ROWS = [
  ["1", "Jane", "Smith", "jane@example.com", "Jasmine"],
  ["2", "Bob", "Jones", "", ""],
  ["3", "Alice", "Brown", "alice@example.com", "Ali"],
];

const SESSION_ROWS = [
  ["1", "2026-05-01", "10:00", "60", "attended", "85.00", "GBP", "Good progress this week.", ""],
  ["1", "2026-05-08", "10:00", "60", "attended", "85.00", "GBP", "", ""],
  ["1", "2026-05-15", "10:00", "60", "no_show", "", "GBP", "Cancelled last minute.", ""],
  ["2", "2026-05-10", "14:00", "50", "attended", "70.00", "GBP", "", "PROMO10"],
];

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

  const clientsFileRef = useRef<HTMLInputElement>(null);
  const sessionsFileRef = useRef<HTMLInputElement>(null);

  const [clients, setClients] = useState<ParsedClient[]>([]);
  const [sessions, setSessions] = useState<ParsedSession[]>([]);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<"upload" | "preview">("upload");

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
          amount_paid: idx("amount_paid"),
          currency: idx("currency"),
          session_notes: idx("session_notes"),
          code: idx("code"),
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
            amount_paid: get(row, col.amount_paid),
            currency: get(row, col.currency),
            session_notes: get(row, col.session_notes),
            code: get(row, col.code),
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
      const time = session.session_time || "09:00";
      const scheduled_at = new Date(`${session.session_date}T${time}:00`).toISOString();
      const status = ["attended", "scheduled", "no_show", "cancelled"].includes(session.status)
        ? session.status
        : "attended";

      const { error: sessErr } = await supabase.from("stub_sessions").insert({
        stub_id: stubId,
        admin_id: userProfile.id,
        scheduled_at,
        duration_minutes: session.duration_minutes ? Number(session.duration_minutes) : null,
        status,
        amount_paid: session.amount_paid ? Number(session.amount_paid) : null,
        currency: session.currency || "GBP",
        notes: session.session_notes || null,
        code: session.code || null,
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
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
          {/* Clients preview */}
          <div>
            <p
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                margin: "0 0 var(--sp-2)",
              }}
            >
              {clients.length} {clients.length === 1 ? "client" : "clients"}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    {["ID", "Name", "Email", "Codename"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "5px 10px",
                          borderBottom: "1px solid var(--border)",
                          color: "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.slice(0, 20).map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "var(--text-muted)" }}>
                        {c.csvId || "—"}
                      </td>
                      <td style={{ padding: "5px 10px" }}>
                        {c.first_name} {c.last_name}
                      </td>
                      <td style={{ padding: "5px 10px", color: "var(--text-muted)" }}>{c.email || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "var(--text-muted)" }}>{c.codename || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clients.length > 20 && (
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "var(--sp-1)" }}>
                  Showing 20 of {clients.length}
                </p>
              )}
            </div>
          </div>

          {/* Sessions preview */}
          {sessions.length > 0 && (
            <div>
              <p
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  margin: "0 0 var(--sp-2)",
                }}
              >
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      {["Client ID", "Date", "Status", "Amount", "Notes"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "5px 10px",
                            borderBottom: "1px solid var(--border)",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice(0, 30).map((s, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "var(--text-muted)" }}>
                          {s.csvClientId}
                        </td>
                        <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>
                          {s.session_date} {s.session_time || "09:00"}
                        </td>
                        <td style={{ padding: "5px 10px" }}>{s.status || "attended"}</td>
                        <td style={{ padding: "5px 10px" }}>{s.amount_paid ? `£${s.amount_paid}` : "—"}</td>
                        <td
                          style={{
                            padding: "5px 10px",
                            color: "var(--text-muted)",
                            maxWidth: "180px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.session_notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sessions.length > 30 && (
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "var(--sp-1)" }}>
                    Showing 30 of {sessions.length}
                  </p>
                )}
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
      <p className={styles.modalText}>
        Use two CSVs: one for clients (name, email, codename) and one for their sessions (date, amount, notes). The
        client_id column links them together.
      </p>

      <div
        style={{
          display: "flex",
          gap: "var(--sp-2)",
          marginBottom: "var(--sp-5)",
          flexWrap: "wrap",
        }}
      >
        <Button variant="secondary" size="sm" onClick={downloadClientsTemplate}>
          Clients template ↓
        </Button>
        <Button variant="secondary" size="sm" onClick={downloadSessionsTemplate}>
          Sessions template ↓
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        {/* Clients file */}
        <div>
          <p
            style={{ fontSize: "0.82rem", fontWeight: 600, margin: "0 0 var(--sp-2)", color: "var(--text-secondary)" }}
          >
            Clients CSV <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>
          </p>
          <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
            <Button size="sm" variant="secondary" onClick={() => clientsFileRef.current?.click()}>
              Choose file
            </Button>
            {clients.length > 0 && (
              <span style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
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
        <div>
          <p
            style={{ fontSize: "0.82rem", fontWeight: 600, margin: "0 0 var(--sp-2)", color: "var(--text-secondary)" }}
          >
            Sessions CSV{" "}
            <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
          </p>
          <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
            <Button size="sm" variant="secondary" onClick={() => sessionsFileRef.current?.click()}>
              Choose file
            </Button>
            {sessions.length > 0 && (
              <span style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
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

      {parseError && <p className={styles.modalError}>{parseError}</p>}
    </Modal>
  );
}
