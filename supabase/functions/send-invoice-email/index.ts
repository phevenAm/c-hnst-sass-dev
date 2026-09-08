import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, logEmail, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

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

    const { invoice_id, pdf_base64, pdf_filename } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "Missing invoice_id" }), { status: 400, headers: corsHeaders });
    }
    // The client renders the PDF (same code path as the download button) and
    // passes it here so the emailed copy is byte-identical to the downloaded one.
    const attachments =
      typeof pdf_base64 === "string" && pdf_base64.length > 0
        ? [{ filename: typeof pdf_filename === "string" ? pdf_filename : "invoice.pdf", content: pdf_base64 }]
        : undefined;

    // Invoice + lines — scoped to the calling admin.
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*, invoice_line_items(*)")
      .eq("id", invoice_id)
      .eq("admin_id", user.id)
      .single();
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: corsHeaders });
    }
    if (!invoice.client_id) {
      return new Response(JSON.stringify({ error: "Invoice has no linked client to email" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Recipient email lives in auth.users.
    const { data: authClient } = await supabase.auth.admin.getUserById(invoice.client_id);
    const to = authClient?.user?.email;
    if (!to) {
      return new Response(JSON.stringify({ error: "Client has no email address" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: clientRow } = await supabase
      .from("users")
      .select("first_name, last_name, display_name")
      .eq("id", invoice.client_id)
      .single();
    const clientName =
      clientRow?.display_name || [clientRow?.first_name, clientRow?.last_name].filter(Boolean).join(" ") || "there";

    const { data: settings } = await supabase
      .from("practice_settings")
      .select("business_name, counsellor_name, invoices_enabled, invoice_footer_text")
      .eq("admin_id", user.id)
      .maybeSingle();

    if (settings && settings.invoices_enabled === false) {
      return new Response(JSON.stringify({ error: "Invoicing is turned off for this practice" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // bank_* columns are encrypted at rest (20260907000050) — decrypt through
    // the SECURITY DEFINER RPC, which needs a real auth.uid(), so call it with
    // a client scoped to the requesting admin's JWT rather than the service key.
    const userScoped = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: bankRows } = await userScoped.rpc("get_practice_bank_details", { p_admin_id: user.id });
    const bank = Array.isArray(bankRows) ? bankRows[0] : bankRows;

    const practiceName = settings?.business_name || settings?.counsellor_name || "your counsellor";
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

    const lines = (invoice.invoice_line_items ?? []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order,
    );
    const lineRows = lines
      .map(
        (l: { description: string; quantity: number; unit_amount_pence: number }) =>
          `<tr>
            <td style="padding:6px 0;border-bottom:1px solid #e5e0dc;font-size:14px;color:#2d2520;">${escapeHtml(l.description || "—")}</td>
            <td style="padding:6px 0;border-bottom:1px solid #e5e0dc;font-size:14px;color:#5c4f48;text-align:right;">${l.quantity} × ${money(l.unit_amount_pence)}</td>
            <td style="padding:6px 0 6px 16px;border-bottom:1px solid #e5e0dc;font-size:14px;color:#2d2520;text-align:right;white-space:nowrap;">${money(Math.round(l.quantity * l.unit_amount_pence))}</td>
          </tr>`,
      )
      .join("");

    const paymentReference = bank?.bank_payment_reference || invoice.reference;
    const bankBits: { label: string; value: string }[] = [];
    if (bank?.bank_account_name) bankBits.push({ label: "Account name", value: bank.bank_account_name });
    if (bank?.bank_name) bankBits.push({ label: "Bank", value: bank.bank_name });
    if (bank?.bank_sort_code) bankBits.push({ label: "Sort code", value: bank.bank_sort_code });
    if (bank?.bank_account_number) bankBits.push({ label: "Account number", value: bank.bank_account_number });
    bankBits.push({ label: "Reference", value: paymentReference });

    const html = emailTemplate({
      label: "Invoice",
      title: `Invoice ${invoice.reference}`,
      body:
        para(`Hi ${escapeHtml(clientName)}, here is your invoice from ${escapeHtml(practiceName)}.`) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">${lineRows}
          <tr><td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#2d2520;">Total</td>
          <td></td>
          <td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#2d2520;text-align:right;">${money(invoice.total_pence)}</td></tr>
        </table>` +
        detailsTable([
          { label: "Issue date", value: invoice.issue_date },
          ...(invoice.due_date ? [{ label: "Due date", value: invoice.due_date, bold: true }] : []),
          ...bankBits,
        ]) +
        para(
          `When you pay, please quote the reference <strong>${escapeHtml(paymentReference)}</strong> so your payment can be matched to this invoice.`,
        ) +
        (invoice.notes ? para(escapeHtml(invoice.notes).replace(/\n/g, "<br/>")) : ""),
      cta: appUrl ? { label: "Open Clarity", url: `${appUrl}/invoices` } : undefined,
      footerNote:
        (settings?.invoice_footer_text ? `${escapeHtml(settings.invoice_footer_text)}<br/><br/>` : "") +
        `This invoice was sent to you by ${escapeHtml(practiceName)} via Clarity.`,
      counsellorName: settings?.counsellor_name ?? undefined,
    });

    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;

    let resendId: string | null = null;
    let status: "sent" | "failed" = "sent";
    let errorMessage: string | null = null;
    try {
      resendId = await sendEmail({
        to,
        subject: `Invoice ${invoice.reference} from ${practiceName}`,
        html,
        resendKey,
        fromEmail,
        attachments,
      });
    } catch (e) {
      status = "failed";
      errorMessage = e instanceof Error ? e.message : String(e);
    }

    await logEmail(supabase, {
      adminId: user.id,
      clientId: invoice.client_id,
      emailType: "invoice",
      recipientEmail: to,
      subject: `Invoice ${invoice.reference} from ${practiceName}`,
      resendEmailId: resendId,
      status,
      errorMessage,
    });

    if (status === "failed") {
      return new Response(JSON.stringify({ error: errorMessage }), { status: 502, headers: corsHeaders });
    }

    // Move draft → sent (leave an already-paid/void invoice alone).
    if (invoice.status === "draft" || invoice.status === "sent") {
      await supabase
        .from("invoices")
        .update({ status: "sent", sent_at: invoice.sent_at ?? new Date().toISOString() })
        .eq("id", invoice.id);
    }

    // Drop an in-app notification on the FIRST send so the client sees the
    // invoice without digging through their inbox — a resend doesn't re-notify.
    if (invoice.status === "draft") {
      await supabase.from("notifications").insert({
        user_id: invoice.client_id,
        type: "invoice",
        message: `New invoice ${invoice.reference} from ${practiceName} — ${money(invoice.total_pence)}`,
        url: "/invoices",
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
