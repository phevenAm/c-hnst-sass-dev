// Pure document builders for the account-deletion practice export.
//
// Deliberately free of `npm:` / Deno specifiers: index.ts injects the three
// libraries (XLSX, jsPDF, JSZip) so this exact file also runs under a plain
// Node verification harness (see e2e/account-lifecycle + scratchpad checks).
// Anything network- or auth-shaped stays in index.ts.

export type Dict = Record<string, unknown>;

export type ExportInput = {
  practiceName: string;
  /** "YYYY-MM-DD HH:MM" (UTC) */
  exportedAt: string;
  clients: Dict[];
  stubs: Dict[];
  sessions: Dict[];
  stubSessions: Dict[];
  notes: Dict[];
  payments: Dict[];
  /** { [noteId]: plaintext } for notes the caller could decrypt in-browser. */
  decryptedNotes: Record<string, string>;
};

export type Libs = {
  // deno-lint-ignore no-explicit-any
  XLSX: any;
  // jsPDF constructor. jspdf-autotable v3 patches its prototype with
  // `.autoTable`; v5 exports a standalone `autoTable(doc, opts)`. buildPdf
  // copes with either, and with an explicitly injected `autoTable`.
  // deno-lint-ignore no-explicit-any
  jsPDF: any;
  // deno-lint-ignore no-explicit-any
  autoTable?: (doc: any, opts: any) => void;
  // deno-lint-ignore no-explicit-any
  JSZip: any;
};

// ── Brand ───────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const TEAL: RGB = [31, 73, 64]; // --accent
const WHITE: RGB = [255, 255, 255];
const MUTED: RGB = [120, 120, 120];

// ── Formatters ──────────────────────────────────────────────────────────────
export const fmtDate = (v: unknown): string => {
  if (!v) return "";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 16).replace("T", " ");
};
const poundsFromPence = (pence: number | null | undefined): number | "" =>
  pence == null ? "" : Math.round(pence) / 100;
const money = (pence: number | null | undefined): string =>
  pence == null ? "" : `£${(Math.round(pence) / 100).toFixed(2)}`;
const attendedLabel = (a: boolean | null | undefined): string =>
  a === true ? "Attended" : a === false ? "No-show" : "—";

// ── Name + codename lookups ─────────────────────────────────────────────────
export function nameMaps(clients: Dict[], stubs: Dict[]) {
  const clientName = new Map<string, string>();
  const clientCode = new Map<string, string>();
  for (const c of clients) {
    const real = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    clientName.set(String(c.id), real || String(c.display_name || "") || "(no name on file)");
    clientCode.set(String(c.id), String(c.admin_codename || ""));
  }
  const stubName = new Map<string, string>();
  const stubCode = new Map<string, string>();
  for (const s of stubs) {
    const real = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
    stubName.set(String(s.id), real || "(no name on file)");
    stubCode.set(String(s.id), String(s.codename || ""));
  }
  return { clientName, clientCode, stubName, stubCode };
}

// ── Row builders (exported for the verification harness) ─────────────────────
export function clientRows(input: ExportInput): Dict[] {
  return [
    ...input.clients.map((c) => ({
      Type: "Portal client",
      Name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || String(c.display_name || "") || "",
      Codename: c.admin_codename ?? "",
      Email: c.email ?? "",
      "Date of birth": c.dob ?? "",
      Status: c.archived_at ? `Archived (${c.archived_reason ?? "—"})` : c.disabled ? "Paused" : "Active",
      Anonymised: c.anonymised_at ? "Yes" : "No",
      Added: fmtDate(c.created_at),
    })),
    ...input.stubs.map((s) => ({
      Type: "Offline client",
      Name: [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "",
      Codename: s.codename ?? "",
      Email: s.email ?? "",
      "Date of birth": "",
      Status: s.archived_at ? "Archived" : s.linked_user_id ? "Linked to portal account" : "Active",
      Anonymised: "",
      Added: fmtDate(s.created_at),
    })),
  ];
}

export function sessionRows(input: ExportInput): Dict[] {
  const { clientName, clientCode, stubName, stubCode } = nameMaps(input.clients, input.stubs);
  return [
    ...input.sessions.map((s) => {
      const id = s.client_id ? String(s.client_id) : "";
      return {
        Client: id ? (clientName.get(id) ?? "Unknown / removed") : "—",
        Codename: id ? (clientCode.get(id) ?? "") : "",
        When: fmtDate(s.scheduled_at),
        "Length (min)": s.duration_minutes ?? "",
        Status: s.status ?? "",
        Attendance: attendedLabel(s.attended as boolean | null),
        Paid: s.paid ? "Yes" : "No",
        "Paid at": fmtDate(s.paid_at),
        Price: money(s.price_pence as number | null),
        Location: s.location ?? "",
        Ref: s.reference_code ?? "",
        Kind: s.is_supervision ? "Supervision" : "Client session",
      };
    }),
    ...input.stubSessions.map((s) => {
      const id = String(s.stub_id ?? "");
      const pence =
        (s.price_pence as number | null) ?? (s.amount_paid != null ? Math.round(Number(s.amount_paid) * 100) : null);
      return {
        Client: stubName.get(id) ?? "Unknown offline client",
        Codename: stubCode.get(id) ?? "",
        When: fmtDate(s.scheduled_at),
        "Length (min)": s.duration_minutes ?? "",
        Status: s.status ?? "",
        Attendance: "—",
        Paid: s.paid ? "Yes" : "No",
        "Paid at": "",
        Price: money(pence),
        Location: s.location ?? "",
        Ref: s.code ?? "",
        Kind: "Offline session",
      };
    }),
  ];
}

export function noteRows(input: ExportInput): Dict[] {
  const { clientName, clientCode, stubName, stubCode } = nameMaps(input.clients, input.stubs);
  return input.notes.map((n) => {
    const uid = n.user_id ? String(n.user_id) : "";
    const sid = n.stub_id ? String(n.stub_id) : "";
    const who = uid
      ? (clientName.get(uid) ?? "Unknown / removed")
      : sid
        ? (stubName.get(sid) ?? "Unknown offline client")
        : "—";
    const code = uid ? (clientCode.get(uid) ?? "") : sid ? (stubCode.get(sid) ?? "") : "";

    let content: string;
    let state: string;
    if (!n.is_encrypted) {
      content = String(n.content ?? "");
      state = "No";
    } else if (input.decryptedNotes[String(n.id)] != null) {
      content = input.decryptedNotes[String(n.id)];
      state = "Yes (included)";
    } else {
      content = "[encrypted — unlock notes in the app and export again to include this]";
      state = "Yes (locked)";
    }
    return {
      Client: who,
      Codename: code,
      Written: fmtDate(n.created_at),
      "Linked session": n.session_id ? "Yes" : "No",
      Encrypted: state,
      Note: content,
    };
  });
}

/** Consolidated money-in: the manual `payments` table PLUS every paid session
 *  and paid offline session. The old export only read `payments`, so a practice
 *  that records income via the "paid" flag on sessions saw almost nothing. */
export function paymentRows(input: ExportInput): { rows: Dict[]; totalPence: number } {
  const { clientName, clientCode, stubName, stubCode } = nameMaps(input.clients, input.stubs);
  const rows: Dict[] = [];
  let totalPence = 0;

  const push = (
    client: string,
    codename: string,
    source: string,
    pence: number | null | undefined,
    description: string,
    date: string,
    recorded: string,
  ) => {
    if (pence != null) totalPence += Math.round(pence);
    rows.push({
      Client: client,
      Codename: codename,
      Source: source,
      "Amount (£)": poundsFromPence(pence),
      Description: description,
      Date: date,
      Recorded: recorded,
    });
  };

  for (const p of input.payments) {
    const cid = p.client_id ? String(p.client_id) : "";
    const sid = p.stub_id ? String(p.stub_id) : "";
    push(
      cid ? (clientName.get(cid) ?? "Unknown / removed") : sid ? (stubName.get(sid) ?? "Unknown offline client") : "—",
      cid ? (clientCode.get(cid) ?? "") : sid ? (stubCode.get(sid) ?? "") : "",
      "Manual payment",
      p.amount_pence as number | null,
      String(p.description ?? ""),
      fmtDate(p.paid_at),
      fmtDate(p.created_at),
    );
  }
  for (const s of input.sessions) {
    if (!s.paid) continue;
    const cid = s.client_id ? String(s.client_id) : "";
    push(
      cid ? (clientName.get(cid) ?? "Unknown / removed") : "—",
      cid ? (clientCode.get(cid) ?? "") : "",
      s.is_supervision ? "Supervision session" : "Session",
      s.price_pence as number | null,
      `Session${s.reference_code ? ` ${s.reference_code}` : ""} on ${fmtDate(s.scheduled_at)}`,
      fmtDate(s.paid_at),
      "",
    );
  }
  for (const s of input.stubSessions) {
    if (!s.paid) continue;
    const id = String(s.stub_id ?? "");
    const pence =
      (s.price_pence as number | null) ?? (s.amount_paid != null ? Math.round(Number(s.amount_paid) * 100) : null);
    push(
      stubName.get(id) ?? "Unknown offline client",
      stubCode.get(id) ?? "",
      "Offline session",
      pence,
      `Offline session${s.code ? ` ${s.code}` : ""} on ${fmtDate(s.scheduled_at)}`,
      "",
      "",
    );
  }

  rows.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
  rows.push({
    Client: "",
    Codename: "",
    Source: "TOTAL",
    "Amount (£)": Math.round(totalPence) / 100,
    Description: `${rows.length} payment${rows.length === 1 ? "" : "s"}`,
    Date: "",
    Recorded: "",
  });
  return { rows, totalPence };
}

// ── XLSX ────────────────────────────────────────────────────────────────────
function brandedSheet(XLSX: Libs["XLSX"], input: ExportInput, sheetName: string, rows: Dict[]) {
  const body = rows.length ? rows : [{ Note: "(no records)" }];
  const ws = XLSX.utils.aoa_to_sheet([
    [`${input.practiceName} — Clarity data export`],
    [`Generated ${input.exportedAt} UTC`],
    [sheetName],
    [],
  ]);
  XLSX.utils.sheet_add_json(ws, body, { origin: "A5" });
  ws["!cols"] = Object.keys(body[0]).map((k) => ({ wch: Math.min(48, Math.max(12, k.length + 4)) }));
  return ws;
}

function buildWorkbook(libs: Libs, input: ExportInput, sheets: { name: string; rows: Dict[] }[]): Uint8Array {
  const wb = libs.XLSX.utils.book_new();
  for (const s of sheets) {
    libs.XLSX.utils.book_append_sheet(wb, brandedSheet(libs.XLSX, input, s.name, s.rows), s.name);
  }
  return libs.XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

// ── PDF ─────────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
function drawSprout(doc: any, cx: number, cy: number, s: number, color: RGB = WHITE) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setLineWidth(s * 0.1);
  doc.line(cx, cy, cx, cy - s * 0.68);
  doc.ellipse(cx - s * 0.28, cy - s * 0.5, s * 0.3, s * 0.2, "F");
  doc.ellipse(cx + s * 0.28, cy - s * 0.5, s * 0.3, s * 0.2, "F");
}

function buildPdf(
  libs: Libs,
  input: ExportInput,
  title: string,
  tables: { heading: string; columns: string[]; rows: Dict[] }[],
): Uint8Array {
  const doc = new libs.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // deno-lint-ignore no-explicit-any
  const runAutoTable = (opts: any) => {
    if (libs.autoTable) return libs.autoTable(doc, opts);
    if (typeof doc.autoTable === "function") return doc.autoTable(opts);
    throw new Error("jspdf-autotable not available (no prototype method, no injected autoTable)");
  };

  // ── Cover ──
  doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.rect(0, 0, W, H, "F");
  drawSprout(doc, 22, 48, 14);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.setFont("times", "normal");
  doc.setFontSize(36);
  doc.text("Clarity", 36, 48);
  doc.setFontSize(22);
  doc.text(title, 20, 82);
  doc.setFontSize(13);
  doc.text(input.practiceName, 20, 94);
  doc.text(`Generated ${input.exportedAt} UTC`, 20, 102);
  doc.setFontSize(10);
  doc.text(
    "Confidential — contains personal data. Store securely and delete when it is no longer needed.",
    20,
    H - 18,
    { maxWidth: W - 40 },
  );

  // ── Content ──
  for (const t of tables) {
    doc.addPage();
    doc.setTextColor(40, 40, 40);
    doc.setFont("times", "normal");
    doc.setFontSize(13);
    doc.text(`${t.heading} — ${t.rows.length} row${t.rows.length === 1 ? "" : "s"}`, 14, 20);
    runAutoTable({
      startY: 24,
      head: [t.columns],
      body: t.rows.map((r) => t.columns.map((c) => String(r[c] ?? ""))),
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold" },
      margin: { top: 18, left: 14, right: 14 },
    });
  }

  // ── Chrome on every content page ──
  const pages = doc.getNumberOfPages();
  for (let p = 2; p <= pages; p++) {
    doc.setPage(p);
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.rect(0, 0, W, 12, "F");
    drawSprout(doc, 15, 8.6, 5);
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text("Clarity", 21, 8.6);
    doc.setFontSize(9);
    doc.text(title, W - 14, 8.6, { align: "right" });
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Confidential — ${input.practiceName}`, 14, H - 8);
    doc.text(`Page ${p - 1} of ${pages - 1}`, W - 14, H - 8, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

// ── README ──────────────────────────────────────────────────────────────────
function readme(input: ExportInput, meta: ReturnType<typeof exportCounts>): string {
  return [
    `${input.practiceName} — Clarity practice export`,
    `Generated ${input.exportedAt} UTC`,
    "",
    "Files",
    "  clarity-practice-export.xlsx   one sheet per record type (Clients, Sessions, Session notes, Payments)",
    "  clarity-practice-export.pdf    the same data, printable",
    "",
    "Records",
    `  Portal clients          ${meta.clients}`,
    `  Offline clients         ${meta.offline_clients}`,
    `  Sessions                ${meta.sessions}`,
    `  Session notes           ${meta.notes}  (${meta.notes_included} included, ${meta.notes_locked} still encrypted)`,
    `  Payments                ${meta.payments}  totalling ${money(meta.payments_total_pence)}`,
    `    from manual payments       ${meta.payments_manual}`,
    `    from paid sessions         ${meta.payments_from_sessions}`,
    `    from paid offline sessions ${meta.payments_from_offline_sessions}`,
    "",
    "Codenames",
    "  Every client row carries the codename your anonymised records use, so a",
    "  session or a payment can still be traced to a person after names are gone.",
    "",
    "Encrypted notes",
    "  Session notes are encrypted in your browser. Any that could not be",
    '  decrypted on the device you ran this from are marked "[encrypted — …]".',
    "  Unlock notes in the app and run the export again to include them.",
  ].join("\n");
}

function exportCounts(input: ExportInput, totalPence: number, paymentCount: number) {
  const notesLocked = input.notes.filter((n) => n.is_encrypted && input.decryptedNotes[String(n.id)] == null).length;
  return {
    clients: input.clients.length,
    // snake_case key kept for the existing e2e contract; the rest is extra detail.
    offline_clients: input.stubs.length,
    sessions: input.sessions.length + input.stubSessions.length,
    notes: input.notes.length,
    notes_locked: notesLocked,
    notes_included: input.notes.length - notesLocked,
    payments: paymentCount,
    payments_manual: input.payments.length,
    payments_from_sessions: input.sessions.filter((s) => s.paid).length,
    payments_from_offline_sessions: input.stubSessions.filter((s) => s.paid).length,
    payments_total_pence: totalPence,
  };
}

// ── Entry point ─────────────────────────────────────────────────────────────
export type ExportResult = {
  filename: string;
  zipBytes: Uint8Array;
  counts: ReturnType<typeof exportCounts>;
};

export async function buildExportZip(libs: Libs, input: ExportInput): Promise<ExportResult> {
  const clients = clientRows(input);
  const sessions = sessionRows(input);
  const notes = noteRows(input);
  const { rows: payments, totalPence } = paymentRows(input);
  const paymentCount = Math.max(0, payments.length - 1); // minus the TOTAL row
  const counts = exportCounts(input, totalPence, paymentCount);

  const xlsx = buildWorkbook(libs, input, [
    { name: "Clients", rows: clients },
    { name: "Sessions", rows: sessions },
    { name: "Session notes", rows: notes },
    { name: "Payments", rows: payments },
  ]);

  const pdf = buildPdf(libs, input, "Practice export", [
    {
      heading: "Clients",
      columns: ["Type", "Name", "Codename", "Email", "Date of birth", "Status", "Anonymised", "Added"],
      rows: clients,
    },
    {
      heading: "Sessions",
      columns: [
        "Client",
        "Codename",
        "When",
        "Length (min)",
        "Status",
        "Attendance",
        "Paid",
        "Paid at",
        "Price",
        "Location",
        "Ref",
        "Kind",
      ],
      rows: sessions,
    },
    {
      heading: "Session notes",
      columns: ["Client", "Codename", "Written", "Linked session", "Encrypted", "Note"],
      rows: notes,
    },
    {
      heading: "Payments",
      columns: ["Client", "Codename", "Source", "Amount (£)", "Description", "Date", "Recorded"],
      rows: payments,
    },
  ]);

  const stamp = input.exportedAt.slice(0, 10);
  const zip = new libs.JSZip();
  const folder = zip.folder(`clarity-export-${stamp}`)!;
  folder.file("clarity-practice-export.xlsx", xlsx);
  folder.file("clarity-practice-export.pdf", pdf);
  folder.file("README.txt", readme(input, counts));
  const zipBytes = (await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })) as Uint8Array;

  return { filename: `clarity-export-${stamp}.zip`, zipBytes, counts };
}
