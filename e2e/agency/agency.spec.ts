// End-to-end coverage for the agency ("manage mode") feature's business
// rules and — most importantly — its multi-tenant security boundary.
//
// No mocking: real DB (via dbQuery, a privileged `supabase db query --linked`
// connection) and real RLS/auth via supabase-js sessions signed in as the
// actual test users, exactly like e2e/client-cap and e2e/settings. Two
// separate agencies (A and B) are built directly in the DB so each test can
// assert what a real, unprivileged session can and cannot see — hiding a
// button in the UI is not tested here on purpose; every assertion below goes
// straight at the table/RPC layer the UI itself would call.
//
// Cleanup order matters: agencies.owner_id is `on delete restrict`, so the
// agencies row (which cascades to agency_members/agency_invoices/etc.) must
// be deleted before the owner's auth.users row.

import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { APP_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

async function loginViaUi(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

const TAG = `e2eagency${Date.now()}`;
const PASSWORD = "E2eAgencyTest2026!";

type Ids = {
  agencyA: string;
  agencyB: string;
  aManager: string;
  aStaff: string;
  bManager: string;
  bStaff: string;
  aClient: string;
};

const ids: Ids = {} as Ids;

function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function signedInAs(email: string) {
  const supabase = client();
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return supabase;
}

test.beforeAll(() => {
  ids.aManager = createAuthUser({
    email: `${TAG}-a-mgr@clarity-e2e-test.dev`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "AgencyA", last_name: "Manager" },
  });
  ids.aStaff = createAuthUser({
    email: `${TAG}-a-staff@clarity-e2e-test.dev`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "AgencyA", last_name: "Staff" },
  });
  ids.bManager = createAuthUser({
    email: `${TAG}-b-mgr@clarity-e2e-test.dev`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "AgencyB", last_name: "Manager" },
  });
  ids.bStaff = createAuthUser({
    email: `${TAG}-b-staff@clarity-e2e-test.dev`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "AgencyB", last_name: "Staff" },
  });
  ids.aClient = createAuthUser({
    email: `${TAG}-a-client@clarity-e2e-test.dev`,
    password: PASSWORD,
    meta: { role: "client" },
  });

  const rows = dbQuery<{ label: string; id: string }>(`
    with agency_a as (
      insert into public.agencies (name, owner_id) values ('${TAG} Agency A', '${ids.aManager}') returning id
    ), agency_b as (
      insert into public.agencies (name, owner_id) values ('${TAG} Agency B', '${ids.bManager}') returning id
    ), mem_a_mgr as (
      insert into public.agency_members (agency_id, user_id, role, status)
      select id, '${ids.aManager}', 'manager', 'active' from agency_a returning agency_id
    ), mem_a_staff as (
      insert into public.agency_members (agency_id, user_id, role, status)
      select id, '${ids.aStaff}', 'counsellor', 'active' from agency_a returning agency_id
    ), mem_b_mgr as (
      insert into public.agency_members (agency_id, user_id, role, status)
      select id, '${ids.bManager}', 'manager', 'active' from agency_b returning agency_id
    ), mem_b_staff as (
      insert into public.agency_members (agency_id, user_id, role, status)
      select id, '${ids.bStaff}', 'counsellor', 'active' from agency_b returning agency_id
    ), upd_users as (
      update public.users set agency_id = case
        when id in ('${ids.aManager}', '${ids.aStaff}') then (select id from agency_a)
        when id in ('${ids.bManager}', '${ids.bStaff}') then (select id from agency_b)
      end
      where id in ('${ids.aManager}', '${ids.aStaff}', '${ids.bManager}', '${ids.bStaff}')
      returning id
    ), link_client as (
      update public.users set admin_id = '${ids.aStaff}' where id = '${ids.aClient}' returning id
    )
    select 'agencyA' as label, id from agency_a
    union all
    select 'agencyB' as label, id from agency_b;
  `).rows;

  ids.agencyA = rows.find((r) => r.label === "agencyA")!.id;
  ids.agencyB = rows.find((r) => r.label === "agencyB")!.id;
});

test.afterAll(() => {
  dbQuery(`delete from public.client_stubs where first_name = '${TAG}';`);
  dbQuery(`delete from public.agencies where id in ('${ids.agencyA}', '${ids.agencyB}');`);
  dbQuery(`delete from public.users where email like '${TAG}%@clarity-e2e-test.dev';`);
  dbQuery(`delete from auth.users where email like '${TAG}%@clarity-e2e-test.dev';`);
});

// ─── The critical test: Agency A cannot read or write Agency B's data ───────
test("security: an Agency A session cannot read or modify Agency B's data via the API/RLS", async () => {
  const asAManager = await signedInAs(`${TAG}-a-mgr@clarity-e2e-test.dev`);
  const asAStaff = await signedInAs(`${TAG}-a-staff@clarity-e2e-test.dev`);

  // Seed a client and an invoice inside Agency B (as B's own manager) so
  // there's something real for A to try (and fail) to reach.
  const asBManager = await signedInAs(`${TAG}-b-mgr@clarity-e2e-test.dev`);
  const { data: bStub, error: bStubErr } = await asBManager
    .from("client_stubs")
    .insert({ agency_id: ids.agencyB, first_name: TAG, last_name: "bclient", created_by: ids.bManager })
    .select("id")
    .single();
  expect(bStubErr).toBeNull();

  const { data: bNumber } = await asBManager.rpc("allocate_agency_invoice_number");
  const { data: bInvoice, error: bInvoiceErr } = await asBManager
    .from("agency_invoices")
    .insert({
      agency_id: ids.agencyB,
      staff_user_id: ids.bStaff,
      issued_by: ids.bManager,
      number: bNumber,
      reference: `B-${bNumber}`,
      amount_pence: 5000,
    })
    .select("id")
    .single();
  expect(bInvoiceErr).toBeNull();

  for (const asA of [asAManager, asAStaff]) {
    // Agency row itself
    const { data: agencyRow } = await asA.from("agencies").select("*").eq("id", ids.agencyB);
    expect(agencyRow ?? []).toHaveLength(0);

    // Membership roster
    const { data: memberRows } = await asA.from("agency_members").select("*").eq("agency_id", ids.agencyB);
    expect(memberRows ?? []).toHaveLength(0);

    // Clients
    const { data: clientRows } = await asA.from("client_stubs").select("*").eq("id", bStub!.id);
    expect(clientRows ?? []).toHaveLength(0);

    // Invoices
    const { data: invoiceRows } = await asA.from("agency_invoices").select("*").eq("id", bInvoice!.id);
    expect(invoiceRows ?? []).toHaveLength(0);

    // Write attempt: renaming Agency B
    const { data: renamed } = await asA.from("agencies").update({ name: "hacked" }).eq("id", ids.agencyB).select();
    expect(renamed ?? []).toHaveLength(0);
  }

  // Confirm the write attempt truly did nothing (not just an empty response).
  const stillB = dbQuery<{ name: string }>(`select name from public.agencies where id = '${ids.agencyB}';`).rows[0];
  expect(stillB.name).toBe(`${TAG} Agency B`);

  // A manager also can't call the manager-only mark-paid RPC against B's invoice.
  const { error: markErr } = await asAManager.rpc("mark_agency_invoice_paid", { p_invoice_id: bInvoice!.id });
  expect(markErr).not.toBeNull();
});

// ─── Staff-count plan limit: boundary at the tier's max_staff ───────────────
test("staff-count plan limit blocks the seat past the tier cap, and paused seats don't count", () => {
  test.setTimeout(180_000); // 8 createAuthUser calls + cleanup — heaviest test in the file
  dbQuery(`update public.agencies set subscription_plan = 'starter' where id = '${ids.agencyA}';`); // max_staff = 10

  // 2 active already (aManager, aStaff) — fill to exactly 10.
  const fillerIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const uid = createAuthUser({
      email: `${TAG}-a-filler${i}@clarity-e2e-test.dev`,
      password: PASSWORD,
      meta: { role: "admin" },
    });
    fillerIds.push(uid);
    dbQuery(
      `insert into public.agency_members (agency_id, user_id, role, status) values ('${ids.agencyA}', '${uid}', 'counsellor', 'active');`,
    );
  }
  expect(Number(dbQuery<{ n: number }>(`select public.active_staff_count('${ids.agencyA}') as n;`).rows[0].n)).toBe(10);

  // The 11th active member is blocked by the DB trigger.
  const eleventh = createAuthUser({
    email: `${TAG}-a-eleventh@clarity-e2e-test.dev`,
    password: PASSWORD,
    meta: { role: "admin" },
  });
  let threw = "";
  try {
    dbQuery(
      `insert into public.agency_members (agency_id, user_id, role, status) values ('${ids.agencyA}', '${eleventh}', 'counsellor', 'active');`,
    );
  } catch (e) {
    threw = String(e);
  }
  expect(threw).toContain("AGENCY_PLAN_LIMIT");

  // Pausing a filler frees the seat — the 11th can now join.
  dbQuery(`update public.agency_members set status = 'disabled' where user_id = '${fillerIds[0]}';`);
  expect(Number(dbQuery<{ n: number }>(`select public.active_staff_count('${ids.agencyA}') as n;`).rows[0].n)).toBe(9);
  dbQuery(
    `insert into public.agency_members (agency_id, user_id, role, status) values ('${ids.agencyA}', '${eleventh}', 'counsellor', 'active');`,
  );
  expect(Number(dbQuery<{ n: number }>(`select public.active_staff_count('${ids.agencyA}') as n;`).rows[0].n)).toBe(10);

  // Cleanup this test's own extra members/users so later tests see a clean count.
  const allExtra = [...fillerIds, eleventh];
  dbQuery(`delete from public.agency_members where user_id in ('${allExtra.join("','")}');`);
  dbQuery(`delete from public.users where id in ('${allExtra.join("','")}');`);
  dbQuery(`delete from auth.users where id in ('${allExtra.join("','")}');`);
  dbQuery(`update public.agencies set subscription_plan = 'unlimited' where id = '${ids.agencyA}';`);
});

// ─── Codename policy: enforced, not just a disabled switch ──────────────────
test("codename policy forces the setting on for every member and blocks turning it back off", () => {
  dbQuery(`update public.agencies set require_client_codenames = true where id = '${ids.agencyA}';`);

  const staffRow = dbQuery<{ use_client_codenames: boolean }>(
    `select use_client_codenames from public.practice_settings where admin_id = '${ids.aStaff}';`,
  ).rows[0];
  expect(staffRow.use_client_codenames).toBe(true); // cascaded on immediately, not just for new joiners

  let threw = "";
  try {
    dbQuery(`update public.practice_settings set use_client_codenames = false where admin_id = '${ids.aStaff}';`);
  } catch (e) {
    threw = String(e);
  }
  expect(threw).toContain("AGENCY_POLICY_CODENAMES");

  // Turning the agency policy off releases the lock — staff's own setting applies again.
  dbQuery(`update public.agencies set require_client_codenames = false where id = '${ids.agencyA}';`);
  dbQuery(`update public.practice_settings set use_client_codenames = false where admin_id = '${ids.aStaff}';`);
  const after = dbQuery<{ use_client_codenames: boolean }>(
    `select use_client_codenames from public.practice_settings where admin_id = '${ids.aStaff}';`,
  ).rows[0];
  expect(after.use_client_codenames).toBe(false);
});

// ─── Consent lock: a locked member's clients see the AGENCY's text ──────────
test("locked agency consent overrides the member's own consent text for their clients", async () => {
  dbQuery(
    `update public.agencies set locked_consent = true, consent_text = '${TAG} agency-wide terms' where id = '${ids.agencyA}';`,
  );
  dbQuery(
    `update public.practice_settings set consent_enabled = false, consent_body = 'my own terms' where admin_id = '${ids.aStaff}';`,
  );

  const asClient = await signedInAs(`${TAG}-a-client@clarity-e2e-test.dev`);
  const { data, error } = await asClient.rpc("get_my_admin_consent_settings");
  expect(error).toBeNull();
  const row = Array.isArray(data) ? data[0] : data;
  expect(row.consent_enabled).toBe(true);
  expect(row.consent_body).toBe(`${TAG} agency-wide terms`);
});

// ─── Working agreement: mandatory acceptance gates joining the agency ───────
test("a mandatory working agreement blocks joining until accepted, then records the version signed", () => {
  test.setTimeout(90_000); // several sequential dbQuery/CLI round trips — see e2e/client-cap.spec.ts for the same reasoning
  dbQuery(
    `update public.agencies set staff_agreement_required = true, agreement_text = '${TAG} sign here' where id = '${ids.agencyA}';`,
  );
  const version = Number(
    dbQuery<{ agreement_version: number }>(`select agreement_version from public.agencies where id = '${ids.agencyA}';`)
      .rows[0].agreement_version,
  );

  const newHire = createAuthUser({
    email: `${TAG}-a-newhire@clarity-e2e-test.dev`,
    password: PASSWORD,
    meta: { role: "admin" },
  });
  const token = dbQuery<{ token: string }>(
    `insert into public.agency_invite_token (agency_id, email, role, created_by)
     values ('${ids.agencyA}', '${TAG}-a-newhire@clarity-e2e-test.dev', 'counsellor', '${ids.aManager}')
     returning token;`,
  ).rows[0].token;

  const asNewHire = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Sign in via a throwaway session — createAuthUser doesn't need email confirm.
  return (async () => {
    const { error: signInErr } = await asNewHire.auth.signInWithPassword({
      email: `${TAG}-a-newhire@clarity-e2e-test.dev`,
      password: PASSWORD,
    });
    expect(signInErr).toBeNull();

    const { error: rejectedErr } = await asNewHire.rpc("consume_agency_invite", {
      input_token: token,
      p_agreement_accepted: false,
    });
    expect(rejectedErr?.message ?? "").toContain("AGREEMENT_NOT_ACCEPTED");
    expect(
      dbQuery<{ n: number }>(`select count(*)::int as n from public.agency_members where user_id = '${newHire}';`)
        .rows[0].n,
    ).toBe(0);

    const { data: accepted, error: acceptedErr } = await asNewHire.rpc("consume_agency_invite", {
      input_token: token,
      p_agreement_accepted: true,
      p_signed_name: "New Hire",
    });
    expect(acceptedErr).toBeNull();
    expect(accepted.ok).toBe(true);

    const memberRow = dbQuery<{ agreement_accepted_version: number; agreement_signed_name: string }>(
      `select agreement_accepted_version, agreement_signed_name from public.agency_members where user_id = '${newHire}';`,
    ).rows[0];
    expect(memberRow.agreement_accepted_version).toBe(version);
    expect(memberRow.agreement_signed_name).toBe("New Hire");

    dbQuery(`delete from public.agency_members where user_id = '${newHire}';`);
    dbQuery(`delete from public.users where id = '${newHire}';`);
    dbQuery(`delete from auth.users where id = '${newHire}';`);
  })();
});

// ─── Agency invoices: correct payer, RLS-scoped visibility, valid lifecycle ─
test("agency invoices resolve to the right staff member, staff see only their own, and status moves through its lifecycle", async () => {
  test.setTimeout(60_000);
  const asAManager = await signedInAs(`${TAG}-a-mgr@clarity-e2e-test.dev`);
  const asAStaff = await signedInAs(`${TAG}-a-staff@clarity-e2e-test.dev`);

  const { data: number } = await asAManager.rpc("allocate_agency_invoice_number");
  const { data: invoice, error: createErr } = await asAManager
    .from("agency_invoices")
    .insert({
      agency_id: ids.agencyA,
      staff_user_id: ids.aStaff,
      issued_by: ids.aManager,
      number,
      reference: `A-${number}`,
      amount_pence: 4200,
      description: `${TAG} seat fee`,
    })
    .select("*")
    .single();
  expect(createErr).toBeNull();
  expect(invoice.staff_user_id).toBe(ids.aStaff);
  expect(invoice.status).toBe("draft");

  // The staff member it's addressed to can read it…
  const { data: ownView } = await asAStaff.from("agency_invoices").select("*").eq("id", invoice.id);
  expect(ownView).toHaveLength(1);

  // …but cannot mark it paid (manager-only RPC) or edit it (no manager RLS grant for staff).
  const { error: staffMarkErr } = await asAStaff.rpc("mark_agency_invoice_paid", { p_invoice_id: invoice.id });
  expect(staffMarkErr).not.toBeNull();
  const { data: staffEdit } = await asAStaff
    .from("agency_invoices")
    .update({ amount_pence: 1 })
    .eq("id", invoice.id)
    .select();
  expect(staffEdit ?? []).toHaveLength(0);

  // Manager moves it through its lifecycle.
  await asAManager
    .from("agency_invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoice.id);
  const { error: paidErr } = await asAManager.rpc("mark_agency_invoice_paid", { p_invoice_id: invoice.id });
  expect(paidErr).toBeNull();
  const final = dbQuery<{ status: string; paid_at: string | null }>(
    `select status, paid_at from public.agency_invoices where id = '${invoice.id}';`,
  ).rows[0];
  expect(final.status).toBe("paid");
  expect(final.paid_at).not.toBeNull();

  dbQuery(`delete from public.agency_invoices where id = '${invoice.id}';`);
});

// ─── A brand-new agency member must land in the app, not a billing dead-end ─
// Regression: SubscriptionGate/AdminSetupGate (Router.tsx) didn't know about
// agency membership, so a freshly-joined counsellor — who starts with the
// same practice_settings defaults as any new signup (subscription_status
// 'inactive', onboarding_required true) — got bounced to /subscribe or
// /admin/setup instead of their dashboard. Caught by actually driving a
// browser through login, not by asserting on the RPC/table layer alone.
test("a freshly-joined agency staff member reaches /admin, not /subscribe or /admin/setup", async ({ page }) => {
  test.setTimeout(60_000);
  const newStaffId = createAuthUser({
    email: `${TAG}-a-freshstaff@clarity-e2e-test.dev`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Fresh", last_name: "Staff" },
  });
  dbQuery(`
    insert into public.agency_members (agency_id, user_id, role, status)
    values ('${ids.agencyA}', '${newStaffId}', 'counsellor', 'active');
    update public.users set agency_id = '${ids.agencyA}' where id = '${newStaffId}';
  `);

  const row = dbQuery<{ subscription_status: string; onboarding_required: boolean }>(
    `select subscription_status, onboarding_required from public.practice_settings where admin_id = '${newStaffId}';`,
  ).rows[0];
  expect(row.subscription_status).not.toBe("active");
  expect(row.onboarding_required).toBe(true);

  await loginViaUi(page, `${TAG}-a-freshstaff@clarity-e2e-test.dev`, PASSWORD);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });

  dbQuery(`delete from public.agency_members where user_id = '${newStaffId}';`);
  dbQuery(`delete from public.users where id = '${newStaffId}';`);
  dbQuery(`delete from auth.users where id = '${newStaffId}';`);
});
