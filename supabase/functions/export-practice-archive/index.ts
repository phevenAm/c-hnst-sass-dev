import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";
// Side-effect import: this patches jsPDF.prototype.autoTable — the ESM default
// export isn't reliably callable under Supabase's npm interop, so we call the
// prototype method instead.
import "npm:jspdf-autotable@3.8.2";
import JSZip from "npm:jszip@3.10.1";
import * as XLSX from "npm:xlsx@0.18.5";
import { PDF_COVER_JPEG } from "../_shared/coverImage.ts";

const TEAL: [number, number, number] = [31, 73, 64];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Full-practice data export, offered to an admin before they delete their
// account (deletion is permanent and takes the data with it — see
// delete_own_account + docs/legal/terms-of-service.md). Two bundles, each as
// .xlsx AND .pdf, zipped:
//   1. sessions-notes-clients-attendance  (Clients / Sessions / Session notes)
//   2. payments
//
// Session notes are client-side encrypted, so this function can't read their
// contents. The caller (DeleteUserModal) decrypts what it can and passes a
// { [noteId]: plaintext } map in `decrypted_notes`; anything missing is
// written as a placeholder rather than ciphertext.

type Dict = Record<string, unknown>;

const fmtDate = (v: string | null | undefined) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 16).replace("T", " ");
};
const money = (pence: number | null | undefined) => (pence == null ? "" : `£${(pence / 100).toFixed(2)}`);
const attendedLabel = (a: boolean | null) => (a === true ? "Attended" : a === false ? "No-show" : "—");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: profile } = await supabase.from("users").select("role, admin_id").eq("id", user.id).single();
    if (profile?.role !== "admin" || profile?.admin_id) {
      return new Response(JSON.stringify({ error: "Forbidden — practice owner only" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const decryptedNotes: Record<string, string> =
      body?.decrypted_notes && typeof body.decrypted_notes === "object" ? body.decrypted_notes : {};

    const adminId = user.id;

    // ── Gather ────────────────────────────────────────────────────────────
    const [clientsRes, stubsRes, sessionsRes, stubSessionsRes, notesRes, paymentsRes, practiceRes] = await Promise.all([
      supabase
        .from("users")
        .select(
          "id, first_name, last_name, display_name, admin_codename, email, dob, disabled, archived_at, archived_reason, anonymised_at, created_at",
        )
        .eq("admin_id", adminId),
      supabase
        .from("client_stubs")
        .select("id, first_name, last_name, codename, email, created_at, archived_at, linked_user_id")
        .eq("created_by", adminId),
      supabase
        .from("sessions")
        .select(
          "id, client_id, scheduled_at, duration_minutes, status, attended, paid, paid_at, price_pence, location, reference_code, is_supervision",
        )
        .eq("created_by", adminId)
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("stub_sessions")
        .select(
          "id, stub_id, scheduled_at, duration_minutes, status, paid, amount_paid, price_pence, location, code, notes",
        )
        .eq("admin_id", adminId)
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("session_notes")
        .select("id, session_id, user_id, stub_id, content, is_encrypted, created_at")
        .eq("admin_id", adminId)
        .order("created_at", { ascending: true }),
      supabase
        .from("payments")
        .select("id, client_id, stub_id, amount_pence, description, paid_at, created_at")
        .eq("admin_id", adminId)
        .order("paid_at", { ascending: true }),
      supabase.from("practice_settings").select("business_name").eq("admin_id", adminId).single(),
    ]);

    for (const r of [clientsRes, stubsRes, sessionsRes, stubSessionsRes, notesRes, paymentsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const clients = clientsRes.data ?? [];
    const stubs = stubsRes.data ?? [];
    const sessions = sessionsRes.data ?? [];
    const stubSessions = stubSessionsRes.data ?? [];
    const notes = notesRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const practiceName = practiceRes.data?.business_name || "Clarity practice";

    const clientName = new Map<string, string>();
    for (const c of clients) {
      const real = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      clientName.set(
        c.id,
        real || c.display_name || (c.admin_codename ? `${c.admin_codename} (codename)` : "Unnamed client"),
      );
    }
    const stubName = new Map<string, string>();
    for (const s of stubs) {
      const real = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
      stubName.set(s.id, real || (s.codename ? `${s.codename} (codename)` : "Unnamed offline client"));
    }

    // ── Rows ──────────────────────────────────────────────────────────────
    const clientRows: Dict[] = [
      ...clients.map((c) => ({
        Type: "Portal client",
        Name: clientName.get(c.id) ?? "",
        Email: c.email ?? "",
        "Date of birth": c.dob ?? "",
        Status: c.archived_at ? `Archived (${c.archived_reason ?? "—"})` : c.disabled ? "Paused" : "Active",
        Anonymised: c.anonymised_at ? "Yes" : "No",
        Added: fmtDate(c.created_at),
      })),
      ...stubs.map((s) => ({
        Type: "Offline client",
        Name: stubName.get(s.id) ?? "",
        Email: s.email ?? "",
        "Date of birth": "",
        Status: s.archived_at ? "Archived" : s.linked_user_id ? "Linked to portal account" : "Active",
        Anonymised: "",
        Added: fmtDate(s.created_at),
      })),
    ];

    const sessionRows: Dict[] = [
      ...sessions.map((s) => ({
        Client: s.client_id ? (clientName.get(s.client_id) ?? "Unknown / removed") : "—",
        When: fmtDate(s.scheduled_at),
        "Length (min)": s.duration_minutes ?? "",
        Status: s.status,
        Attendance: attendedLabel(s.attended),
        Paid: s.paid ? "Yes" : "No",
        "Paid at": fmtDate(s.paid_at),
        Price: money(s.price_pence),
        Location: s.location ?? "",
        Ref: s.reference_code ?? "",
        Kind: s.is_supervision ? "Supervision" : "Client session",
      })),
      ...stubSessions.map((s) => ({
        Client: stubName.get(s.stub_id) ?? "Unknown offline client",
        When: fmtDate(s.scheduled_at),
        "Length (min)": s.duration_minutes ?? "",
        Status: s.status,
        Attendance: "—",
        Paid: s.paid ? "Yes" : "No",
        "Paid at": "",
        Price: money(s.price_pence ?? (s.amount_paid != null ? Math.round(s.amount_paid * 100) : null)),
        Location: s.location ?? "",
        Ref: s.code ?? "",
        Kind: "Offline session",
      })),
    ];

    const noteRows: Dict[] = notes.map((n) => {
      const who = n.user_id
        ? (clientName.get(n.user_id) ?? "Unknown / removed")
        : n.stub_id
          ? (stubName.get(n.stub_id) ?? "Unknown offline client")
          : "—";
      let content: string;
      if (!n.is_encrypted) content = n.content ?? "";
      else if (decryptedNotes[n.id] != null) content = decryptedNotes[n.id];
      else content = "[encrypted — open this client's notes screen in the app to read or export]";
      return {
        Client: who,
        Written: fmtDate(n.created_at),
        "Linked session": n.session_id ? "Yes" : "No",
        Note: content,
      };
    });

    const paymentRows: Dict[] = payments.map((p) => ({
      Client: p.client_id
        ? (clientName.get(p.client_id) ?? "Unknown / removed")
        : p.stub_id
          ? (stubName.get(p.stub_id) ?? "Unknown offline client")
          : "—",
      Amount: money(p.amount_pence),
      Description: p.description ?? "",
      "Paid at": fmtDate(p.paid_at),
      Recorded: fmtDate(p.created_at),
    }));

    // ── XLSX bundle 1: clients + sessions + notes ─────────────────────────
    const wb1 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(clientRows), "Clients");
    XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(sessionRows), "Sessions");
    XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(noteRows), "Session notes");
    const xlsx1 = XLSX.write(wb1, { type: "array", bookType: "xlsx" }) as Uint8Array;

    // ── XLSX bundle 2: payments ──────────────────────────────────────────
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(paymentRows), "Payments");
    const xlsx2 = XLSX.write(wb2, { type: "array", bookType: "xlsx" }) as Uint8Array;

    // ── PDF helper ──────────────────────────────────────────────────────
    const exportedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
    const buildPdf = (title: string, tables: { heading: string; columns: string[]; rows: Dict[] }[]) => {
      const doc = new jsPDF({ orientation: "landscape" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      // ── Cover page (frosted login art + teal block) ──────────────
      // The cover JPEG is a portrait A4 crop; on this landscape page draw it
      // "cover"-fit (full width, overflowing top/bottom) so it isn't stretched.
      const coverH = W * 1.414;
      doc.addImage(PDF_COVER_JPEG, "JPEG", 0, (H - coverH) / 2, W, coverH, undefined, "FAST");
      const bandTop = H - 70;
      doc.setFillColor(...TEAL);
      doc.rect(0, bandTop, W, H - bandTop, "F");
      doc.setFont("times", "normal");
      doc.setFontSize(28);
      doc.setTextColor(255, 255, 255);
      doc.text("Clarity", 16, bandTop + 22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(`${practiceName} — ${title}`, 16, bandTop + 40);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(198, 216, 211);
      doc.text(`Exported ${exportedAt} UTC`, 16, bandTop + 52);

      doc.addPage();
      doc.setTextColor(45, 41, 38);
      let y = 24;
      for (const t of tables) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...TEAL);
        doc.text(`${t.heading} (${t.rows.length})`, 14, y);
        doc.setTextColor(45, 41, 38);
        doc.setFont("helvetica", "normal");
        // deno-lint-ignore no-explicit-any
        (doc as any).autoTable({
          startY: y + 3,
          head: [t.columns],
          body: t.rows.map((r) => t.columns.map((c) => String(r[c] ?? ""))),
          styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
          headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: "bold" },
          margin: { top: 22, left: 14, right: 14 },
        });
        // deno-lint-ignore no-explicit-any
        y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 10;
        if (y > 180) {
          doc.addPage();
          y = 24;
        }
      }

      // ── Header band + footer on every sheet except the cover ─────
      // deno-lint-ignore no-explicit-any
      const pages = (doc as any).internal.getNumberOfPages();
      for (let p = 2; p <= pages; p++) {
        doc.setPage(p);
        doc.setFillColor(...TEAL);
        doc.rect(0, 0, W, 14, "F");
        doc.setFont("times", "normal");
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text("Clarity", 14, 9.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`${practiceName} — ${title}`, W - 14, 9.5, { align: "right" });
        doc.setTextColor(120, 120, 120);
        doc.text(`Clarity · ${practiceName} — ${title} · Exported ${exportedAt} UTC`, 14, H - 8);
        doc.text(`Page ${p - 1} of ${pages - 1}`, W - 14, H - 8, { align: "right" });
      }
      return new Uint8Array(doc.output("arraybuffer"));
    };

    const pdf1 = buildPdf("clients, sessions & notes", [
      {
        heading: "Clients",
        columns: ["Type", "Name", "Email", "Date of birth", "Status", "Anonymised", "Added"],
        rows: clientRows,
      },
      {
        heading: "Sessions",
        columns: [
          "Client",
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
        rows: sessionRows,
      },
      { heading: "Session notes", columns: ["Client", "Written", "Linked session", "Note"], rows: noteRows },
    ]);
    const pdf2 = buildPdf("payments", [
      { heading: "Payments", columns: ["Client", "Amount", "Description", "Paid at", "Recorded"], rows: paymentRows },
    ]);

    // ── Zip ─────────────────────────────────────────────────────────────
    const stamp = new Date().toISOString().slice(0, 10);
    const zip = new JSZip();
    const folder = zip.folder(`clarity-export-${stamp}`)!;
    folder.file("clients-sessions-notes.xlsx", xlsx1);
    folder.file("clients-sessions-notes.pdf", pdf1);
    folder.file("payments.xlsx", xlsx2);
    folder.file("payments.pdf", pdf2);
    folder.file(
      "README.txt",
      [
        `${practiceName} — full data export`,
        `Exported ${exportedAt} UTC`,
        "",
        `Portal clients: ${clients.length}`,
        `Offline clients: ${stubs.length}`,
        `Sessions: ${sessions.length + stubSessions.length}`,
        `Session notes: ${notes.length}`,
        `Payments: ${payments.length}`,
        "",
        "Encrypted session notes that could not be decrypted in your browser are",
        "marked with a placeholder. Open each client's notes screen in the app to",
        "read or copy them before deleting your account.",
      ].join("\n"),
    );
    const zipBytes = (await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })) as Uint8Array;

    return new Response(
      JSON.stringify({
        success: true,
        filename: `clarity-export-${stamp}.zip`,
        mime: "application/zip",
        data_base64: encodeBase64(zipBytes),
        counts: {
          clients: clients.length,
          offline_clients: stubs.length,
          sessions: sessions.length + stubSessions.length,
          notes: notes.length,
          payments: payments.length,
        },
      }),
      { headers: corsHeaders },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
