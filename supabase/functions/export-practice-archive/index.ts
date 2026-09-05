import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";
// Side-effect import: patches jsPDF.prototype.autoTable — the ESM default
// export isn't reliably callable under Supabase's npm interop.
import "npm:jspdf-autotable@3.8.2";
import JSZip from "npm:jszip@3.10.1";
import * as XLSX from "npm:xlsx@0.18.5";
import { buildExportZip, type ExportInput } from "./buildDocs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Full-practice data export, offered to a practice owner before they delete
// their account (deletion is permanent and takes the data with it — see
// delete_own_account + docs/legal/terms-of-service.md). One .xlsx + one .pdf,
// zipped with a README:
//   Clients (with codenames) · Sessions · Session notes · Payments
//
// The Payments sheet consolidates every money-in signal: the manual `payments`
// table AND paid sessions AND paid offline sessions.
//
// Session notes are client-side encrypted, so this function can't read them.
// DeleteUserModal decrypts what the browser can and passes a
// { [noteId]: plaintext } map in `decrypted_notes`; the rest are marked locked.

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
        .select("id, session_id, user_id, stub_id, content, is_encrypted, note_iv, created_at")
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

    const input: ExportInput = {
      practiceName: practiceRes.data?.business_name || "Clarity practice",
      exportedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      clients: clientsRes.data ?? [],
      stubs: stubsRes.data ?? [],
      sessions: sessionsRes.data ?? [],
      stubSessions: stubSessionsRes.data ?? [],
      notes: notesRes.data ?? [],
      payments: paymentsRes.data ?? [],
      decryptedNotes,
    };

    const { filename, zipBytes, counts } = await buildExportZip({ XLSX, jsPDF, JSZip }, input);

    return new Response(
      JSON.stringify({
        success: true,
        filename,
        mime: "application/zip",
        data_base64: encodeBase64(zipBytes),
        counts,
      }),
      { headers: corsHeaders },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
