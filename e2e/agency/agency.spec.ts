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

// OnboardingModal's "Welcome, …!" personalize-your-space gate is separate
// from the walkthrough tour (already suppressed via localStorage above) and
// only mounts once userProfile/practiceSettings finish loading, so a single
// isVisible() check right after navigation can run before it appears. Poll
// like split-button-visibility.spec.ts's dismissOnboarding does.
async function dismissWelcomeModal(page: Page) {
  const heading = page.locator('h2:has-text("Welcome,")');
  for (let i = 0; i < 8; i++) {
    if (!(await heading.isVisible({ timeout: 800 }).catch(() => false))) return;
    const btn = page.locator('button:has-text("Save")').first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) await btn.click();
    await page.waitForTimeout(500);
  }
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
    email: `smissah321+${TAG}-a-mgr@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "AgencyA", last_name: "Manager" },
  });
  ids.aStaff = createAuthUser({
    email: `smissah321+${TAG}-a-staff@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "AgencyA", last_name: "Staff" },
  });
  ids.bManager = createAuthUser({
    email: `smissah321+${TAG}-b-mgr@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "AgencyB", last_name: "Manager" },
  });
  ids.bStaff = createAuthUser({
    email: `smissah321+${TAG}-b-staff@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "AgencyB", last_name: "Staff" },
  });
  ids.aClient = createAuthUser({
    email: `smissah321+${TAG}-a-client@gmail.com`,
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
  dbQuery(`delete from public.users where email like 'smissah321+${TAG}%@gmail.com';`);
  dbQuery(`delete from auth.users where email like 'smissah321+${TAG}%@gmail.com';`);
});

// ─── The critical test: Agency A cannot read or write Agency B's data ───────
test("security: an Agency A session cannot read or modify Agency B's data via the API/RLS", async () => {
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);

  // Seed a client and an invoice inside Agency B (as B's own manager) so
  // there's something real for A to try (and fail) to reach.
  const asBManager = await signedInAs(`smissah321+${TAG}-b-mgr@gmail.com`);
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
      email: `smissah321+${TAG}-a-filler${i}@gmail.com`,
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
    email: `smissah321+${TAG}-a-eleventh@gmail.com`,
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

  const asClient = await signedInAs(`smissah321+${TAG}-a-client@gmail.com`);
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
    email: `smissah321+${TAG}-a-newhire@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin" },
  });
  const token = dbQuery<{ token: string }>(
    `insert into public.agency_invite_token (agency_id, email, role, created_by)
     values ('${ids.agencyA}', 'smissah321+${TAG}-a-newhire@gmail.com', 'counsellor', '${ids.aManager}')
     returning token;`,
  ).rows[0].token;

  const asNewHire = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Sign in via a throwaway session — createAuthUser doesn't need email confirm.
  return (async () => {
    const { error: signInErr } = await asNewHire.auth.signInWithPassword({
      email: `smissah321+${TAG}-a-newhire@gmail.com`,
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
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);

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
    email: `smissah321+${TAG}-a-freshstaff@gmail.com`,
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

  await loginViaUi(page, `smissah321+${TAG}-a-freshstaff@gmail.com`, PASSWORD);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });

  dbQuery(`delete from public.agency_members where user_id = '${newStaffId}';`);
  dbQuery(`delete from public.users where id = '${newStaffId}';`);
  dbQuery(`delete from auth.users where id = '${newStaffId}';`);
});

// ─── Agency ⇄ staff settlement direction: override > pinned default > auto ──
// Backs 20260907000032. Asserts the DB resolver the FE mirrors
// (src/pages/agency/AgencySettingsPage/settlement.ts) and that the overview
// RPC the Settings screen calls is manager-gated.
test("settlement direction resolves override > agency default > employment type; overview RPC is manager-only", async () => {
  test.setTimeout(120_000);
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const asBManager = await signedInAs(`smissah321+${TAG}-b-mgr@gmail.com`);

  // Resolve through the authenticated RPC. agency_member_settlement() is
  // tenant-scoped to auth.uid()'s agency (20260908000010), so a bare
  // unauthenticated dbQuery would now return NULL — call it as the manager.
  const resolved = async () => {
    const { data, error } = await asAManager.rpc("agency_member_settlement", { p_user: ids.aStaff });
    expect(error).toBeNull();
    return data as string;
  };

  // Baseline: agency default 'auto', no per-member override, staff is freelance.
  dbQuery(`update public.agencies set default_settlement_direction = 'auto' where id = '${ids.agencyA}';`);
  dbQuery(
    `update public.agency_members set settlement_direction = null, employment_type = 'freelance' where user_id = '${ids.aStaff}';`,
  );
  expect(await resolved()).toBe("staff_pays_agency"); // auto + freelance

  dbQuery(`update public.agency_members set employment_type = 'employee' where user_id = '${ids.aStaff}';`);
  expect(await resolved()).toBe("agency_pays_staff"); // auto + employee

  dbQuery(`update public.agencies set default_settlement_direction = 'none' where id = '${ids.agencyA}';`);
  expect(await resolved()).toBe("none"); // pinned default beats employment type

  dbQuery(
    `update public.agency_members set settlement_direction = 'staff_pays_agency' where user_id = '${ids.aStaff}';`,
  );
  expect(await resolved()).toBe("staff_pays_agency"); // per-member override beats everything

  // Tenant scoping: Agency B's manager cannot resolve an Agency A member.
  const { data: crossAgency } = await asBManager.rpc("agency_member_settlement", { p_user: ids.aStaff });
  expect(crossAgency).toBeNull();

  // agency_settlement_overview(): manager gets a row per active member with the
  // resolved direction; a counsellor is rejected.
  const { data: overview, error: ovErr } = await asAManager.rpc("agency_settlement_overview");
  expect(ovErr).toBeNull();
  const staffRow = (overview as { user_id: string; effective_direction: string; override: string | null }[]).find(
    (r) => r.user_id === ids.aStaff,
  );
  expect(staffRow?.effective_direction).toBe("staff_pays_agency");
  expect(staffRow?.override).toBe("staff_pays_agency");

  const { error: staffOvErr } = await asAStaff.rpc("agency_settlement_overview");
  expect(staffOvErr).not.toBeNull();

  // Reset for later serial tests.
  dbQuery(
    `update public.agency_members set settlement_direction = null, employment_type = 'freelance' where user_id = '${ids.aStaff}';`,
  );
  dbQuery(`update public.agencies set default_settlement_direction = 'auto' where id = '${ids.agencyA}';`);
});

// ─── Agency activity feed: governance events, member filter, manager-only,
// tenant-scoped ───────────────────────────────────────────────────────────
// Backs 20260907000033 — the triggers and agency_activity_feed() RPC the
// manager-only /agency/activity page renders.
test("agency activity feed captures governance events, filters by member, and never crosses agencies", async () => {
  test.setTimeout(120_000);
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const asBManager = await signedInAs(`smissah321+${TAG}-b-mgr@gmail.com`);

  const ref = `ACT-${Date.now().toString().slice(-6)}`;

  // Fire the governance triggers directly at the table layer (a manager doing
  // the same things through the app produces identical rows) — an invoice
  // raised then marked paid, and a policy switch.
  dbQuery(`
    insert into public.agency_invoices
      (agency_id, staff_user_id, issued_by, number, reference, amount_pence, direction)
    values ('${ids.agencyA}', '${ids.aStaff}', '${ids.aManager}', 9911, '${ref}', 3300, 'staff_to_agency');
    update public.agency_invoices
      set status = 'paid', paid_at = now(), payment_method = 'cash'
      where agency_id = '${ids.agencyA}' and reference = '${ref}';
    update public.agencies set shared_resources = not shared_resources where id = '${ids.agencyA}';
  `);

  // The events table itself got the rows (trigger coverage, no auth involved).
  const eventTypes = dbQuery<{ event_type: string }>(
    `select event_type from public.agency_activity_events where agency_id = '${ids.agencyA}' order by created_at;`,
  ).rows.map((r) => r.event_type);
  expect(eventTypes).toContain("invoice.raised");
  expect(eventTypes).toContain("invoice.paid");
  expect(eventTypes).toContain("policy.changed");

  // The manager-only feed RPC surfaces them, newest-first, with summaries.
  type FeedRow = { source: string; actor_id: string | null; summary: string };
  const { data: feed, error: feedErr } = await asAManager.rpc("agency_activity_feed", { p_limit: 300 });
  expect(feedErr).toBeNull();
  const summaries = (feed as FeedRow[]).map((r) => r.summary).join("\n");
  expect(summaries).toContain(ref); // invoice.raised
  expect(summaries.toLowerCase()).toContain("marked paid"); // invoice.paid
  expect(summaries.toLowerCase()).toContain("shared resource library"); // policy.changed

  // Member filter narrows to that actor.
  const { data: filtered } = await asAManager.rpc("agency_activity_feed", {
    p_member: ids.aManager,
    p_limit: 300,
  });
  expect((filtered as FeedRow[]).every((r) => r.actor_id === ids.aManager)).toBe(true);

  // A plain counsellor can't read the feed at all.
  const { error: staffErr } = await asAStaff.rpc("agency_activity_feed", {});
  expect(staffErr).not.toBeNull();

  // Agency B's manager sees their own feed — never Agency A's events.
  const { data: bFeed, error: bErr } = await asBManager.rpc("agency_activity_feed", { p_limit: 300 });
  expect(bErr).toBeNull();
  expect((bFeed as FeedRow[]).some((r) => r.summary.includes(ref))).toBe(false);

  dbQuery(`
    delete from public.agency_invoices where agency_id = '${ids.agencyA}' and reference = '${ref}';
    delete from public.agency_activity_events where agency_id = '${ids.agencyA}';
  `);
});

// ─── 2026-09-14 regressions ──────────────────────────────────────────────
// A manager's OWN employment_type can be "employee" (they're not literally
// freelance) — SettingsPage's isAgencyEmployee gate must key off role, not
// just employment_type, or a manager gets locked out of their own agency's
// business/email settings. See src/pages/common/SettingsPage.
test("an agency manager (not just freelance staff) keeps control of Business info and Emails in Settings", async ({
  page,
}) => {
  await loginViaUi(page, `smissah321+${TAG}-a-mgr@gmail.com`, PASSWORD);
  await page.goto(`${APP_URL}/settings?tab=practice`, { waitUntil: "load", timeout: 20_000 });
  // A locked-out employee sees static "Employed staff don't set their own…"
  // copy instead of the real form — the manager must see the real input.
  await expect(page.locator('input, label:has-text("Business name")').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/don't set their own/i)).toHaveCount(0);

  await page.goto(`${APP_URL}/settings?tab=emails`, { waitUntil: "load", timeout: 20_000 });
  await expect(page.getByText("Session reminder")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/configured by/i)).toHaveCount(0);
});

// plan_change_check (feeds ClientCapBanner) must exempt agency members the
// same way the hard enforcement triggers already do (20260902010007) — an
// agency admin has no personal subscription, so practice_settings.
// subscription_plan is unset and previously defaulted to Starter's 5-client
// cap, showing a false "over your plan limit" warning. See migration
// 20260914000020_agency_skip_plan_change_check.
test("plan_change_check returns no cap for an agency member", async () => {
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);
  const { data, error } = await asAManager.rpc("plan_change_check", { p_target: "starter" });
  expect(error).toBeNull();
  expect(data.max_active).toBeNull();
  expect(data.max_archived).toBeNull();
  expect(data.ok).toBe(true);
});

// AgencyMemberDetailPage used to hide its whole "Configure member" entry
// point with `{!owner && …}` — meant only to withhold "Remove from agency"
// (correctly blocked for the owner, server-side too, in
// remove-agency-member) — which also blocked Role/Counselling/Active/Colour,
// including the colour swatches, which set-agency-member always allowed for
// the owner. See ConfigureMemberModal's isOwner prop.
test("the agency owner can reach Configure member and change their calendar colour", async ({ page }) => {
  await loginViaUi(page, `smissah321+${TAG}-a-mgr@gmail.com`, PASSWORD);
  await page.goto(`${APP_URL}/agency/members/${ids.aManager}`, { waitUntil: "load", timeout: 20_000 });
  // The cold-load boot splash (app.html #boot-splash) sits on top of
  // everything until the app hides it — wait it out before touching the
  // welcome modal or anything else intercepts clicks the same way.
  await page.waitForSelector("#boot-splash", { state: "hidden", timeout: 10_000 }).catch(() => {});
  await dismissWelcomeModal(page);

  const configureBtn = page.getByRole("button", { name: "Configure member" });
  await expect(configureBtn).toBeVisible({ timeout: 10_000 });
  await configureBtn.click();

  // Role is locked for the owner (can't be demoted — enforced server-side
  // too), but the colour swatches must stay live.
  await expect(page.locator("#cfg-role")).toBeDisabled();
  const swatches = page.locator('[role="radio"][aria-label]');
  await expect(swatches).toHaveCount(8);
  await swatches.nth(3).click();
  const swatchColor = await swatches.nth(3).getAttribute("aria-label");

  await page.getByRole("button", { name: "Save changes" }).click();
  // The modal calls onClose() on a successful save.
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 10_000 });

  const saved = dbQuery<{ color: string }>(`select color from public.agency_members where user_id = '${ids.aManager}';`)
    .rows[0];
  expect(saved.color).toBe(swatchColor);
});

// ─── 2026-09-14 todo-list batch: remove_client_assignment(), staff
// self-removal requests, locked session policy, encryption enforcement,
// client_stubs INSERT restriction, storage quota, client feature overrides.
// Backs supabase/migrations/20260914000040_agency_todo_backend_batch1.sql.

// ─── "Counsellor removed from client" → waiting list + previously_counselled ─
test("remove_client_assignment ends the live assignment, flags previously_counselled, is authorization- and tenant-scoped", async () => {
  test.setTimeout(60_000);
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const asBManager = await signedInAs(`smissah321+${TAG}-b-mgr@gmail.com`);

  const { data: stub, error: stubErr } = await asAManager
    .from("client_stubs")
    .insert({ agency_id: ids.agencyA, first_name: TAG, last_name: "removeflow", created_by: ids.aManager })
    .select("id, previously_counselled")
    .single();
  expect(stubErr).toBeNull();
  expect(stub!.previously_counselled).toBe(false);

  const { data: assignment, error: aErr } = await asAManager
    .from("client_assignments")
    .insert({
      stub_id: stub!.id,
      agency_id: ids.agencyA,
      from_manager_id: ids.aManager,
      to_admin_id: ids.aStaff,
      status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(aErr).toBeNull();

  // Cross-tenant: Agency B's manager can't touch it (acts_for_admin fails —
  // they're neither the assigned admin nor a manager of Agency A).
  const { error: crossErr } = await asBManager.rpc("remove_client_assignment", {
    p_assignment_id: assignment!.id,
    p_reason: "nope",
  });
  expect(crossErr).not.toBeNull();
  expect(String(crossErr!.message)).toContain("NOT_AUTHORIZED");

  // The assigned counsellor themself is authorized (acts_for_admin covers self).
  const { error: removeErr } = await asAStaff.rpc("remove_client_assignment", {
    p_assignment_id: assignment!.id,
    p_reason: "moving away",
  });
  expect(removeErr).toBeNull();

  const after = dbQuery<{ status: string; decline_reason: string; previously_counselled: boolean }>(`
    select ca.status, ca.decline_reason, cs.previously_counselled
    from public.client_assignments ca join public.client_stubs cs on cs.id = ca.stub_id
    where ca.id = '${assignment!.id}';
  `).rows[0];
  expect(after.status).toBe("ended");
  expect(after.decline_reason).toBe("moving away");
  expect(after.previously_counselled).toBe(true);

  // Re-running against an already-ended assignment is rejected, not silently re-applied.
  const { error: reRunErr } = await asAManager.rpc("remove_client_assignment", { p_assignment_id: assignment!.id });
  expect(String(reRunErr?.message ?? "")).toContain("NOT_ACTIVE_ASSIGNMENT");

  // fetchAgencyClients' liveByStub map only keys pending/accepted — confirms
  // the client genuinely falls back to "unassigned" client-side, not stuck
  // showing a dead assignment.
  const { data: liveOnly } = await asAManager
    .from("client_assignments")
    .select("id")
    .eq("stub_id", stub!.id)
    .in("status", ["pending", "accepted"]);
  expect(liveOnly ?? []).toHaveLength(0);

  // AgencyClientDetailPage's "Audit trail" card reads agency_activity_events
  // directly (subject_type/subject_id), not the manager-only feed RPC — which
  // itself doesn't even project subject_id (confirmed against its actual
  // definition), so assert against the same table/columns the page queries.
  const { data: events } = await asAManager
    .from("agency_activity_events")
    .select("summary")
    .eq("subject_type", "client")
    .eq("subject_id", stub!.id);
  expect((events ?? []).some((e) => (e as { summary: string }).summary.includes("returned"))).toBe(true);

  dbQuery(`delete from public.client_assignments where id = '${assignment!.id}';`);
});

// ─── Staff self-service "request removal" ──────────────────────────────────
test("request_agency_member_removal flags the member, notifies every active manager, and requires membership", async () => {
  test.setTimeout(60_000);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const asAClient = await signedInAs(`smissah321+${TAG}-a-client@gmail.com`);

  dbQuery(
    `delete from public.notifications where user_id = '${ids.aManager}' and type = 'agency_member_removal_requested';`,
  );

  const { error } = await asAStaff.rpc("request_agency_member_removal", { p_reason: "relocating" });
  expect(error).toBeNull();

  const memberRow = dbQuery<{ deletion_requested_at: string | null; deletion_requested_reason: string }>(
    `select deletion_requested_at, deletion_requested_reason from public.agency_members where user_id = '${ids.aStaff}';`,
  ).rows[0];
  expect(memberRow.deletion_requested_at).not.toBeNull();
  expect(memberRow.deletion_requested_reason).toBe("relocating");

  const notif = dbQuery<{ n: number }>(
    `select count(*)::int as n from public.notifications where user_id = '${ids.aManager}' and type = 'agency_member_removal_requested';`,
  ).rows[0];
  expect(notif.n).toBeGreaterThan(0);

  // Requesting doesn't remove them — only a manager's explicit removeAgencyMember does (tested elsewhere in this file).
  const stillMember = dbQuery<{ n: number }>(
    `select count(*)::int as n from public.agency_members where user_id = '${ids.aStaff}' and status = 'active';`,
  ).rows[0];
  expect(stillMember.n).toBe(1);

  // A user who isn't in any agency gets a clean error, not a silent no-op.
  const { error: nonMemberErr } = await asAClient.rpc("request_agency_member_removal", {});
  expect(String(nonMemberErr?.message ?? "")).toContain("NOT_A_MEMBER");

  dbQuery(
    `update public.agency_members set deletion_requested_at = null, deletion_requested_reason = null where user_id = '${ids.aStaff}';`,
  );
  dbQuery(
    `delete from public.notifications where user_id = '${ids.aManager}' and type = 'agency_member_removal_requested';`,
  );
});

// ─── Delegated settings: locked auto-cancel policy ─────────────────────────
// Uses real signed-in sessions (not raw dbQuery) so auth.uid() inside the
// trigger resolves exactly as it would for the live app — same reasoning as
// every other RLS-sensitive write in this file.
test("locked_session_policy pins non-managers to the agency default and exempts managers", async () => {
  test.setTimeout(60_000);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);

  dbQuery(
    `update public.agencies set locked_session_policy = true, default_auto_cancel_enabled = true where id = '${ids.agencyA}';`,
  );
  dbQuery(`update public.practice_settings set auto_cancel_enabled = true where admin_id = '${ids.aStaff}';`);

  // A staff member trying to switch it off gets silently coerced back to the
  // agency default — a soft pin (the toggle just won't stick), unlike the
  // hard-raise codename policy tested above.
  await asAStaff.from("practice_settings").update({ auto_cancel_enabled: false }).eq("admin_id", ids.aStaff);
  const staffAfter = dbQuery<{ auto_cancel_enabled: boolean }>(
    `select auto_cancel_enabled from public.practice_settings where admin_id = '${ids.aStaff}';`,
  ).rows[0];
  expect(staffAfter.auto_cancel_enabled).toBe(true); // coerced back, not left false

  // The agency default itself can move it for everyone.
  dbQuery(`update public.agencies set default_auto_cancel_enabled = false where id = '${ids.agencyA}';`);
  await asAStaff.from("practice_settings").update({ auto_cancel_enabled: true }).eq("admin_id", ids.aStaff);
  const staffAfter2 = dbQuery<{ auto_cancel_enabled: boolean }>(
    `select auto_cancel_enabled from public.practice_settings where admin_id = '${ids.aStaff}';`,
  ).rows[0];
  expect(staffAfter2.auto_cancel_enabled).toBe(false);

  // A manager is exempt from their own agency's lock.
  dbQuery(`update public.practice_settings set auto_cancel_enabled = true where admin_id = '${ids.aManager}';`);
  await asAManager.from("practice_settings").update({ auto_cancel_enabled: false }).eq("admin_id", ids.aManager);
  const managerAfter = dbQuery<{ auto_cancel_enabled: boolean }>(
    `select auto_cancel_enabled from public.practice_settings where admin_id = '${ids.aManager}';`,
  ).rows[0];
  expect(managerAfter.auto_cancel_enabled).toBe(false); // their own change stuck

  dbQuery(`update public.agencies set locked_session_policy = false where id = '${ids.agencyA}';`);
});

// ─── Enforce agencies.require_note_encryption (previously stored, unread) ──
test("require_note_encryption blocks unencrypted session-note writes for members, and is a no-op when off", () => {
  dbQuery(`update public.agencies set require_note_encryption = true where id = '${ids.agencyA}';`);

  let threw = "";
  try {
    dbQuery(
      `insert into public.session_notes (admin_id, content, is_encrypted) values ('${ids.aStaff}', 'plaintext', false);`,
    );
  } catch (e) {
    threw = String(e);
  }
  expect(threw).toContain("AGENCY_ENCRYPTION_REQUIRED");
  expect(
    dbQuery<{ n: number }>(
      `select count(*)::int as n from public.session_notes where admin_id = '${ids.aStaff}' and content = 'plaintext';`,
    ).rows[0].n,
  ).toBe(0);

  // Encrypted content is fine — freelancers can still write (and later
  // read/decrypt with their own key) their own notes.
  const encrypted = dbQuery<{ id: string }>(
    `insert into public.session_notes (admin_id, content, is_encrypted, note_iv) values ('${ids.aStaff}', 'ciphertext', true, 'iv') returning id;`,
  ).rows[0];
  expect(encrypted.id).toBeTruthy();

  // Turning the agency policy off lifts the guard for the same admin.
  dbQuery(`update public.agencies set require_note_encryption = false where id = '${ids.agencyA}';`);
  const unencrypted = dbQuery<{ id: string }>(
    `insert into public.session_notes (admin_id, content, is_encrypted) values ('${ids.aStaff}', 'plaintext-ok', false) returning id;`,
  ).rows[0];
  expect(unencrypted.id).toBeTruthy();

  // A solo admin outside any agency is never touched by this trigger.
  dbQuery(
    `insert into public.session_notes (admin_id, content, is_encrypted) values ('${ids.aClient}', 'solo-note', false);`,
  );

  dbQuery(`
    delete from public.session_notes where admin_id = '${ids.aStaff}' and content in ('ciphertext', 'plaintext-ok');
    delete from public.session_notes where admin_id = '${ids.aClient}' and content = 'solo-note';
  `);
});

// ─── client_stubs INSERT restriction: counsellors can't self-acquire clients ─
test("a non-manager agency counsellor cannot insert their own client_stub; a manager still can", async () => {
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);

  const { data: staffAttempt, error: staffErr } = await asAStaff
    .from("client_stubs")
    .insert({ first_name: TAG, last_name: "selfacquired", created_by: ids.aStaff })
    .select();
  // RLS silently returns zero rows on a blocked insert rather than an error
  // in some Postgrest configurations — assert both possibilities are covered.
  if (staffErr) {
    expect(staffErr).not.toBeNull();
  } else {
    expect(staffAttempt ?? []).toHaveLength(0);
  }
  expect(
    dbQuery<{ n: number }>(
      `select count(*)::int as n from public.client_stubs where created_by = '${ids.aStaff}' and last_name = 'selfacquired';`,
    ).rows[0].n,
  ).toBe(0);

  const { data: managerInsert, error: managerErr } = await asAManager
    .from("client_stubs")
    .insert({ agency_id: ids.agencyA, first_name: TAG, last_name: "managerintake", created_by: ids.aManager })
    .select("id")
    .single();
  expect(managerErr).toBeNull();
  expect(managerInsert!.id).toBeTruthy();

  dbQuery(`delete from public.client_stubs where last_name = 'managerintake';`);
});

// ─── Agency storage quota: 5 GiB, not 10 GiB ───────────────────────────────
test("file_storage_quota resolves to 5 GiB for an agency member", () => {
  const agencyBytes = dbQuery<{ max_storage_bytes: string }>(
    `select max_storage_bytes from public.agencies where id = '${ids.agencyA}';`,
  ).rows[0];
  expect(Number(agencyBytes.max_storage_bytes)).toBe(5368709120);

  const quota = dbQuery<{ q: string }>(`select public.file_storage_quota('${ids.aStaff}') as q;`).rows[0];
  expect(Number(quota.q)).toBe(5368709120);
});

// ─── Per-client feature overrides: superadmin-only, owning admin read-only ──
test("client_feature_overrides: superadmin manages, owning admin reads own clients only, others see nothing", async () => {
  test.setTimeout(60_000);
  const superId = createAuthUser({
    email: `smissah321+${TAG}-super@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin" },
  });
  dbQuery(`update public.users set is_superadmin = true where id = '${superId}';`);

  const stub = dbQuery<{ id: string }>(
    `insert into public.client_stubs (first_name, last_name, created_by) values ('${TAG}', 'flagtarget', '${ids.aStaff}') returning id;`,
  ).rows;

  const asSuper = await signedInAs(`smissah321+${TAG}-super@gmail.com`);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const asBManager = await signedInAs(`smissah321+${TAG}-b-mgr@gmail.com`);

  const { data: created, error: createErr } = await asSuper
    .from("client_feature_overrides")
    .insert({ stub_id: stub[0].id, feature_key: "beta_widget", enabled: true, set_by: superId })
    .select("id")
    .single();
  expect(createErr).toBeNull();

  // The owning admin (aStaff created this stub) can read it…
  const { data: ownerRead } = await asAStaff.from("client_feature_overrides").select("*").eq("id", created!.id);
  expect(ownerRead).toHaveLength(1);
  // …but can't write it (superadmin-only for all).
  const { data: ownerWrite } = await asAStaff
    .from("client_feature_overrides")
    .update({ enabled: false })
    .eq("id", created!.id)
    .select();
  expect(ownerWrite ?? []).toHaveLength(0);

  // An unrelated agency's manager sees nothing.
  const { data: strangerRead } = await asBManager.from("client_feature_overrides").select("*").eq("id", created!.id);
  expect(strangerRead ?? []).toHaveLength(0);

  dbQuery(`delete from public.client_feature_overrides where id = '${created!.id}';`);
  dbQuery(`delete from public.client_stubs where id = '${stub[0].id}';`);
  dbQuery(`delete from public.users where id = '${superId}';`);
  dbQuery(`delete from auth.users where id = '${superId}';`);
});

// ─── Sidebar nav parity: Finances is hidden for agency employees (the agency
// bills their clients centrally) but shown for freelance/associate staff (they
// bill their own clients, then settle a cut with the agency separately) and
// for managers. Backs AdminSidebar.tsx's employment_type branch. Each variant
// is its own test (its own fresh `page`/browser context) rather than chaining
// logins in one test — navigating loginViaUi's /login while already signed in
// just bounces straight back out before the form ever renders. ────────────────
test("an agency employee doesn't see Finances in Counselling view", async ({ page }) => {
  test.setTimeout(60_000);
  dbQuery(`update public.agency_members set employment_type = 'employee' where user_id = '${ids.aStaff}';`);
  await loginViaUi(page, `smissah321+${TAG}-a-staff@gmail.com`, PASSWORD);
  await page.goto(`${APP_URL}/admin`, { waitUntil: "load", timeout: 20_000 });
  await dismissWelcomeModal(page);
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Finances" })).toHaveCount(0);
});

test("a freelance/associate agency staff member sees Finances in Counselling view", async ({ page }) => {
  test.setTimeout(60_000);
  dbQuery(`update public.agency_members set employment_type = 'freelance' where user_id = '${ids.aStaff}';`);
  await loginViaUi(page, `smissah321+${TAG}-a-staff@gmail.com`, PASSWORD);
  await page.goto(`${APP_URL}/admin`, { waitUntil: "load", timeout: 20_000 });
  await dismissWelcomeModal(page);
  await expect(page.getByRole("link", { name: "Finances" })).toBeVisible({ timeout: 10_000 });
  dbQuery(`update public.agency_members set employment_type = 'employee' where user_id = '${ids.aStaff}';`);
});

test("an agency manager sees Finances in Counselling view regardless of their own employment_type", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginViaUi(page, `smissah321+${TAG}-a-mgr@gmail.com`, PASSWORD);
  await page.goto(`${APP_URL}/admin`, { waitUntil: "load", timeout: 20_000 });
  await dismissWelcomeModal(page);
  await expect(page.getByRole("link", { name: "Finances" })).toBeVisible({ timeout: 10_000 });
});

// ─── /agency (manage mode) nav for a plain staff member: intake inbox always,
// Files once the agency has actually shared something — never a dead link to
// a manager-only page (Clients/Sessions/Finance/Staff/Settings all redirect
// non-managers straight back to /agency/incoming). Backs AgencyLayout.tsx. ──
test("a non-manager's /agency sidebar gains Files once the agency shares a folder, and never shows manager-only links", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await loginViaUi(page, `smissah321+${TAG}-a-staff@gmail.com`, PASSWORD);
  await page.goto(`${APP_URL}/agency`, { waitUntil: "load", timeout: 20_000 });
  await dismissWelcomeModal(page);
  await expect(page.getByRole("link", { name: "Clients to review" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Files" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Finance" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

  const folder = dbQuery<{ id: string }>(
    `insert into public.file_folders (name, owner_admin_id, agency_id, shared)
     values ('${TAG}-shared', '${ids.aManager}', '${ids.agencyA}', true) returning id;`,
  ).rows[0];

  // Already signed in — a plain reload (not another loginViaUi) picks up the
  // newly-shared folder. Re-navigating loginViaUi's /login while authenticated
  // just bounces straight back out before the form renders. A cold reload
  // re-runs auth + agency bootstrap before the sidebar renders at all, so give
  // it more room than a simple assertion.
  await page.reload({ waitUntil: "load", timeout: 20_000 });
  await dismissWelcomeModal(page);
  await expect(page.getByRole("link", { name: "Files" })).toBeVisible({ timeout: 30_000 });

  dbQuery(`delete from public.file_folders where id = '${folder.id}';`);
});

// ─── Creation-permission toggles: staff can create their own forms/resources
// only once the agency turns each on; managers are always allowed regardless.
// Backs 20260915000030's agency_may_create() + the two restrictive insert-only
// policies — deliberately API-layer, not UI, per this file's own convention. ──
test("agency staff can create a form/resource only once the agency permits it; managers always can", async () => {
  test.setTimeout(90_000);
  dbQuery(
    `update public.agencies set allow_staff_forms = false, allow_staff_resources = false where id = '${ids.agencyA}';`,
  );

  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const asAManager = await signedInAs(`smissah321+${TAG}-a-mgr@gmail.com`);

  const { error: blockedFormErr } = await asAStaff.from("questionnaires").insert({ title: `${TAG}-blocked-form` });
  expect(blockedFormErr).not.toBeNull();
  const { error: blockedResourceErr } = await asAStaff.from("resources").insert({ title: `${TAG}-blocked-resource` });
  expect(blockedResourceErr).not.toBeNull();

  // The flag is staff-only — a manager's own creation is never gated by it.
  const { error: mgrFormErr } = await asAManager.from("questionnaires").insert({ title: `${TAG}-mgr-form-while-off` });
  expect(mgrFormErr).toBeNull();

  dbQuery(
    `update public.agencies set allow_staff_forms = true, allow_staff_resources = true where id = '${ids.agencyA}';`,
  );

  const { error: allowedFormErr } = await asAStaff.from("questionnaires").insert({ title: `${TAG}-allowed-form` });
  expect(allowedFormErr).toBeNull();
  const { error: allowedResourceErr } = await asAStaff.from("resources").insert({ title: `${TAG}-allowed-resource` });
  expect(allowedResourceErr).toBeNull();

  dbQuery(
    `delete from public.questionnaires where title in ('${TAG}-mgr-form-while-off', '${TAG}-allowed-form') and admin_id in ('${ids.aManager}', '${ids.aStaff}');`,
  );
  dbQuery(`delete from public.resources where title = '${TAG}-allowed-resource' and admin_id = '${ids.aStaff}';`);
  dbQuery(
    `update public.agencies set allow_staff_forms = false, allow_staff_resources = false where id = '${ids.agencyA}';`,
  );
});

// ─── Staff inherit the agency's shared resource library (read-only) when
// agencies.shared_resources is on — off by default, and off means staff see
// only their own resources same as today. Backs agency_shares_resources(). ──
test("a non-manager reads the manager's resources only when shared_resources is on", async () => {
  test.setTimeout(90_000);
  const managerResource = dbQuery<{ id: string }>(
    `insert into public.resources (admin_id, title) values ('${ids.aManager}', '${TAG}-mgr-resource') returning id;`,
  ).rows[0];

  dbQuery(`update public.agencies set shared_resources = false where id = '${ids.agencyA}';`);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const { data: hiddenRead } = await asAStaff.from("resources").select("id").eq("id", managerResource.id);
  expect(hiddenRead ?? []).toHaveLength(0);

  dbQuery(`update public.agencies set shared_resources = true where id = '${ids.agencyA}';`);
  const { data: sharedRead } = await asAStaff.from("resources").select("id").eq("id", managerResource.id);
  expect(sharedRead).toHaveLength(1);

  // Cross-agency staff never see it, on or off.
  const asBStaff = await signedInAs(`smissah321+${TAG}-b-staff@gmail.com`);
  const { data: crossAgencyRead } = await asBStaff.from("resources").select("id").eq("id", managerResource.id);
  expect(crossAgencyRead ?? []).toHaveLength(0);

  dbQuery(`delete from public.resources where id = '${managerResource.id}';`);
  dbQuery(`update public.agencies set shared_resources = false where id = '${ids.agencyA}';`);
});

// ─── Folder sharing scoped to internal vs. freelance staff — a folder can be
// shared with one employment_type and not the other. Backs
// file_shared_with_caller() and the shared_internal/shared_freelance columns. ──
test("a shared folder is visible only to the staff employment_type(s) it's shared with", async () => {
  test.setTimeout(90_000);
  dbQuery(`update public.agency_members set employment_type = 'employee' where user_id = '${ids.aStaff}';`);
  const asAStaff = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);

  const internalOnly = dbQuery<{ id: string }>(
    `insert into public.file_folders (name, owner_admin_id, shared, shared_internal, shared_freelance)
     values ('${TAG}-internal-only', '${ids.aManager}', true, true, false) returning id;`,
  ).rows[0];
  const freelanceOnly = dbQuery<{ id: string }>(
    `insert into public.file_folders (name, owner_admin_id, shared, shared_internal, shared_freelance)
     values ('${TAG}-freelance-only', '${ids.aManager}', true, false, true) returning id;`,
  ).rows[0];

  const { data: seesInternal } = await asAStaff.from("file_folders").select("id").eq("id", internalOnly.id);
  expect(seesInternal).toHaveLength(1);
  const { data: seesFreelanceAsEmployee } = await asAStaff.from("file_folders").select("id").eq("id", freelanceOnly.id);
  expect(seesFreelanceAsEmployee ?? []).toHaveLength(0);

  dbQuery(`update public.agency_members set employment_type = 'freelance' where user_id = '${ids.aStaff}';`);
  const asAStaffFreelance = await signedInAs(`smissah321+${TAG}-a-staff@gmail.com`);
  const { data: seesFreelanceNow } = await asAStaffFreelance
    .from("file_folders")
    .select("id")
    .eq("id", freelanceOnly.id);
  expect(seesFreelanceNow).toHaveLength(1);
  const { data: seesInternalAsFreelance } = await asAStaffFreelance
    .from("file_folders")
    .select("id")
    .eq("id", internalOnly.id);
  expect(seesInternalAsFreelance ?? []).toHaveLength(0);

  dbQuery(`delete from public.file_folders where id in ('${internalOnly.id}', '${freelanceOnly.id}');`);
  dbQuery(`update public.agency_members set employment_type = 'employee' where user_id = '${ids.aStaff}';`);
});
