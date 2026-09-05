import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import UploadAndDisplayImage from "@components/shared/UploadAndDisplayImage/UploadAndDisplayImage";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { Agency, AgencyPlanKey } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  changeAgencyPlan,
  fetchAgencyMembers,
  fetchAgencyPlanLimits,
  selectAgency,
  selectAgencyMembers,
  selectAgencyPlanLimits,
  selectIsAgencyManager,
  updateAgencyPolicies,
} from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";

const PLAN_LABEL: Record<AgencyPlanKey, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  unlimited: "Unlimited",
};

type TeamsChannel = {
  webhook_url: string;
  notify_booked: boolean;
  notify_cancelled: boolean;
  notify_paid: boolean;
};

const EMPTY_TEAMS: TeamsChannel = {
  webhook_url: "",
  notify_booked: true,
  notify_cancelled: true,
  notify_paid: true,
};

type PolicyKey = "shared_resources" | "require_note_encryption" | "locked_email_templates";

const POLICIES: { key: PolicyKey; title: string; blurb: string }[] = [
  {
    key: "shared_resources",
    title: "Shared resource library",
    blurb: "Resources added by the agency appear for every member's clients.",
  },
  {
    key: "require_note_encryption",
    title: "Require note encryption",
    blurb: "Members must switch on client-side encryption before writing session notes.",
  },
  {
    key: "locked_email_templates",
    title: "Lock client email wording",
    blurb: "Members can't edit the automated client emails or their on/off switches.",
  },
];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={styles.switch}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className={styles.switchTrack} />
    </label>
  );
}

export default function AgencySettingsPage() {
  const dispatch = useAppDispatch();
  const { authUser } = useAuth();
  const { showToast } = useToast();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const members = useAppSelector(selectAgencyMembers);
  const planLimits = useAppSelector(selectAgencyPlanLimits);

  const [draft, setDraft] = useState<Agency | null>(agency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [switchingPlan, setSwitchingPlan] = useState<AgencyPlanKey | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<{ plan: AgencyPlanKey; over: number } | null>(null);
  const [planSwitchError, setPlanSwitchError] = useState("");

  useEffect(() => {
    dispatch(fetchAgencyMembers());
    dispatch(fetchAgencyPlanLimits());
  }, [dispatch]);

  const activeStaffCount = useMemo(() => members.filter((m) => m.status === "active").length, [members]);

  const [teams, setTeams] = useState<TeamsChannel>(EMPTY_TEAMS);
  const [teamsBusy, setTeamsBusy] = useState(false);
  const [teamsTesting, setTeamsTesting] = useState(false);

  useEffect(() => {
    setDraft(agency);
  }, [agency]);

  useEffect(() => {
    if (!agency?.id) return;
    supabase
      .from("agency_teams_channel")
      .select("webhook_url, notify_booked, notify_cancelled, notify_paid")
      .eq("agency_id", agency.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTeams(data as TeamsChannel);
      });
  }, [agency?.id]);

  const setTeamsField = (patch: Partial<TeamsChannel>) => setTeams((t) => ({ ...t, ...patch }));

  const saveTeams = async () => {
    if (!agency?.id || !authUser) return;
    setTeamsBusy(true);
    setError("");
    try {
      const url = teams.webhook_url.trim();
      if (!url) {
        // Blank = disconnect: drop the row entirely.
        const { error: delErr } = await supabase.from("agency_teams_channel").delete().eq("agency_id", agency.id);
        if (delErr) throw delErr;
        setTeams(EMPTY_TEAMS);
        showToast("Teams channel disconnected.", "success");
        return;
      }
      const { error: upErr } = await supabase.from("agency_teams_channel").upsert(
        {
          agency_id: agency.id,
          webhook_url: url,
          notify_booked: teams.notify_booked,
          notify_cancelled: teams.notify_cancelled,
          notify_paid: teams.notify_paid,
          created_by: authUser.id,
        },
        { onConflict: "agency_id" },
      );
      if (upErr) throw upErr;
      showToast("Teams channel settings saved.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the Teams channel");
    } finally {
      setTeamsBusy(false);
    }
  };

  const testTeams = async () => {
    setTeamsTesting(true);
    setError("");
    try {
      const { error: fnErr } = await supabase.functions.invoke("agency-teams-test");
      if (fnErr) throw new Error(fnErr.message);
      showToast("Test message sent — check the channel.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test message failed");
    } finally {
      setTeamsTesting(false);
    }
  };

  if (!isManager) return <Navigate to="/agency/incoming" replace />;
  if (!draft || !authUser) return <p className={styles.empty}>Loading…</p>;

  const set = (patch: Partial<Agency>) => setDraft({ ...draft, ...patch });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await dispatch(
        updateAgencyPolicies({
          id: draft.id,
          name: draft.name.trim(),
          logo_url: draft.logo_url,
          locked_consent: draft.locked_consent,
          consent_text: draft.consent_text,
          consent_pdf_url: draft.consent_pdf_url,
          shared_resources: draft.shared_resources,
          require_note_encryption: draft.require_note_encryption,
          locked_email_templates: draft.locked_email_templates,
          require_client_codenames: draft.require_client_codenames,
          staff_agreement_required: draft.staff_agreement_required,
          agreement_text: draft.agreement_text,
          agreement_pdf_url: draft.agreement_pdf_url,
        }),
      ).unwrap();
      showToast("Agency settings saved.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const handlePickPlan = async (plan: AgencyPlanKey) => {
    if (!agency) return;
    setPlanSwitchError("");
    setSwitchingPlan(plan);
    try {
      const { data, error: checkErr } = await supabase.rpc("agency_plan_change_check", { p_target: plan });
      if (checkErr) throw checkErr;
      const check = data as { ok: boolean; active: number; max_staff: number | null; over: number };
      if (!check.ok) {
        setPlanSwitchError(
          `${check.active} active staff won't fit ${PLAN_LABEL[plan]}'s ${check.max_staff} place limit. Remove ${check.over} staff member${check.over === 1 ? "" : "s"} first, or pick a bigger tier.`,
        );
        setSwitchingPlan(null);
        return;
      }
      setConfirmSwitch({ plan, over: check.over });
    } catch (err) {
      setPlanSwitchError(err instanceof Error ? err.message : "Couldn't check that plan");
    } finally {
      setSwitchingPlan(null);
    }
  };

  const runPlanSwitch = async () => {
    if (!confirmSwitch || !agency) return;
    setSwitchingPlan(confirmSwitch.plan);
    try {
      await dispatch(
        changeAgencyPlan({
          id: agency.id,
          subscription_plan: confirmSwitch.plan,
          billing_interval: agency.billing_interval,
        }),
      ).unwrap();
      showToast(`Now on ${PLAN_LABEL[confirmSwitch.plan]}.`, "success");
      setConfirmSwitch(null);
    } catch (err) {
      setPlanSwitchError(err instanceof Error ? err.message : "Couldn't switch plan");
    } finally {
      setSwitchingPlan(null);
    }
  };

  return (
    <>
      <form onSubmit={save}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Settings</h1>
            <p className={styles.subtitle}>Your agency's identity and the rules that apply to every member.</p>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {/* ── Identity ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Identity</h2>
          <p className={styles.cardBlurb}>Shown next to the Clarity mark in manage mode.</p>

          <div className={styles.logoLockup}>
            {draft.logo_url ? (
              <img src={draft.logo_url} alt="Agency logo" className={styles.logoImg} />
            ) : (
              <div className={styles.logoImg} aria-hidden="true" />
            )}
            <div>
              <UploadAndDisplayImage userId={authUser.id} bucket="logos" onUpload={(url) => set({ logo_url: url })} />
              {draft.logo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ logo_url: null })}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className={styles.field} style={{ maxWidth: 400 }}>
            <label className={styles.label} htmlFor="ag-name">
              Agency name
            </label>
            <input
              id="ag-name"
              className={styles.input}
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
        </div>

        {/* ── Client consent ── */}
        <div className={styles.card}>
          <div className={styles.toggleRow} style={{ borderBottom: "none", paddingTop: 0 }}>
            <div className={styles.toggleText}>
              <strong>Agency client consent</strong>
              <span>Members use the agency's consent below instead of setting their own.</span>
            </div>
            <Switch
              checked={draft.locked_consent}
              onChange={(v) => set({ locked_consent: v })}
              label="Agency client consent"
            />
          </div>

          {draft.locked_consent && (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ag-consent">
                  Consent text
                </label>
                <textarea
                  id="ag-consent"
                  className={styles.textarea}
                  style={{ minHeight: 140 }}
                  value={draft.consent_text ?? ""}
                  onChange={(e) => set({ consent_text: e.target.value })}
                  placeholder="The consent wording your clients must agree to."
                />
              </div>
              <div className={styles.field} style={{ marginTop: "var(--sp-3)" }}>
                <span className={styles.label}>Or attach a consent PDF</span>
                <PdfUpload
                  adminId={authUser.id}
                  value={draft.consent_pdf_url ?? ""}
                  onChange={(url) => set({ consent_pdf_url: url })}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Client identity ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Client identity</h2>
          <p className={styles.cardBlurb}>
            Enforced immediately for every member, not just shown as a locked switch — turning this on forces codenames
            on for the whole agency and members can't switch it back off from their own settings.
          </p>
          <div className={styles.toggleRow}>
            <div className={styles.toggleText}>
              <strong>Require staff to use client codenames</strong>
              <span>Members see and use codenames instead of clients' real names everywhere in their admin UI.</span>
            </div>
            <Switch
              checked={draft.require_client_codenames}
              onChange={(v) => set({ require_client_codenames: v })}
              label="Require staff to use client codenames"
            />
          </div>
        </div>

        {/* ── Staff working agreements ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Staff working agreements</h2>
          <p className={styles.cardBlurb}>
            Shown to every new staff member during onboarding, right after they accept their invitation.
          </p>

          <div className={styles.field} role="radiogroup" aria-label="Staff working agreements">
            <label className={styles.radioRow}>
              <input
                type="radio"
                name="agreementPolicy"
                checked={draft.staff_agreement_required}
                onChange={() => set({ staff_agreement_required: true })}
              />
              <span>
                <strong>Agency agreement required</strong>
                <br />
                Staff must read and accept the agreement below before they can finish onboarding.
              </span>
            </label>
            <label className={styles.radioRow}>
              <input
                type="radio"
                name="agreementPolicy"
                checked={!draft.staff_agreement_required}
                onChange={() => set({ staff_agreement_required: false })}
              />
              <span>
                <strong>Staff may use their own agreement</strong>
                <br />
                No agency-wide agreement is enforced at onboarding.
              </span>
            </label>
          </div>

          {draft.staff_agreement_required && (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <p className={styles.cardBlurb}>
                Current version: <strong>v{draft.agreement_version}</strong> — bumps automatically whenever you change
                the text or PDF below, so you can tell who signed an older version.
              </p>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ag-agreement-text">
                  Agreement text
                </label>
                <textarea
                  id="ag-agreement-text"
                  className={styles.textarea}
                  style={{ minHeight: 140 }}
                  value={draft.agreement_text ?? ""}
                  onChange={(e) => set({ agreement_text: e.target.value })}
                  placeholder="The working agreement your staff must accept before joining."
                />
              </div>
              <div className={styles.field} style={{ marginTop: "var(--sp-3)" }}>
                <span className={styles.label}>Or attach an agreement PDF</span>
                <PdfUpload
                  adminId={authUser.id}
                  value={draft.agreement_pdf_url ?? ""}
                  onChange={(url) => set({ agreement_pdf_url: url })}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Other member policies ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Other member policies</h2>
          <p className={styles.cardBlurb}>Rules the agency enforces across every member's practice.</p>
          {POLICIES.map((p) => (
            <div key={p.key} className={styles.toggleRow}>
              <div className={styles.toggleText}>
                <strong>{p.title}</strong>
                <span>{p.blurb}</span>
              </div>
              <Switch checked={draft[p.key]} onChange={(v) => set({ [p.key]: v } as Partial<Agency>)} label={p.title} />
            </div>
          ))}
        </div>

        {/* ── Billing & seats ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Billing & seats</h2>
          <p className={styles.cardBlurb}>
            Your plan is based on active staff, not total headcount — paused or removed staff free up a seat.
          </p>

          {(() => {
            const currentPlan = (agency?.subscription_plan ?? "starter") as AgencyPlanKey;
            const currentLimit = planLimits.find((l) => l.plan === currentPlan);
            return (
              <>
                {currentLimit && (
                  <div className={styles.usageBar}>
                    <div className={styles.usageBarHead}>
                      <span>Staff places used</span>
                      <span
                        className={
                          currentLimit.max_staff != null && activeStaffCount > currentLimit.max_staff
                            ? styles.usageOver
                            : undefined
                        }
                      >
                        {currentLimit.max_staff == null
                          ? `${activeStaffCount} · unlimited`
                          : `${activeStaffCount} of ${currentLimit.max_staff}`}
                      </span>
                    </div>
                    <div className={styles.usageTrack}>
                      <div
                        className={styles.usageFill}
                        style={{
                          width: `${currentLimit.max_staff == null ? 100 : Math.min(100, Math.round((activeStaffCount / Math.max(currentLimit.max_staff, 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className={styles.tierGrid} style={{ marginTop: "var(--sp-3)" }}>
                  {planLimits.map((l) => {
                    const isCurrent = l.plan === currentPlan;
                    const price = agency?.billing_interval === "year" ? l.price_year_pence : l.price_month_pence;
                    return (
                      <div key={l.plan} className={`${styles.card}`} style={{ padding: "var(--sp-3)" }}>
                        <div style={{ fontWeight: 600 }}>{PLAN_LABEL[l.plan]}</div>
                        <div style={{ fontSize: "1.4rem", margin: "var(--sp-1) 0" }}>
                          £{(price / 100).toFixed(2)}
                          <span style={{ fontSize: "0.8rem" }}>
                            {agency?.billing_interval === "year" ? "/yr" : "/mo"}
                          </span>
                        </div>
                        <div className={styles.cardBlurb}>
                          {l.max_staff == null ? "Unlimited staff" : `Up to ${l.max_staff} staff`}
                        </div>
                        {isCurrent ? (
                          <Badge variant="success">Current plan</Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handlePickPlan(l.plan)}
                            disabled={!!switchingPlan}
                          >
                            {switchingPlan === l.plan ? "Checking…" : "Switch"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {planSwitchError && <p className={styles.error}>{planSwitchError}</p>}
                {currentLimit?.max_staff != null && activeStaffCount >= currentLimit.max_staff && (
                  <p className={styles.error} style={{ marginTop: "var(--sp-2)" }}>
                    You're at your staff limit — invite one more and you'll need to upgrade first.
                  </p>
                )}
              </>
            );
          })()}
        </div>

        {/* ── Microsoft Teams channel ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Microsoft Teams channel</h2>
          <p className={styles.cardBlurb}>
            Post a card to a Teams channel whenever a member books, cancels or gets paid for a session. In Teams, add a{" "}
            <strong>Workflows</strong> → “Post to a channel when a webhook request is received” trigger to your channel
            and paste its URL here. One-way only.
          </p>

          <div className={styles.field} style={{ maxWidth: 560 }}>
            <label className={styles.label} htmlFor="ag-teams-url">
              Incoming webhook URL
            </label>
            <input
              id="ag-teams-url"
              className={styles.input}
              type="url"
              value={teams.webhook_url}
              onChange={(e) => setTeamsField({ webhook_url: e.target.value })}
              placeholder="https://…logic.azure.com/… or https://…webhook.office.com/…"
            />
            <span className={styles.cardBlurb} style={{ marginTop: "var(--sp-1)" }}>
              Leave blank and save to disconnect.
            </span>
          </div>

          {teams.webhook_url.trim() && (
            <>
              <div className={styles.toggleRow}>
                <div className={styles.toggleText}>
                  <strong>Session booked</strong>
                  <span>Post when a member books a session.</span>
                </div>
                <Switch
                  checked={teams.notify_booked}
                  onChange={(v) => setTeamsField({ notify_booked: v })}
                  label="Notify on session booked"
                />
              </div>
              <div className={styles.toggleRow}>
                <div className={styles.toggleText}>
                  <strong>Session cancelled</strong>
                  <span>Post when a session is cancelled.</span>
                </div>
                <Switch
                  checked={teams.notify_cancelled}
                  onChange={(v) => setTeamsField({ notify_cancelled: v })}
                  label="Notify on session cancelled"
                />
              </div>
              <div className={styles.toggleRow}>
                <div className={styles.toggleText}>
                  <strong>Payment received</strong>
                  <span>Post when a client pays for a session.</span>
                </div>
                <Switch
                  checked={teams.notify_paid}
                  onChange={(v) => setTeamsField({ notify_paid: v })}
                  label="Notify on payment received"
                />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
            <Button type="button" onClick={saveTeams} disabled={teamsBusy}>
              {teamsBusy ? "Saving…" : "Save Teams settings"}
            </Button>
            {teams.webhook_url.trim() && (
              <Button type="button" variant="ghost" onClick={testTeams} disabled={teamsTesting}>
                {teamsTesting ? "Sending…" : "Send test message"}
              </Button>
            )}
          </div>
        </div>
      </form>
      confirmSwitch && (
      <ConfirmModal
        title={`Switch to ${PLAN_LABEL[confirmSwitch.plan]}?`}
        danger={false}
        confirming={switchingPlan === confirmSwitch.plan}
        onConfirm={runPlanSwitch}
        onClose={() => setConfirmSwitch(null)}
      >
        <p>
          You'll move to <strong>{PLAN_LABEL[confirmSwitch.plan]}</strong>. This changes your staff limit immediately —
          no payment is taken here yet.
        </p>
      </ConfirmModal>
      );
    </>
  );
}
