import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import dayjs from "dayjs";

import Avatar from "@components/shared/Avatar/Avatar";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import Modal from "@components/shared/Modal/Modal";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import SplitButton from "@components/shared/SplitButton/SplitButton";
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

import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import CreateStubModal from "../AdminClientsPage/modals/CreateStubModal/CreateStubModal";
import InviteStubModal from "./InviteStubModal";
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
  const dispatch = useAppDispatch();
  const { userProfile, isDemo } = useAuth();
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

  const [inviteOpen, setInviteOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (stubFromRedux) setStub(stubFromRedux);
  }, [stubFromRedux]);

  useEffect(() => {
    if (!stubId) return;
    supabase.rpc("record_client_view", { p_type: "stub", p_ref: stubId });
  }, [stubId]);

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

  const loadSessions = () => {
    if (!stubIdRef.current) return;
    supabase
      .from("stub_sessions")
      .select("*")
      .eq("stub_id", stubIdRef.current)
      .order("scheduled_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSessions(data as StubSession[]);
      });
  };

  useRealtimeTable("stub_sessions", stubId ? `stub_id=eq.${stubId}` : undefined, loadSessions);

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
  }, [stubId]);

  const displayName = stub ? stub.codename || `${stub.first_name} ${stub.last_name}` : "";
  const realClients = allUsers.filter((u) => u.role === "client");
  const linkedUser = stub?.linked_user_id ? allUsers.find((u) => u.id === stub.linked_user_id) : null;

  const totalSessions = sessions.length;
  const attendedCount = sessions.filter((s) => s.status === "attended").length;
  const totalPaid = sessions.reduce((sum, s) => sum + (s.paid ? (s.price_pence ?? 0) / 100 : 0), 0);
  const currency = sessions.find((s) => s.paid)?.currency ?? "GBP";

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
            <Button variant="secondary" onClick={() => navigate("/admin/clients")}>
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
    ...(stub.linked_user_id ? [{ label: "Unlink", onClick: handleUnlink, disabled: unlinking }] : []),
  ];

  return (
    <div className="page">
      <div className="inner">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/clients")}>
          ← Back to clients
        </Button>

        {/* Hero */}
        <div className={styles.hero}>
          <div className={styles.heroLeft}>
            <Avatar name={displayName} imageSrc="" size={80} />
            <div>
              <span className={stub.linked_user_id ? styles.heroBadgeLinked : styles.heroBadge}>
                {stub.linked_user_id ? "Linked · Offline client" : "Offline client"}
              </span>
              <h1 className={styles.heroName}>{displayName}</h1>
              {stub.codename && (
                <p className={styles.heroRealName}>
                  {stub.first_name} {stub.last_name}
                </p>
              )}
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
            <div className={styles.sessionList}>
              {sessions.map((s) => (
                <StubSessionCard
                  key={s.id}
                  session={s}
                  sessionNumber={sessionNumberMap.get(s.id) ?? 1}
                  stubId={stubId!}
                  adminId={userProfile?.id ?? ""}
                  isDemo={isDemo}
                  onUpdated={(updated) => handleSessionSaved([updated])}
                  onDeleted={(id) => setSessions((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
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
        <Card className={styles.section}>
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
            const rows = values.dates.map((d) => ({
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
            }));
            const { data, error } = await supabase.from("stub_sessions").insert(rows).select();
            if (error) throw new Error("Failed to add session.");
            handleSessionSaved(data as StubSession[]);
            showToast(rows.length > 1 ? `${rows.length} sessions added.` : "Session added.");
            setAddSessionOpen(false);
          }}
        />
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
            This will transfer all notes from the offline client to their real account and mark the profiles as linked.
            Session records remain with the offline client.
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
