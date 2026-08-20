/** biome-ignore-all lint/style/noNonNullAssertion: <explanation> */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import {
  Avatar,
  Button,
  Card,
  HideableSection,
  ProgressChart,
  Search,
  SplitButton,
  ToggleButtonTabs,
} from "@components/shared/index";
import CancelSessionModal from "@components/shared/SessionCard/CancelSessionModal/CancelSessionModal";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import { SessionCard } from "@components/shared/SessionCard/SessionCard";
import type { CancellationRequest, RescheduleRequest, Response, Session, UserProfile } from "@models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchQuestionnaires, selectAllQuestionnaires } from "@store/slices/questionnairesSlice";
import { fetchAllResponses, selectResponsesByUser } from "@store/slices/responsesSlice";
import { fetchAllUsers, selectAllUsers } from "@store/slices/userDirectorySlice";

import Modal from "@/components/shared/Modal/Modal";
import { ToggleButtonTabsTypes } from "@/components/shared/ToggleButtonTabs/ToggleButtonTabs";
import { useAuth } from "@/context/AuthContext";
import { useEncryption } from "@/context/EncryptionContext";
import { useToast } from "@/context/ToastContext";
import { clientDisplayName, isPageStatusLoading } from "@/Helpers/Helpers";
import { useCounsellorName } from "@/Hooks/useCounsellorName";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import { supabase } from "@/lib/supabase.js";
import { fetchSessionsByClientId } from "@/store/slices/sessionsSlice";
import DeleteClientModal from "../AdminClientsPage/modals/DeleteClientModal/DeleteClientModal";
import SessionNotesModal from "../AdminClientsPage/modals/SessionNotesModal/SessionNotesModal";
import { exportClientPDF, getScoreAverage } from "../utils/AdminClientsPageUtils";

import styles from "./AdminClientsPageDetailed.module.scss";

// ─── Local types ────────────────────────────────────────────

type ExportSections = {
  clientDetails: boolean;
  sessions: boolean;
  checkIns: boolean;
  accountSummary: boolean;
  formResults: boolean;
};

type QuestionOption = { label: string; value: number };

type AssignedQuestion = {
  id: string;
  text: string;
  type: string;
  options: QuestionOption[] | null;
  order_index: number;
};

type AssignedForm = {
  id: string;
  assigned_at: string;
  is_plotted: boolean;
  questionnaires: {
    id: string;
    title: string;
    form_type: string;
    frequency: string | null;
    is_active: boolean;
    questions: AssignedQuestion[];
  } | null;
};

// ─── Helpers ────────────────────────────────────────────────

function questionAvg(questionId: string, responses: Response[]): string {
  const vals = responses
    .map((r) => (r.scores as Record<string, number>)[questionId])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return "–";
  return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
}

function submissionTotal(questions: AssignedQuestion[], response: Response): number {
  const scores = response.scores as Record<string, number>;
  return questions.reduce((sum, q) => {
    const v = scores[q.id];
    return sum + (typeof v === "number" && Number.isFinite(v) ? v : 0);
  }, 0);
}

// ─── Page ────────────────────────────────────────────────────

export default function AdminClientsPageDetailed() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightSessionId = searchParams.get("session");
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null);
  const handledHighlightRef = useRef<string | null>(null);
  const dispatch = useAppDispatch();
  const { isDemo, practiceSettings } = useAuth();
  const { showToast } = useToast();
  const { status: encStatus, decryptNote } = useEncryption();

  useRealtimeTable("sessions", clientId ? `client_id=eq.${clientId}` : undefined, () =>
    dispatch(fetchSessionsByClientId(clientId!)),
  );

  const allUsers = useAppSelector(selectAllUsers) as UserProfile[];
  const questionnaires = useAppSelector(selectAllQuestionnaires);
  const questionnairesStatus = useAppSelector((state: RootState) => state.questionnaires.status);
  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const responsesStatus = useAppSelector((state: RootState) => state.responses.status);
  const clientResponses = useAppSelector(selectResponsesByUser(clientId ?? ""));

  const counsellorName = useCounsellorName();
  const [rescheduleRequests, setRescheduleRequests] = useState<RescheduleRequest[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [cancellationRequests, setCancellationRequests] = useState<CancellationRequest[]>([]);
  const [cancelResolvingId, setCancelResolvingId] = useState<string | null>(null);
  const [cancelModalSession, setCancelModalSession] = useState<Session | null>(null);

  const [notesOpen, setNotesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [exportSections, setExportSections] = useState<ExportSections>({
    clientDetails: true,
    sessions: true,
    checkIns: true,
    accountSummary: false,
    formResults: false,
  });
  const [selectedNoteSessionId, setSelectedNoteSessionId] = useState<string | null>(null);
  const [accountSummaryPreview, setAccountSummaryPreview] = useState<string | null>(null);

  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState("");
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
  const [isManageSessionsModal, setIsManageSessionsModal] = useState(false);
  const [sessionPageNumber, setSessionPageNumber] = useState<null | number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sessionsDateTab, setSessopmsDateTab] = useState<"upcoming" | "past">("upcoming");

  const [assignedForms, setAssignedForms] = useState<AssignedForm[]>([]);

  useFetchOnIdle(
    (state: RootState) => state.sessions.status,
    () => fetchSessionsByClientId(clientId!),
    "Failed to fetch sessions:",
  );

  useEffect(() => {
    dispatch(fetchAllUsers());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchAllResponses());
  }, [dispatch]);

  useEffect(() => {
    if (questionnairesStatus === "idle") dispatch(fetchQuestionnaires());
  }, [dispatch, questionnairesStatus]);

  useEffect(() => {
    if (!clientId) return;
    supabase.rpc("record_client_view", { p_type: "user", p_ref: clientId });
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("questionnaire_assignments")
      .select(
        "id, assigned_at, is_plotted, questionnaires(id, title, form_type, frequency, is_active, questions(id, text, type, options, order_index))",
      )
      .eq("user_id", clientId)
      .order("assigned_at", { ascending: false })
      .then(({ data }) => {
        if (data) setAssignedForms(data as AssignedForm[]);
      });
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("reschedule_requests")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRescheduleRequests(data as RescheduleRequest[]);
      });
  }, [clientId]);

  const loadCancellationRequests = useCallback(() => {
    if (!clientId) return;
    supabase
      .from("cancellation_requests")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setCancellationRequests(data as CancellationRequest[]);
      });
  }, [clientId]);

  useEffect(() => {
    loadCancellationRequests();
  }, [loadCancellationRequests]);

  useRealtimeTable("sessions", clientId ? `client_id=eq.${clientId}` : undefined, () =>
    dispatch(fetchSessionsByClientId(clientId!)),
  );

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("session_notes")
      .select("content, is_encrypted, note_iv")
      .eq("user_id", clientId)
      .is("session_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) {
          setAccountSummaryPreview(null);
          return;
        }
        if (!data.is_encrypted) {
          const text = data.content as string;
          setAccountSummaryPreview(text?.length > 120 ? text.slice(0, 120) + "…" : text);
          return;
        }
        if (data.note_iv && encStatus === "unlocked") {
          try {
            const plain = await decryptNote(data.content as string, data.note_iv as string);
            setAccountSummaryPreview(plain?.length > 120 ? plain.slice(0, 120) + "…" : plain);
          } catch {
            setAccountSummaryPreview(null);
          }
        }
      });
  }, [clientId, encStatus, decryptNote]);

  const handleAcceptReschedule = async (req: RescheduleRequest) => {
    setResolvingId(req.id);
    const { error: sessionErr } = await supabase
      .from("sessions")
      .update({ scheduled_at: req.requested_at, status: "rescheduled" })
      .eq("id", req.session_id);

    if (sessionErr) {
      showToast("Failed to update session", "danger");
      setResolvingId(null);
      return;
    }

    await Promise.all([
      supabase.from("reschedule_requests").update({ status: "accepted" }).eq("id", req.id),
      supabase.from("notifications").insert({
        user_id: req.client_id,
        type: "reschedule_accepted",
        message: `Your reschedule request has been accepted. Your session is now on ${dayjs(req.requested_at).format("dddd D MMM [at] h:mma")}.`,
      }),
    ]);
    dispatch(fetchSessionsByClientId(clientId!));
    setRescheduleRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: "accepted" as const } : r)));
    showToast("Reschedule accepted — session updated");
    setResolvingId(null);
  };

  const handleDeclineReschedule = async (req: RescheduleRequest) => {
    setResolvingId(req.id);
    const { error } = await supabase.from("reschedule_requests").update({ status: "rejected" }).eq("id", req.id);

    if (error) {
      showToast("Failed to decline request", "danger");
      setResolvingId(null);
      return;
    }

    await supabase.from("notifications").insert({
      user_id: req.client_id,
      type: "reschedule_declined",
      message: `Your request to move your session to ${dayjs(req.requested_at).format("D MMM [at] h:mma")} wasn't accepted. Please contact ${counsellorName} to arrange a new time.`,
    });
    setRescheduleRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: "rejected" as const } : r)));
    showToast("Reschedule declined");
    setResolvingId(null);
  };

  const handleAcceptCancellation = (req: CancellationRequest) => {
    const linkedSession = clientSessions.find((s) => s.id === req.session_id);
    if (!linkedSession) {
      showToast("Couldn't find that session", "danger");
      return;
    }
    setCancelModalSession(linkedSession);
  };

  const handleDeclineCancellation = async (req: CancellationRequest) => {
    setCancelResolvingId(req.id);
    const { error } = await supabase.from("cancellation_requests").update({ status: "rejected" }).eq("id", req.id);

    if (error) {
      showToast("Failed to decline request", "danger");
      setCancelResolvingId(null);
      return;
    }

    await supabase.from("notifications").insert({
      user_id: req.client_id,
      type: "cancellation_declined",
      message: `Your request to cancel your session wasn't accepted. Please contact ${counsellorName} if you still need to change it.`,
    });
    setCancellationRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: "rejected" as const } : r)));
    showToast("Cancellation request declined");
    setCancelResolvingId(null);
  };

  const handleTogglePlot = async (formId: string) => {
    const target = assignedForms.find((f) => f.id === formId);
    if (!target) return;
    const { error } = await supabase.rpc("set_plotted_assignment", { p_assignment_id: formId });
    if (error) {
      showToast("Failed to update chart setting", "danger");
      return;
    }
    const wasPlotted = target.is_plotted;
    setAssignedForms((prev) => prev.map((f) => ({ ...f, is_plotted: !wasPlotted && f.id === formId })));
    if (!wasPlotted && target.questionnaires?.id) {
      setSelectedQuestionnaireId(target.questionnaires.id);
    }
  };

  const client = allUsers.find((u) => u.id === clientId);

  const [codename, setCodename] = useState(client?.admin_codename ?? "");
  const [savingCodename, setSavingCodename] = useState(false);

  useEffect(() => {
    setCodename(client?.admin_codename ?? "");
  }, [client?.admin_codename]);

  const handleSaveCodename = async () => {
    if (!clientId) return;
    setSavingCodename(true);
    await supabase
      .from("users")
      .update({ admin_codename: codename.trim() || null })
      .eq("id", clientId);
    dispatch(fetchAllUsers());
    setSavingCodename(false);
    showToast("Codename saved.");
  };

  const displayedClientName = client ? clientDisplayName(client, practiceSettings?.use_client_codenames ?? false) : "";

  const questionnaireOptions = useMemo(
    () => questionnaires.filter((q) => clientResponses.some((r) => r.questionnaire_id === q.id)),
    [questionnaires, clientResponses],
  );

  const clientSessions = useAppSelector((state) => state.sessions.sessions);

  // Prefer the plotted form for the progress chart, fall back to first with responses
  useEffect(() => {
    if (selectedQuestionnaireId) return;
    const plottedId = assignedForms.find((f) => f.is_plotted)?.questionnaires?.id;
    const preferredId =
      plottedId && questionnaireOptions.some((q) => q.id === plottedId) ? plottedId : questionnaireOptions[0]?.id;
    if (preferredId) setSelectedQuestionnaireId(preferredId);
  }, [questionnaireOptions, assignedForms, selectedQuestionnaireId]);

  const selectedQuestionnaire = questionnaires.find((q) => q.id === selectedQuestionnaireId) ?? questionnaireOptions[0];

  const selectedResponses = selectedQuestionnaire
    ? clientResponses.filter((r) => r.questionnaire_id === selectedQuestionnaire.id)
    : [];

  const latestResponse = clientResponses.at(-1);
  const latestQuestionnaire = questionnaires.find((q) => q.id === latestResponse?.questionnaire_id);
  const avgScore = latestResponse ? getScoreAverage(latestResponse, latestQuestionnaire) : null;
  const lastCheckIn = latestResponse
    ? dayjs(latestResponse.submitted_at ?? latestResponse.created_at).format("D MMM YYYY")
    : "—";

  // Grouped form results for structured display (CORE-10 etc.)
  const formResultGroups = useMemo(() => {
    return assignedForms
      .filter((f) => f.questionnaires !== null)
      .map((f) => {
        const q = f.questionnaires!;
        const sortedQuestions = [...(q.questions ?? [])].sort((a, b) => a.order_index - b.order_index);
        const formResponses = clientResponses
          .filter((r) => r.questionnaire_id === q.id)
          .sort(
            (a, b) =>
              new Date(b.submitted_at ?? b.created_at).getTime() - new Date(a.submitted_at ?? a.created_at).getTime(),
          );
        return { questionnaire: q, questions: sortedQuestions, responses: formResponses };
      })
      .filter((g) => g.responses.length > 0);
  }, [assignedForms, clientResponses]);

  const handleExport = async () => {
    if (!client) return;
    setExporting(true);
    await exportClientPDF({
      user: client,
      sections: exportSections,
      responses: selectedResponses,
      questionnaire: selectedQuestionnaire,
      sessions: clientSessions,
      accountSummary: accountSummaryPreview ?? undefined,
      formResults: formResultGroups,
    });
    setExporting(false);
  };

  const sessionsGroupByType = useMemo((): Session[] => {
    const now = new Date();
    return clientSessions.filter((session) => {
      const scheduledAt = new Date(session.scheduled_at);
      return sessionsDateTab === "upcoming" ? scheduledAt >= now : scheduledAt < now;
    });
  }, [sessionsDateTab, clientSessions]);

  const searchResults = useMemo(
    (): Session[] =>
      searchTerm.length > 0
        ? sessionsGroupByType.filter((s) => {
            const dateStr =
              `${dayjs(s.scheduled_at).format("dddd D MMMM YYYY")} ${dayjs(s.scheduled_at).format("D MMM YYYY")}`.toLowerCase();
            return (
              (s.notes && s.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
              dateStr.includes(searchTerm.toLowerCase())
            );
          })
        : sessionsGroupByType,
    [sessionsGroupByType, searchTerm],
  );

  const paginateSessions = (array: Session[], currentPage: number, pageSize: number): Session[] => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return array.slice(startIndex, endIndex);
  };

  // Deep link from Payments "View": ?session=<id> — put the right session
  // on screen regardless of which tab/search/page it'd otherwise be hiding
  // behind, then scroll to it and flash a highlight.
  useEffect(() => {
    if (!highlightSessionId || handledHighlightRef.current === highlightSessionId) return;
    const target = clientSessions.find((s) => s.id === highlightSessionId);
    if (!target) return;
    const isUpcoming = new Date(target.scheduled_at) >= new Date();
    setSessopmsDateTab(isUpcoming ? "upcoming" : "past");
    setSearchTerm("");
    handledHighlightRef.current = highlightSessionId;
  }, [highlightSessionId, clientSessions]);

  const targetSessionPage = useMemo(() => {
    if (!highlightSessionId) return null;
    const idx = searchResults.findIndex((s) => s.id === highlightSessionId);
    return idx === -1 ? null : Math.floor(idx / maxPageSize) + 1;
  }, [highlightSessionId, searchResults]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionPageNumber deliberately excluded — this only sets it, including it would loop
  useEffect(() => {
    if (targetSessionPage != null && sessionPageNumber !== targetSessionPage) {
      setSessionPageNumber(targetSessionPage);
    }
  }, [targetSessionPage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchParams/setSearchParams deliberately excluded — this effect mutates searchParams, including it as a dep would re-fire on its own write
  useEffect(() => {
    if (!highlightSessionId || targetSessionPage == null || sessionPageNumber !== targetSessionPage) return;
    const el = document.getElementById(`session-${highlightSessionId}`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedSessionId(highlightSessionId);

    searchParams.delete("session");
    setSearchParams(searchParams, { replace: true });

    const timer = setTimeout(() => setHighlightedSessionId(null), 2500);
    return () => clearTimeout(timer);
  }, [targetSessionPage, sessionPageNumber, highlightSessionId]);

  const maxPageSize = 4;

  const guard = isPageStatusLoading(usersStatus, questionnairesStatus, responsesStatus);
  if (guard) return guard;

  if (!client) {
    return (
      <div className="page">
        <div className="inner">
          <div className={styles.notFound}>
            <span className={styles.notFoundIcon}>👤</span>
            <h2>Client not found</h2>
            <p>This client may have been removed or the link is incorrect.</p>
            <Button variant="secondary" onClick={() => navigate("/admin/clients")}>
              ← Back to clients
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const clientSince = client.created_at?.split("T")[0];

  const tabsObj: ToggleButtonTabsTypes = {
    leftButtonTitle: "Past",
    leftButtonAction: () => {
      setSessionPageNumber(1);
      setSessopmsDateTab("past");
    },
    rightButtonTitle: "Upcoming",
    rightButtonAction: () => {
      setSessionPageNumber(1);
      setSessopmsDateTab("upcoming");
    },
    activeTab: sessionsDateTab === "past" ? "left" : "right",
  };

  const pendingRequests = rescheduleRequests.filter((r) => r.status === "pending");
  const pendingCancellations = cancellationRequests.filter((r) => r.status === "pending");

  return (
    <div className="page">
      <div className="inner">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/clients")}>
          ← Back to clients
        </Button>

        {pendingRequests.length > 0 && (
          <div className={styles.pendingRequests}>
            <p className={styles.pendingRequestsTitle}>
              <span className={styles.pendingRequestsCount}>{pendingRequests.length}</span>
              Pending reschedule request{pendingRequests.length > 1 ? "s" : ""}
            </p>
            {pendingRequests.map((req) => {
              const linkedSession = clientSessions.find((s) => s.id === req.session_id);
              return (
                <div key={req.id} className={styles.pendingRequest}>
                  <div className={styles.pendingRequestDates}>
                    <span className={styles.pendingFrom}>
                      {linkedSession ? dayjs(linkedSession.scheduled_at).format("D MMM [at] h:mma") : "—"}
                    </span>
                    <span className={styles.pendingArrow}>→</span>
                    <span className={styles.pendingTo}>{dayjs(req.requested_at).format("D MMM [at] h:mma")}</span>
                  </div>
                  {req.message && <p className={styles.pendingMessage}>"{req.message}"</p>}
                  <div className={styles.pendingActions}>
                    <Button size="sm" disabled={resolvingId === req.id} onClick={() => handleAcceptReschedule(req)}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={resolvingId === req.id}
                      onClick={() => handleDeclineReschedule(req)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pendingCancellations.length > 0 && (
          <div className={styles.pendingRequests}>
            <p className={styles.pendingRequestsTitle}>
              <span className={styles.pendingRequestsCount}>{pendingCancellations.length}</span>
              Pending cancellation request{pendingCancellations.length > 1 ? "s" : ""}
            </p>
            {pendingCancellations.map((req) => {
              const linkedSession = clientSessions.find((s) => s.id === req.session_id);
              return (
                <div key={req.id} className={styles.pendingRequest}>
                  <div className={styles.pendingRequestDates}>
                    <span className={styles.pendingFrom}>
                      {linkedSession ? dayjs(linkedSession.scheduled_at).format("D MMM [at] h:mma") : "—"}
                    </span>
                  </div>
                  {req.message && <p className={styles.pendingMessage}>"{req.message}"</p>}
                  <div className={styles.pendingActions}>
                    <Button
                      size="sm"
                      disabled={cancelResolvingId === req.id}
                      onClick={() => handleAcceptCancellation(req)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cancelResolvingId === req.id}
                      onClick={() => handleDeclineCancellation(req)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Profile hero */}
        <div className={styles.hero}>
          <div className={styles.heroLeft}>
            <Avatar name={displayedClientName} imageSrc={client.avatar_url ?? ""} size={80} />
            <div>
              <h1 className={styles.heroName}>{displayedClientName}</h1>
              <p className={styles.heroEmail}>{client.email}</p>
              {clientSince && (
                <p className={styles.heroSince}>Client since {dayjs(clientSince).format("DD/MM/YYYY")}</p>
              )}
              {accountSummaryPreview && <p className={styles.accountSummary}>{accountSummaryPreview}</p>}
            </div>
          </div>

          <div className={styles.heroActions}>
            <SplitButton
              variant="secondary"
              size="sm"
              primaryLabel="Configure client"
              primaryAction={() => setIsConfigOpen(true)}
              options={[
                { label: "Account Summary", onClick: () => setNotesOpen(true) },
                {
                  label: exporting ? "Exporting…" : "Export PDF",
                  onClick: () => setExportPickerOpen(true),
                  disabled: exporting,
                },
              ]}
            />
          </div>
        </div>

        {/* Stats bar */}
        <div className={styles.statsRow}>
          <div className={styles.statBlock}>
            <p className={styles.statValue}>
              {avgScore ?? "—"}
              {avgScore && <span>/10</span>}
            </p>
            <p className={styles.statLabel}>Latest score</p>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statBlock}>
            <p className={styles.statValue}>{clientResponses.length}</p>
            <p className={styles.statLabel}>Check-ins</p>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statBlock}>
            <p className={styles.statValue}>{lastCheckIn}</p>
            <p className={styles.statLabel}>Last check-in</p>
          </div>
        </div>

        {/* Progress chart */}
        <HideableSection id="client-progress-chart">
          <div className={styles.progressSection}>
            <div className={styles.sectionHead}>
              {questionnaireOptions.length > 1 && (
                <div className={styles.progressControls}>
                  <label htmlFor="q-select">Survey</label>
                  <select
                    id="q-select"
                    value={selectedQuestionnaire?.id ?? ""}
                    onChange={(e) => setSelectedQuestionnaireId(e.target.value)}
                  >
                    {questionnaireOptions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {selectedQuestionnaire ? (
              <ProgressChart
                responses={selectedResponses}
                questions={
                  (
                    selectedQuestionnaire as typeof selectedQuestionnaire & {
                      questions?: [];
                    }
                  ).questions ?? []
                }
                title={`${client.first_name}'s Progress`}
              />
            ) : (
              <Card>
                <p className={styles.emptyState}>No check-in data yet.</p>
              </Card>
            )}
          </div>
        </HideableSection>

        {/* Assigned forms */}
        <HideableSection id="client-assigned-forms">
          <Card className={[styles.section, styles.session].join(" ")}>
            <div className={styles.sessionHeading}>
              <h2 className={styles.sectionTitle}>Assigned forms</h2>
            </div>
            {assignedForms.length === 0 ? (
              <p className={styles.sessionEmpty}>No forms assigned to this client yet.</p>
            ) : (
              assignedForms.map((form) => {
                const q = form.questionnaires;
                const hasScaleQs = q?.questions?.some((qn) => qn.type === "scale") ?? false;
                const plotTitle = hasScaleQs
                  ? form.is_plotted
                    ? "Remove from progress chart"
                    : "Use for progress chart"
                  : "This form uses structured scoring — see Form Results below";
                return (
                  <div key={form.id} className={styles.checkInRow}>
                    <span className={styles.checkInForm}>{q?.title ?? "Unknown form"}</span>
                    {q?.form_type && (
                      <span className={styles.checkInScore} style={{ textTransform: "capitalize" }}>
                        {String(q.form_type).replace(/_/g, " ")}
                      </span>
                    )}
                    {q?.frequency && (
                      <span className={styles.checkInScoreNone} style={{ textTransform: "capitalize" }}>
                        {q.frequency}
                      </span>
                    )}
                    {q?.is_active === false && <span className={styles.checkInScoreNone}>Inactive</span>}
                    <button
                      type="button"
                      className={`${styles.plotToggle}${form.is_plotted ? ` ${styles.plotToggleActive}` : ""}`}
                      onClick={() => handleTogglePlot(form.id)}
                      disabled={!hasScaleQs}
                      title={plotTitle}
                    >
                      {form.is_plotted ? "Charting" : "Chart"}
                    </button>
                    <span className={styles.checkInDate} style={{ marginLeft: "auto" }}>
                      Assigned {dayjs(form.assigned_at).format("D MMM YYYY")}
                    </span>
                  </div>
                );
              })
            )}
          </Card>
        </HideableSection>

        {/* Form results — structured view for outcome measures */}
        {formResultGroups.length > 0 && (
          <HideableSection id="client-form-results">
            <Card className={[styles.section, styles.session].join(" ")}>
              <div className={styles.sessionHeading}>
                <h2 className={styles.sectionTitle}>Form Results</h2>
              </div>
              {formResultGroups.map(({ questionnaire: fq, questions, responses: formResponses }) => (
                <div key={fq.id} className={styles.formResultGroup}>
                  <div className={styles.formResultGroupHeader}>
                    <h3 className={styles.formResultGroupTitle}>{fq.title}</h3>
                    <span className={styles.formResultGroupMeta}>
                      {formResponses.length} submission{formResponses.length !== 1 ? "s" : ""} · Last:{" "}
                      {dayjs(formResponses[0].submitted_at ?? formResponses[0].created_at).format("D MMM YYYY")}
                    </span>
                  </div>

                  <div className={styles.tableScroll}>
                    <table className={styles.resultsTable}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          {questions.map((q, i) => (
                            <th key={q.id} title={q.text}>
                              Q{i + 1}
                            </th>
                          ))}
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formResponses.map((r) => (
                          <tr key={r.id}>
                            <td>{dayjs(r.submitted_at ?? r.created_at).format("D MMM YY")}</td>
                            {questions.map((q) => {
                              const v = (r.scores as Record<string, number>)[q.id];
                              return <td key={q.id}>{typeof v === "number" ? v : "–"}</td>;
                            })}
                            <td className={styles.totalCell}>{submissionTotal(questions, r)}</td>
                          </tr>
                        ))}
                        <tr className={styles.avgRow}>
                          <td>Avg</td>
                          {questions.map((q) => (
                            <td key={q.id}>{questionAvg(q.id, formResponses)}</td>
                          ))}
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {questions.length > 0 && (
                    <div className={styles.legendList}>
                      {questions.map((q, i) => (
                        <span key={q.id} className={styles.legendItem}>
                          <strong>Q{i + 1}</strong>
                          {q.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </Card>
          </HideableSection>
        )}

        {/* Sessions */}
        <Card className={[styles.section, styles.session].join(" ")}>
          <div className={styles.sessionHeading}>
            <h2 className={styles.sectionTitle}>Sessions</h2>
            <Button size="sm" onClick={() => setIsScheduleEditorOpen(true)}>
              + New session
            </Button>
          </div>

          <div className={styles.mainActions}>
            <div className={styles.tabsContainer}>
              <ToggleButtonTabs {...tabsObj} />
            </div>

            <div className={styles.searchContainer}>
              <Search
                handleChange={(e) => setSearchTerm(e)}
                placeholder="Find a session..."
                label="Search for a session"
                id="session"
              />
            </div>
          </div>

          <div className={styles.sessionList}>
            {(searchResults.length === 0 && <p className={styles.sessionEmpty}>No sessions found!</p>) ||
              (clientSessions.length === 0 ? (
                <p className={styles.sessionEmpty}>No sessions yet.</p>
              ) : (
                paginateSessions(searchResults, sessionPageNumber ?? 1, maxPageSize).map((s) => (
                  <div
                    key={s.id}
                    id={`session-${s.id}`}
                    className={highlightedSessionId === s.id ? styles.sessionHighlighted : undefined}
                  >
                    <SessionCard
                      session={s}
                      isDemo={isDemo}
                      isAdmin
                      clientLabel={displayedClientName}
                      onNotesClick={(id) => setSelectedNoteSessionId(id)}
                    />
                  </div>
                ))
              ))}

            {searchResults.length > 4 && (
              <div className={styles.sessionPagination}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSessionPageNumber((sessionPageNumber ?? 1) - 1)}
                  disabled={(sessionPageNumber ?? 1) <= 1}
                >
                  ← Prev
                </Button>
                {Math.ceil(searchResults.length / maxPageSize) > 5 && (
                  <span className={styles.pageInput}>
                    <input
                      type="number"
                      min={1}
                      max={Math.ceil(searchResults.length / maxPageSize)}
                      value={sessionPageNumber ?? 1}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        const max = Math.ceil(searchResults.length / maxPageSize);
                        setSessionPageNumber(Math.min(Math.max(val || 1, 1), max));
                      }}
                    />
                    <span className={styles.pageTotal}>of {Math.ceil(searchResults.length / maxPageSize)}</span>
                  </span>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSessionPageNumber((sessionPageNumber ?? 1) + 1)}
                  disabled={(sessionPageNumber ?? 1) >= Math.ceil(searchResults.length / maxPageSize)}
                >
                  Next →
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Danger zone */}
        <div className={styles.dangerZone}>
          <div>
            <p className={styles.dangerTitle}>Remove client</p>
            <p className={styles.dangerDesc}>Permanently deletes this client account and all associated data.</p>
          </div>
          <Button variant="danger" size="sm" disabled={isDemo} onClick={() => setDeleteOpen(true)}>
            Delete client
          </Button>
        </div>
      </div>

      {notesOpen && <SessionNotesModal user={client} onClose={() => setNotesOpen(false)} />}

      {selectedNoteSessionId && (
        <SessionNotesModal
          user={client}
          sessionId={selectedNoteSessionId}
          onClose={() => setSelectedNoteSessionId(null)}
        />
      )}

      {cancelModalSession && (
        <CancelSessionModal
          session={cancelModalSession}
          onClose={() => {
            setCancelModalSession(null);
            loadCancellationRequests();
            dispatch(fetchSessionsByClientId(clientId!));
          }}
        />
      )}

      {isConfigOpen && (
        <Modal
          title="Configure client"
          size="sm"
          onClose={() => setIsConfigOpen(false)}
          actions={
            <Button variant="primary" size="sm" onClick={handleSaveCodename} disabled={savingCodename}>
              {savingCodename ? "Saving…" : "Save codename"}
            </Button>
          }
        >
          <label className={styles.configLabel}>
            Codename
            <input
              className={styles.configInput}
              value={codename}
              onChange={(e) => setCodename(e.target.value)}
              placeholder="Optional — replaces real name in admin UI"
              maxLength={30}
            />
          </label>
          <p className={styles.configHint}>
            Set a codename to show instead of {client.first_name}'s real name across your admin. Leave blank to use
            their real name.
          </p>
        </Modal>
      )}

      {exportPickerOpen && (
        <Modal
          title="Export client PDF"
          size="sm"
          onClose={() => setExportPickerOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setExportPickerOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setExportPickerOpen(false);
                  await handleExport();
                }}
                disabled={exporting || !Object.values(exportSections).some(Boolean)}
              >
                {exporting ? "Exporting…" : "Export PDF"}
              </Button>
            </>
          }
        >
          <p className={styles.exportPickerHint}>Choose what to include in the exported PDF.</p>
          <div className={styles.exportPickerList}>
            {(
              [
                { key: "clientDetails", label: "Client details" },
                { key: "sessions", label: "Session history" },
                { key: "checkIns", label: "Check-in scores" },
                { key: "accountSummary", label: "Account summary" },
                { key: "formResults", label: "Form results" },
              ] as { key: keyof ExportSections; label: string }[]
            ).map(({ key, label }) => (
              <label key={key} className={styles.exportPickerItem}>
                <input
                  type="checkbox"
                  checked={exportSections[key]}
                  onChange={(e) => setExportSections((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
        </Modal>
      )}

      {deleteOpen && (
        <DeleteClientModal
          id={client.id}
          onClose={() => {
            setDeleteOpen(false);
            navigate("/admin/clients");
          }}
          modalTitle="Delete client"
          bodyText={
            <>
              Are you sure you want to delete{" "}
              <strong>
                {client.first_name} {client.last_name}
              </strong>
              ? This cannot be undone.
            </>
          }
        />
      )}

      {isManageSessionsModal && <div>Manage sessions modal</div>}
      {isScheduleEditorOpen && (
        <CreateSessionModal
          clientName={displayedClientName}
          clientId={clientId!}
          onClose={() => setIsScheduleEditorOpen(false)}
        />
      )}
    </div>
  );
}
