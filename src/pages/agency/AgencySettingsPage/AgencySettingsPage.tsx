import { type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import UploadAndDisplayImage from "@components/shared/UploadAndDisplayImage/UploadAndDisplayImage";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { Agency } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { selectAgency, selectIsAgencyManager, updateAgencyPolicies } from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";

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

  const [draft, setDraft] = useState<Agency | null>(agency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        }),
      ).unwrap();
      showToast("Agency settings saved.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
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

      {/* ── Policies ── */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Member policies</h2>
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
  );
}
