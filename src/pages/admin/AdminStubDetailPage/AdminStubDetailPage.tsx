import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import Avatar from "@components/shared/Avatar/Avatar";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import Modal from "@components/shared/Modal/Modal";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import SessionPrepCard from "@components/shared/SessionPrepCard/SessionPrepCard";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import type { ToggleButtonTabsTypes } from "@components/shared/ToggleButtonTabs/ToggleButtonTabs";
import ToggleButtonTabs from "@components/shared/ToggleButtonTabs/ToggleButtonTabs";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";
import type { ClientStub, StubSession, UserProfile } from "@models/globalTypes";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { deleteClientStub, fetchClientStubs, selectStubById, updateClientStub } from "@store/slices/clientStubsSlice";
import {
  fetchQuestionnaires,
  selectAllQuestionnaires,
  selectQuestionnairesStatus,
} from "@store/slices/questionnairesSlice";
import { fetchAllUsers, selectAllUsers } from "@store/slices/userDirectorySlice";

import { groupSessionsForDisplay } from "@/Helpers/sessionGrouping";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import CreateStubModal from "../AdminClientsPage/modals/CreateStubModal/CreateStubModal";
import InviteStubModal from "./InviteStubModal";
import StubBlockSessionCard from "./StubBlockSessionCard";
import StubSessionCard from "./StubSessionCard";

import styles from "./AdminStubDetailPage.module.scss";

type StubNote = {
  id: string;
  content: string;
  created_at: string;
};

type AssignedForm = {
  id: string;
  assigned_at: string;
  questionnaires: {
    id: string;
    title: string;
    form_type: string;
  } | null;
};

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function AdminStubDetailPage() {
  const { stubId } = useParams<{ stubId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightSessionId = searchParams.get("session");
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const { userProfile, isDemo, practiceSettings } = useAuth();
  const { showToast } = useToast();

  const stubFromRedux = useAppSelector(selectStubById(stubId ?? ""));
  const allUsers = useAppSelector(selectAllUsers) as UserProfile[];
  const questionnaires = useAppSelector(selectAllQuestionnaires);
  const questionnairesStatus = useAppSelector(selectQuestionnairesStatus);

  const [stub, setStub] = useState<ClientStub | null>(stubFromRedux ?? null);
  const [sessions, setSessions] = useState<StubSession[]>([]);
  const [notes, setNotes] = useState<StubNote[]>([]);
  const [assignedForms, setAssignedForms] = useState<AssignedForm[]>([]);
  const [loading, setLoading] = useState(!stubFromRedux);

  const [addSessionOpen, setAddSessionOpen] = useState(false);

  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const [assignFormOpen, setAssignFormOpen] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedLinkUserId, setSelectedLinkUserId] = useState("");
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [reminderMuted, setReminderMuted] = useState(false);
  const [muteRowId, setMuteRowId] = useState<string | null>(null);
  const [togglingMute, setTogglingMute] = useState(false);

  useEffect(() => {
    if (stubFromRedux) setStub(stubFromRedux);
  }, [stubFromRedux]);

  useEffect(() => {
    if (!stubId) return;
    supabase.rpc("record_client_view", { p_type: "stub", p_ref: stubId });
  }, [stubId]);

  useEffect(() => {
    if (!userProfile?.id || !stubId) return;
    supabase
      .from("admin_reminder_mutes")
      .select("id")
      .eq("admin_id", userProfile.id)
      .eq("stub_id", stubId)
      .maybeSingle()
      .then(({ data }) => {
        setReminderMuted(!!data);
        setMuteRowId(data?.id ?? null);
      });
  }, [userProfile?.id, stubId]);

  const handleToggleReminderMute = async () => {
    if (!userProfile?.id || !stubId) return;
    setTogglingMute(true);
    if (reminderMuted && muteRowId) {
      const { error } = await supabase.from("admin_reminder_mutes").delete().eq("id", muteRowId);
      if (error) {
        showToast("Failed to unmute.", "danger");
      } else {
        setReminderMuted(false);
        setMuteRowId(null);
        showToast("Session-prep reminders unmuted for this client.");
      }
    } else {
      const { data, error } = await supabase
        .from("admin_reminder_mutes")
        .insert({ admin_id: userProfile.id, stub_id: stubId })
        .select("id")
        .single();
      if (error) {
        showToast("Failed to mute.", "danger");
      } else {
        setReminderMuted(true);
        setMuteRowId(data.id);
        showToast("Session-prep reminders muted for this client.");
      }
    }
    setTogglingMute(false);
  };

  useEffect(() => {
    if (stubFromRedux || !stubId) return;
    supabase
      .from("client_stubs")
      .select("*")
      .eq("id", stubId)
      .single()
      .then(({ data }) => {
        if (data) setStub(data as ClientStub);
        setLoading(false);
      });
  }, [stubId, stubFromRedux]);

  useEffect(() => {
    dispatch(fetchClientStubs());
    dispatch(fetchAllUsers());
    if (questionnairesStatus === "idle") dispatch(fetchQuestionnaires());
  }, [dispatch, questionnairesStatus]);

  // Stable ref so Realtime callback always calls the latest version without
  // needing to re-subscribe when stubId changes.
  const stubIdRef = useRef(stubId);
  stubIdRef.current = stubId;

  // useCallback keeps this stable across renders — a plain function here
  // would be a new reference every render, and since it's a dependency of
  // the effect below (which it also triggers a re-render from, via
  // setSessions), that would refetch forever.
  const loadSessions = useCallback(() => {
    if (!stubIdRef.current) return;
    supabase
      .from("stub_sessions")
      .select("*")
      .eq("stub_id", stubIdRef.current)
      .order("scheduled_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSessions(data as StubSession[]);
      });
  }, []);

  useRealtimeTable("stub_sessions", stubId ? `stub_id=eq.${stubId}` : undefined, loadSessions);

  // Deep link from Payments "View": ?session=<id> — scroll to it and flash a highlight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: searchParams/setSearchParams deliberately excluded — this effect mutates searchParams, including it as a dep would re-fire on its own write
  useEffect(() => {
    if (!highlightSessionId) return;
    const el = document.getElementById(`stub-session-${highlightSessionId}`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedSessionId(highlightSessionId);

    searchParams.delete("session");
    setSearchParams(searchParams, { replace: true });

    const timer = setTimeout(() => setHighlightedSessionId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightSessionId, sessions]);

  useEffect(() => {
    if (!stubId) return;

    loadSessions();

    supabase
      .from("session_notes")
      .select("id, content, created_at")
      .eq("stub_id", stubId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setNotes(data as StubNote[]);
      });

    supabase
      .from("questionnaire_assignments")
      .select("id, assigned_at, questionnaires(id, title, form_type)")
      .eq("stub_id", stubId)
      .order("assigned_at", { ascending: false })
      .then(({ data }) => {
        if (data) setAssignedForms(data as AssignedForm[]);
      });
  }, [stubId, loadSessions]);

  // Codenames only apply while the practice-wide toggle is on — matches
  // clientDisplayName() (used for real clients), which stubs never actually
  // went through despite showing a codename whenever the stub happened to
  // have one, on or off. With the toggle off, showing a real name up top
  // and then the exact same real name again as the italic "real identity"
  // subtitle below it was also redundant, not just wrong when off.
  const useCodenames = practiceSettings?.use_client_codenames ?? false;
  const stubRealName = stub ? `${stub.first_name} ${stub.last_name}` : "";
  const showingCodename = useCodenames && !!stub?.codename;
  let displayName = "";
  if (stub) displayName = showingCodename ? (stub.codename as string) : stubRealName;
  const realClients = allUsers.filter((u) => u.role === "client");
  const linkedUser = stub?.linked_user_id ? allUsers.find((u) => u.id === stub.linked_user_id) : null;

  // paid and amount_paid are independent signals (see StubSessionCard) —
  // either one alone counts as paid, and amount_paid is the actual figure
  // when set.
  const isSessionPaid = (s: StubSession) => s.paid || (s.amount_paid != null && s.amount_paid > 0);
  const sessionPaidAmount = (s: StubSession) =>
    s.amount_paid != null && s.amount_paid > 0 ? s.amount_paid : (s.price_pence ?? 0) / 100;

  const totalSessions = sessions.length;
  const attendedCount = sessions.filter((s) => s.status === "attended").length;
  const totalPaid = sessions.reduce((sum, s) => sum + (isSessionPaid(s) ? sessionPaidAmount(s) : 0), 0);
  const currency = sessions.find((s) => isSessionPaid(s))?.currency ?? "GBP";

  // Prep card: soonest still-scheduled session, and the most recent past one
  // (sessions load newest-first, so a simple find/filter+[0] works off that).
  const nextSession = [...sessions]
    .filter((s) => s.status === "scheduled" && new Date(s.scheduled_at) > new Date())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
  const lastSeenSession = sessions.find((s) => s.status === "attended");
  const lastNote = notes[0] ?? null;

  const assignedFormIds = useMemo(
    () => new Set(assignedForms.map((f) => f.questionnaires?.id).filter(Boolean)),
    [assignedForms],
  );
  const unassignedQuestionnaires = useMemo(
    () => questionnaires.filter((q) => q.is_active && !q.is_system_default && !assignedFormIds.has(q.id)),
    [questionnaires, assignedFormIds],
  );

  const handleSessionSaved = (saved: StubSession[]) => {
    setSessions((prev) => {
      const ids = new Set(saved.map((s) => s.id));
      const updated = prev.map((s) => (ids.has(s.id) ? (saved.find((n) => n.id === s.id) ?? s) : s));
      const newOnes = saved.filter((s) => !prev.some((p) => p.id === s.id));
      return [...newOnes, ...updated].sort(
        (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
      );
    });
  };

  // Chronological session numbers (oldest = #1). Sessions are stored
  // newest-first so we reverse-index here.
  const sessionNumberMap = useMemo(() => {
    const chronological = [...sessions].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
    return new Map(chronological.map((s, i) => [s.id, i + 1]));
  }, [sessions]);

  const [sessionsDateTab, setSessionsDateTab] = useState<"upcoming" | "past">("upcoming");

  const tabSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((s) => {
      const scheduledAt = new Date(s.scheduled_at);
      return sessionsDateTab === "upcoming" ? scheduledAt >= now : scheduledAt < now;
    });
  }, [sessions, sessionsDateTab]);

  // Grouping only makes sense for the upcoming tab — a past session never
  // belongs in a live block card (see groupSessionsForDisplay's own comment).
  const sessionItems = useMemo(
    () =>
      sessionsDateTab === "past"
        ? tabSessions.map((session) => ({ kind: "single" as const, session }))
        : groupSessionsForDisplay(tabSessions),
    [tabSessions, sessionsDateTab],
  );

  const sessionsTabsObj: ToggleButtonTabsTypes = {
    leftButtonTitle: "Past",
    leftButtonAction: () => setSessionsDateTab("past"),
    rightButtonTitle: "Upcoming",
    rightButtonAction: () => setSessionsDateTab("upcoming"),
    activeTab: sessionsDateTab === "past" ? "left" : "right",
  };

  const handleAddNote = async () => {
    if (!stubId || !userProfile || !noteContent.trim()) return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setSavingNote(true);
    const { data, error } = await supabase
      .from("session_notes")
      .insert({
        admin_id: userProfile.id,
        stub_id: stubId,
        content: noteContent.trim(),
        is_encrypted: false,
        note_iv: null,
        session_id: null,
        user_id: null,
      })
      .select("id, content, created_at")
      .single();

    if (error) {
      showToast("Failed to add note.", "danger");
    } else {
      setNotes((prev) => [data as StubNote, ...prev]);
      setNoteContent("");
      showToast("Note added.");
    }
    setSavingNote(false);
  };

  const handleDeleteNote = async (id: string) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setDeletingNoteId(id);
    const { error } = await supabase.from("session_notes").delete().eq("id", id);
    if (error) {
      showToast("Failed to delete note.", "danger");
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== id));
    }
    setDeletingNoteId(null);
  };

  const handleAssignForm = async () => {
    if (!stubId || !userProfile || !selectedFormId) return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setAssigning(true);
    const { data, error } = await supabase
      .from("questionnaire_assignments")
      .insert({ stub_id: stubId, questionnaire_id: selectedFormId, assigned_at: new Date().toISOString() })
      .select("id, assigned_at")
      .single();
    if (error) {
      showToast("Failed to assign survey.", "danger");
    } else {
      const q = questionnaires.find((q) => q.id === selectedFormId);
      const newForm: AssignedForm = {
        id: data.id,
        assigned_at: data.assigned_at,
        questionnaires: q ? { id: q.id, title: q.title, form_type: q.form_type } : null,
      };
      setAssignedForms((prev) => [newForm, ...prev]);
      setSelectedFormId("");
      setAssignFormOpen(false);
      showToast("Survey assigned.");
    }
    setAssigning(false);
  };

  const handleUnassignForm = async (assignmentId: string) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setUnassigningId(assignmentId);
    const { error } = await supabase.from("questionnaire_assignments").delete().eq("id", assignmentId);
    if (error) {
      showToast("Failed to remove survey.", "danger");
    } else {
      setAssignedForms((prev) => prev.filter((f) => f.id !== assignmentId));
    }
    setUnassigningId(null);
  };

  const handleLink = async () => {
    if (!stubId || !selectedLinkUserId) return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setLinking(true);
    const { error } = await supabase.rpc("merge_stub_to_user", {
      p_stub_id: stubId,
      p_user_id: selectedLinkUserId,
    });
    if (error) {
      showToast("Failed to link client.", "danger");
    } else {
      dispatch(updateClientStub({ id: stubId, linked_user_id: selectedLinkUserId }));
      showToast("Client linked. Notes transferred.");
      navigate(`/admin/clients/${selectedLinkUserId}`);
    }
    setLinking(false);
  };

  const handleUnlink = async () => {
    if (!stubId) return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setUnlinking(true);
    const { error } = await supabase.from("client_stubs").update({ linked_user_id: null }).eq("id", stubId);
    if (error) {
      showToast("Failed to unlink client.", "danger");
    } else {
      dispatch(updateClientStub({ id: stubId, linked_user_id: null }));
      showToast("Client unlinked.");
    }
    setUnlinking(false);
    setUnlinkConfirmOpen(false);
  };

  const handleDelete = async () => {
    if (!stubId) return;
    setDeleting(true);
    try {
      await dispatch(deleteClientStub(stubId)).unwrap();
      navigate("/admin/clients");
    } catch {
      showToast("Failed to delete client.", "danger");
      setDeleting(false);
    }
  };

  if (loading) return null;

  if (!stub) {
    return (
      <div className="page">
        <div className="inner">
          <div className={styles.notFound}>
            <span>👤</span>
            <h2>Client not found</h2>
            <p>This offline client may have been deleted or the link is incorrect.</p>
            <Button variant="secondary" className={styles.backButton} onClick={() => navigate("/admin/clients")}>
              ← Back to clients
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const splitOptions = [
    { label: "Invite to platform", onClick: () => setInviteOpen(true) },
    { label: stub.linked_user_id ? "Relink client" : "Link to real client", onClick: () => setLinkOpen(true) },
    ...(stub.linked_user_id
      ? [{ label: "Unlink", onClick: () => setUnlinkConfirmOpen(true), disabled: unlinking }]
      : []),
    {
      label: reminderMuted ? "Unmute session reminders" : "Mute session reminders",
      onClick: handleToggleReminderMute,
      disabled: togglingMute,
    },
  ];

  return (
    <div className="page">
      <div className="inner">
        <Button className={styles.backButton} variant="ghost" size="sm" onClick={() => navigate("/admin/clients")}>
          ← Back to clients
        </Button>

        {nextSession && (
          <SessionPrepCard
            nextSessionAt={nextSession.scheduled_at}
            totalSessions={totalSessions}
            attendedSessions={attendedCount}
            lastSeenAt={lastSeenSession?.scheduled_at ?? null}
            lastNote={lastNote ? { content: lastNote.content, createdAt: lastNote.created_at } : null}
            notesLocked={false}
            onManageSession={() => {
              setSessionsDateTab(new Date(nextSession.scheduled_at) < new Date() ? "past" : "upcoming");
              const el = document.getElementById(`stub-session-${nextSession.id}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                setHighlightedSessionId(nextSession.id);
                window.setTimeout(() => setHighlightedSessionId(null), 2500);
              }
            }}
            onViewNotes={() => document.getElementById("notes-section")?.scrollIntoView({ behavior: "smooth" })}
          />
        )}

        {/* Hero */}
        <div className={styles.hero}>
          <div className={styles.heroLeft}>
            <Avatar name={displayName} imageSrc="" size={80} />
            <div>
              <span className={stub.linked_user_id ? styles.heroBadgeLinked : styles.heroBadge}>
                {stub.linked_user_id ? "Linked · Offline client" : "Offline client"}
              </span>
              <h1 className={styles.heroName}>{displayName}</h1>
              {showingCodename && <p className={styles.heroRealName}>{stubRealName}</p>}
              {stub.email && <p className={styles.heroEmail}>{stub.email}</p>}
              <p className={styles.heroSince}>Added {dayjs(stub.created_at).format("D MMM YYYY")}</p>
              {linkedUser && (
                <p className={styles.heroLinked}>
                  Linked to {linkedUser.first_name} {linkedUser.last_name}
                </p>
              )}
            </div>
          </div>

          <div className={styles.heroActions}>
            <SplitButton
              variant="secondary"
              size="sm"
              primaryLabel="Edit client"
              primaryAction={() => setEditOpen(true)}
              options={splitOptions}
              secondaryLabel="More options"
            />
          </div>
        </div>

        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.statBlock}>
            <p className={styles.statValue}>{totalSessions}</p>
            <p className={styles.statLabel}>Sessions</p>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statBlock}>
            <p className={styles.statValue}>{attendedCount}</p>
            <p className={styles.statLabel}>Attended</p>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statBlock}>
            <p className={styles.statValue}>{totalPaid > 0 ? formatCurrency(totalPaid, currency) : "—"}</p>
            <p className={styles.statLabel}>Total paid</p>
          </div>
        </div>

        {/* Sessions */}
        <Card className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Sessions</h2>
            <Button size="sm" onClick={() => setAddSessionOpen(true)}>
              + Add session
            </Button>
          </div>

          {sessions.length === 0 ? (
            <p className={styles.emptyState}>No sessions yet.</p>
          ) : (
            <>
              <div style={{ marginBottom: "var(--sp-3)" }}>
                <ToggleButtonTabs {...sessionsTabsObj} />
              </div>
              {sessionItems.length === 0 ? (
                <p className={styles.emptyState}>
                  {sessionsDateTab === "past" ? "No past sessions." : "No upcoming sessions."}
                </p>
              ) : (
                <div className={styles.sessionList}>
                  {sessionItems.map((item) => {
                    if (item.kind === "block") {
                      const highlightedInBlock =
                        !!highlightedSessionId && item.sessions.some((x) => x.id === highlightedSessionId);
                      const anchorId = highlightedInBlock ? highlightedSessionId : item.sessions[0].id;
                      return (
                        <div
                          key={item.sessions[0].id}
                          id={`stub-session-${anchorId}`}
                          className={highlightedInBlock ? styles.sessionHighlighted : undefined}
                        >
                          <StubBlockSessionCard
                            sessions={item.sessions}
                            sessionNumberMap={sessionNumberMap}
                            // biome-ignore lint/style/noNonNullAssertion: the `!stub` guard above already returned if stubId didn't resolve a stub
                            stubId={stubId!}
                            adminId={userProfile?.id ?? ""}
                            isDemo={isDemo}
                            onUpdated={handleSessionSaved}
                            onDeleted={(id) => setSessions((prev) => prev.filter((x) => x.id !== id))}
                            initialActiveId={highlightSessionId ?? undefined}
                          />
                        </div>
                      );
                    }
                    const s = item.session;
                    return (
                      <div
                        key={s.id}
                        id={`stub-session-${s.id}`}
                        className={highlightedSessionId === s.id ? styles.sessionHighlighted : undefined}
                      >
                        <StubSessionCard
                          session={s}
                          sessionNumber={sessionNumberMap.get(s.id) ?? 1}
                          // biome-ignore lint/style/noNonNullAssertion: the `!stub` guard above already returned if stubId didn't resolve a stub
                          stubId={stubId!}
                          adminId={userProfile?.id ?? ""}
                          isDemo={isDemo}
                          onUpdated={handleSessionSaved}
                          onDeleted={(id) => setSessions((prev) => prev.filter((x) => x.id !== id))}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Card>

        {/* Surveys */}
        <Card className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Surveys</h2>
            <Button
              size="sm"
              onClick={() => setAssignFormOpen((o) => !o)}
              disabled={unassignedQuestionnaires.length === 0}
            >
              {assignFormOpen ? "Cancel" : "+ Assign survey"}
            </Button>
          </div>

          {assignFormOpen && (
            <div className={styles.assignFormRow}>
              <select
                className={styles.assignSelect}
                value={selectedFormId}
                onChange={(e) => setSelectedFormId(e.target.value)}
              >
                <option value="">— choose a survey —</option>
                {unassignedQuestionnaires.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={handleAssignForm} disabled={!selectedFormId || assigning}>
                {assigning ? "Assigning…" : "Assign"}
              </Button>
            </div>
          )}

          {assignedForms.length === 0 ? (
            <p className={styles.emptyState}>No surveys assigned. They'll be waiting when this client joins.</p>
          ) : (
            <ul className={styles.formList}>
              {assignedForms.map((f) => (
                <li key={f.id} className={styles.formItem}>
                  <div>
                    <p className={styles.formTitle}>{f.questionnaires?.title ?? "Unknown survey"}</p>
                    <p className={styles.formMeta}>
                      {f.questionnaires?.form_type === "outcome_measure" ? "Outcome measure" : "Survey"} · Assigned{" "}
                      {dayjs(f.assigned_at).format("D MMM YYYY")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnassignForm(f.id)}
                    disabled={unassigningId === f.id}
                  >
                    {unassigningId === f.id ? "…" : "Remove"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Notes */}
        <Card className={styles.section} id="notes-section">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Notes</h2>
          </div>
          <div className={styles.notesForm}>
            <textarea
              className={styles.notesTextarea}
              placeholder="Add a note about this client…"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={3}
            />
            <div className={styles.notesFormActions}>
              <Button size="sm" onClick={handleAddNote} disabled={savingNote || !noteContent.trim()}>
                {savingNote ? "Saving…" : "Add note"}
              </Button>
            </div>
          </div>

          {notes.length === 0 ? (
            <p className={styles.emptyState}>No notes yet.</p>
          ) : (
            <ul className={styles.notesList}>
              {notes.map((note) => (
                <li key={note.id} className={styles.noteItem}>
                  <div className={styles.noteHeader}>
                    <span className={styles.noteDate}>{dayjs(note.created_at).format("D MMM YYYY, HH:mm")}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={deletingNoteId === note.id}
                      aria-label="Delete note"
                    >
                      {deletingNoteId === note.id ? "…" : "Delete"}
                    </Button>
                  </div>
                  <p className={styles.noteContent}>{note.content}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Danger zone */}
        <div className={styles.dangerZone}>
          <div>
            <p className={styles.dangerTitle}>Delete offline client</p>
            <p className={styles.dangerDesc}>Permanently removes this client profile, all their sessions, and notes.</p>
          </div>
          <Button variant="danger" size="sm" disabled={isDemo || deleting} onClick={() => setDeleteOpen(true)}>
            Delete client
          </Button>
        </div>
      </div>

      {/* Add session modal */}
      {addSessionOpen && userProfile && (
        <CreateSessionModal
          clientName={displayName}
          onClose={() => setAddSessionOpen(false)}
          onSave={async (values) => {
            // For batch creates, tag every session with a shared block_id so
            // they group into one card, same as real-client bulk booking.
            const blockId = values.dates.length > 1 ? crypto.randomUUID().slice(0, 6) : null;
            const rows = values.dates.map((d, i) => ({
              // biome-ignore lint/style/noNonNullAssertion: the `!stub` guard above already returned if stubId didn't resolve a stub
              stub_id: stubId!,
              admin_id: userProfile.id,
              scheduled_at: d,
              duration_minutes: values.duration_minutes,
              price_pence: values.price_pence,
              paid: values.paid,
              status: "scheduled" as const,
              location: values.address || null,
              notes: values.notes || null,
              code: values.reference_code || null,
              currency: "GBP",
              metadata: blockId
                ? {
                    block_id: blockId,
                    block_pos: i + 1,
                    block_total: values.dates.length,
                    block_start: values.dates[0],
                  }
                : null,
            }));
            const { data, error } = await supabase.from("stub_sessions").insert(rows).select();
            if (error) throw new Error("Failed to add session.");
            const saved = data as StubSession[];
            handleSessionSaved(saved);
            showToast(rows.length > 1 ? `${rows.length} sessions added.` : "Session added.");
            for (const s of saved) {
              if (s.status === "scheduled") {
                supabase.functions.invoke("notify-stub-session-booked", { body: { stub_session_id: s.id } });
              }
            }
            setAddSessionOpen(false);
          }}
        />
      )}

      {/* Unlink confirmation */}
      {unlinkConfirmOpen && (
        <ConfirmModal
          title="Unlink this client?"
          onClose={() => setUnlinkConfirmOpen(false)}
          onConfirm={handleUnlink}
          confirming={unlinking}
          confirmLabel="Yes, unlink"
        >
          <p>
            This disconnects the offline record from their real account. They'll keep their login, but their sessions
            will no longer be tied to this profile.
          </p>
        </ConfirmModal>
      )}

      {/* Invite to platform modal */}
      {inviteOpen && <InviteStubModal stub={stub} onClose={() => setInviteOpen(false)} />}

      {/* Edit stub modal */}
      {editOpen && <CreateStubModal existing={stub} onClose={() => setEditOpen(false)} />}

      {/* Link to real client modal */}
      {linkOpen && (
        <Modal
          title="Link to real client"
          size="sm"
          onClose={() => setLinkOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setLinkOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLink} disabled={linking || !selectedLinkUserId}>
                {linking ? "Linking…" : "Link client"}
              </Button>
            </>
          }
        >
          <div className={styles.linkField}>
            <label htmlFor="link-select">Select client</label>
            <select id="link-select" value={selectedLinkUserId} onChange={(e) => setSelectedLinkUserId(e.target.value)}>
              <option value="">— choose a client —</option>
              {realClients.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name} {u.email ? `(${u.email})` : ""}
                </option>
              ))}
            </select>
          </div>
          <p className={styles.linkHint}>
            This moves everything to their real account — notes, sessions and any assigned surveys — and marks the two
            profiles as linked. This offline record then drops out of your client list.
          </p>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deleteOpen && (
        <Modal
          title="Delete offline client"
          size="sm"
          onClose={() => setDeleteOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >
          <p>
            Are you sure you want to delete <strong>{displayName}</strong>? All sessions and notes will be permanently
            removed.
          </p>
        </Modal>
      )}
    </div>
  );
}
