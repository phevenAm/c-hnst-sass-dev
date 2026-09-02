import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Manager assigns an intake stub to a member admin. Creates a PENDING
// client_assignments row (the partial unique index rejects a second live one)
// and pings the admin, who accepts/declines via respond-to-assignment.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: membership } = await supabase
      .from("agency_members")
      .select("agency_id, role, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || membership.role !== "manager" || membership.status !== "active") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const stubId = body?.stub_id as string | undefined;
    const toAdminId = body?.to_admin_id as string | undefined;
    const ratePence = body?.rate_pence === null || body?.rate_pence === undefined ? null : Number(body.rate_pence);
    const availabilityNote = typeof body?.availability_note === "string" ? body.availability_note : null;
    const intakeNote = typeof body?.intake_note === "string" ? body.intake_note : null;
    if (!stubId || !toAdminId) {
      return new Response(JSON.stringify({ error: "stub_id and to_admin_id are required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // stub must belong to this agency; target must be an active member of it.
    const [{ data: stub }, { data: target }] = await Promise.all([
      supabase.from("client_stubs").select("id, first_name, last_name, agency_id").eq("id", stubId).maybeSingle(),
      supabase.from("agency_members").select("user_id, status").eq("user_id", toAdminId).maybeSingle(),
    ]);
    if (!stub || stub.agency_id !== membership.agency_id) {
      return new Response(JSON.stringify({ error: "Client not found in this agency" }), {
        status: 404,
        headers: corsHeaders,
      });
    }
    if (!target || target.status !== "active") {
      return new Response(JSON.stringify({ error: "That admin is not an active member" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: assignment, error: assignErr } = await supabase
      .from("client_assignments")
      .insert({
        stub_id: stubId,
        agency_id: membership.agency_id,
        from_manager_id: user.id,
        to_admin_id: toAdminId,
        rate_pence: Number.isFinite(ratePence) ? ratePence : null,
        availability_note: availabilityNote,
        intake_note: intakeNote,
      })
      .select("id")
      .single();
    if (assignErr) {
      // 23505 = the partial unique index: a live assignment already exists.
      const conflict = (assignErr as { code?: string }).code === "23505";
      return new Response(
        JSON.stringify({
          error: conflict ? "That client already has a pending or active assignment" : assignErr.message,
        }),
        { status: conflict ? 409 : 500, headers: corsHeaders },
      );
    }

    const clientName = `${stub.first_name} ${stub.last_name}`.trim();

    await supabase.from("notifications").insert({
      user_id: toAdminId,
      type: "client_assignment",
      message: `New client to review: ${clientName}`,
    });

    // Best-effort email — don't fail the assignment if mail is down / unconfigured.
    const { data: targetUser } = await supabase.auth.admin.getUserById(toAdminId);
    const targetEmail = targetUser?.user?.email;
    if (targetEmail && resendKey && fromEmail) {
      const reviewUrl = `${appUrl}/admin/clients?review=${assignment.id}`;
      const html = emailTemplate({
        label: "New client",
        title: "A client has been assigned to you",
        body: [
          para(`Your agency has assigned <strong>${clientName}</strong> to you for review.`),
          ...(intakeNote ? [noteBox(intakeNote)] : []),
          para("Open Clarity to see the intake details and accept or decline."),
        ].join(""),
        cta: { label: "Review client", url: reviewUrl },
        footerNote: "You're receiving this because you're a member of an agency on Clarity.",
      });
      try {
        const id = await sendEmail({
          to: targetEmail,
          subject: `New client to review: ${clientName}`,
          html,
          resendKey,
          fromEmail,
        });
        await logEmail(supabase, {
          adminId: toAdminId,
          emailType: "agency_client_assigned",
          recipientEmail: targetEmail,
          subject: `New client to review: ${clientName}`,
          resendEmailId: id,
          status: "sent",
        });
      } catch (_e) {
        /* swallow */
      }
    }

    return new Response(JSON.stringify({ ok: true, assignment_id: assignment.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("assign-client ERROR:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
