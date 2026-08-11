import { useEffect, useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { clientDisplayName } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase";
import type { ClientStub, StubSession, UserProfile } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { fetchClientStubs } from "@/store/slices/clientStubsSlice";

type Props = {
  stub: ClientStub;
  realUser: UserProfile;
  onClose: () => void;
  onMerged: () => void;
};

const pill: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "var(--r-sm)",
  background: "var(--bg-subtle)",
  border: "1px solid var(--border)",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "0.82rem",
};

export default function MergeStubModal({ stub, realUser, onClose, onMerged }: Props) {
  const dispatch = useAppDispatch();
  const { isDemo, practiceSettings } = useAuth();
  const { showToast } = useToast();
  const useCodenames = practiceSettings?.use_client_codenames ?? false;

  const [stubSessions, setStubSessions] = useState<StubSession[]>([]);
  const [conflictDates, setConflictDates] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [merging, setMerging] = useState(false);

  // "stub" = use stub's codename on real client | "real" = keep existing | null = no conflict
  const [codenameChoice, setCodenameChoice] = useState<"stub" | "real" | null>(null);

  const stubName = `${stub.first_name} ${stub.last_name}`;
  const realName = clientDisplayName(realUser, useCodenames);

  const stubCodename = stub.codename ?? "";
  const realCodename = realUser.admin_codename ?? "";
  const hasCodenameConflict = !!(stubCodename && realCodename && stubCodename !== realCodename);

  useEffect(() => {
    const load = async () => {
      const [{ data: ss }, { data: rs }] = await Promise.all([
        supabase.from("stub_sessions").select("*").eq("stub_id", stub.id),
        supabase.from("sessions").select("scheduled_at").eq("client_id", realUser.id),
      ]);
      const sessions = (ss ?? []) as StubSession[];
      setStubSessions(sessions);

      const realDates = new Set((rs ?? []).map((r) => r.scheduled_at.slice(0, 10)));
      setConflictDates(
        sessions.filter((s) => s.scheduled_at && realDates.has(s.scheduled_at.slice(0, 10))).map((s) => s.scheduled_at),
      );
      setLoadingData(false);
    };
    load();
  }, [stub.id, realUser.id]);

  const totalPaid = stubSessions.reduce((sum, s) => sum + (s.amount_paid ?? 0), 0);
  const canMerge = !hasCodenameConflict || codenameChoice !== null;

  const handleMerge = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setMerging(true);

    // Resolve codename: if stub has one and real client doesn't, copy it over
    // If there's a conflict, apply whichever the admin chose
    const applyCodename = hasCodenameConflict
      ? codenameChoice === "stub"
        ? stubCodename
        : realCodename
      : stubCodename && !realCodename
        ? stubCodename
        : null;

    if (applyCodename !== null) {
      await supabase.from("users").update({ admin_codename: applyCodename }).eq("id", realUser.id);
    }

    const { error } = await supabase.from("client_stubs").update({ linked_user_id: realUser.id }).eq("id", stub.id);

    if (error) {
      showToast("Merge failed — please try again.", "danger");
      setMerging(false);
      return;
    }

    await dispatch(fetchClientStubs());
    showToast(`${stubName} merged into ${realName}'s account.`);
    onMerged();
  };

  const warnBox = (children: React.ReactNode) => (
    <div
      style={{
        padding: "var(--sp-3) var(--sp-4)",
        background: "var(--bg-subtle)",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );

  return (
    <Modal
      title="Merge offline client"
      size="md"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={merging || loadingData || !canMerge}>
            {merging ? "Merging…" : "Confirm merge"}
          </Button>
        </>
      }
    >
      {loadingData ? (
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          {/* Summary */}
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: 0 }}>
            Merging offline client <strong>{stubName}</strong> into <strong>{realName}</strong>'s account. Their{" "}
            {stubSessions.length > 0 ? (
              <>
                <strong>{stubSessions.length}</strong> offline {stubSessions.length === 1 ? "session" : "sessions"}
                {totalPaid > 0 ? ` (£${totalPaid.toFixed(2)} total)` : ""} will appear in {realName}'s payment history.
              </>
            ) : (
              <>account data will be linked (no sessions recorded).</>
            )}
          </p>

          {/* Codename conflict */}
          {hasCodenameConflict &&
            warnBox(
              <>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, margin: "0 0 var(--sp-1)" }}>Codename conflict</p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 var(--sp-3)" }}>
                  Offline: <span style={pill}>{stubCodename}</span> · Existing: <span style={pill}>{realCodename}</span>{" "}
                  — which should be kept?
                </p>
                <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                  <Button
                    size="sm"
                    variant={codenameChoice === "stub" ? "primary" : "secondary"}
                    onClick={() => setCodenameChoice("stub")}
                  >
                    Use "{stubCodename}"
                  </Button>
                  <Button
                    size="sm"
                    variant={codenameChoice === "real" ? "primary" : "secondary"}
                    onClick={() => setCodenameChoice("real")}
                  >
                    Keep "{realCodename}"
                  </Button>
                </div>
              </>,
            )}

          {/* Codename carry-over (no conflict, stub just adds one) */}
          {!hasCodenameConflict && stubCodename && !realCodename && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
              Codename <span style={pill}>{stubCodename}</span> will be applied to {realName}'s account.
            </p>
          )}

          {/* Session date conflicts */}
          {conflictDates.length > 0 &&
            warnBox(
              <>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, margin: "0 0 var(--sp-1)" }}>
                  Overlapping session dates
                </p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 var(--sp-2)" }}>
                  {conflictDates.length} offline {conflictDates.length === 1 ? "session falls" : "sessions fall"} on a
                  date that already has a session for {realName}. Both records will be kept — review them in the
                  payments page after merging.
                </p>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "1.2em",
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--sp-1)",
                  }}
                >
                  {conflictDates.map((d) => (
                    <li key={d} style={{ listStyle: "none" }}>
                      <span style={pill}>{dayjs(d).format("D MMM YYYY")}</span>
                    </li>
                  ))}
                </ul>
              </>,
            )}
        </div>
      )}
    </Modal>
  );
}
