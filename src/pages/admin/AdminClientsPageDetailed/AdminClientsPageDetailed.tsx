/** biome-ignore-all lint/style/noNonNullAssertion: <explanation> */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import { BlockSessionCard } from "@components/shared/BlockSessionCard/BlockSessionCard";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import {
  Avatar,
  Button,
  Card,
  HideableSection,
  LockIcon,
  ProgressChart,
  Search,
  SplitButton,
  ToggleButtonTabs,
} from "@components/shared/index";
import RcadsResultsCard from "@components/shared/RcadsResultsCard/RcadsResultsCard";
import CancelSessionModal from "@components/shared/SessionCard/CancelSessionModal/CancelSessionModal";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import { SessionCard } from "@components/shared/SessionCard/SessionCard";
import SessionPrepCard from "@components/shared/SessionPrepCard/SessionPrepCard";
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
import { groupSessionsForDisplay } from "@/Helpers/sessionGrouping";
import { useCounsellorName } from "@/Hooks/useCounsellorName";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import { supabase } from "@/lib/supabase.js";
import { fetchSessionsByClientId } from "@/store/slices/sessionsSlice";
import DeleteClientModal from "../AdminClientsPage/modals/DeleteClientModal/DeleteClientModal";
import SessionNotesModal from "../AdminClientsPage/modals/SessionNotesModal/SessionNotesModal";
import type { ExportNote, ExportPayment } from "../utils/AdminClientsPageUtils";
import { exportClientPDF, getScoreAverage } from "../utils/AdminClientsPageUtils";

import styles from "./AdminClientsPageDetailed.module.scss";

// ─── Local types ────────────────────────────────────────────

type ExportSections = {
  clientDetails: boolean;
  sessions: boolean;
  checkIns: boolean;
  accountSummary: boolean;
  formResults: boolean;
  payments: boolean;
  sessionNotes: boolean;
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
    is_rcads: boolean;
    questions: AssignedQuestion[];
  } | null;
};

// ─── Helpers ────────────────────────────────────────────────

// Mirrors CheckInPage's FormTab grouping so "where did my other forms go"
// never comes up — each assigned form always sits under its type, even when
// a type currently has none (falls out naturally since empty groups render
// nothing).
const ASSIGNED_FORM_GROUPS: { key: string; label: string }[] = [
  { key: "outcome_measure", label: "Outcome Measures" },
  { key: "feedback", label: "Feedback" },
  { key: "onboarding", label: "Onboarding" },
];

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
  // Declared here (not lower down) so the ?session= deep-link machinery —
  // `targetSessionPage` in particular — can read it. A `const` further down
  // the component body is in the temporal dead zone while those hooks run,
  // which crashed the page the moment `highlightSessionId` became truthy.
  const maxPageSize = 4;
  const dispatch = useAppDispatch();
  const { isDemo, practiceSettings, userProfile } = useAuth();
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
  const [pauseOpen, setPauseOpen] = useState(false);
  const [togglingDisabled, setTogglingDisabled] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [exportSections, setExportSections] = useState<ExportSections>({
    clientDetails: true,
    sessions: true,
    checkIns: true,
    accountSummary: false,
    formResults: false,
    payments: false,
    sessionNotes: false,
  });
  const [selectedNoteSessionId, setSelectedNoteSessionId] = useState<string | null>(null);
  const [accountSummaryPreview, setAccountSummaryPreview] = useState<string | null>(null);
  // Distinct from accountSummaryPreview being null "no summary exists" — this
  // tracks "a summary exists but we can't show it right now" (locked, or
  // encryption never set up) so the UI can say so instead of the line just
  // silently not appearing, which was indistinguishable from no summary.
  const [summaryLocked, setSummaryLocked] = useState(false);
  const [lastSessionNote, setLastSessionNote] = useState<{ content: string; createdAt: string } | null>(null);
  const [lastNoteLocked, setLastNoteLocked] = useState(false);

  // RCADS answers live in rcads_assessments, not `responses` — needed so
  // "Prompt again" and "View details" for it don't rely on formResultGroups,
  // which can never see it.
  const [hasRcadsAssessment, setHasRcadsAssessment] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("rcads_assessments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .then(({ count }) => setHasRcadsAssessment(!!count));
  }, [clientId]);

  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState("");
  // React Router reuses this component across /admin/clients/:clientId
  // navigations (same route, different param) rather than remounting it, so
  // without this the chart kept showing whichever form was selected for the
  // *previous* client — the "prefer the plotted form" effect below only
  // fires when this is empty, and it never got the chance to for the new
  // client.
  // biome-ignore lint/correctness/useExhaustiveDependencies: clientId is the deliberate trigger even though it's not referenced in the body
  useEffect(() => {
    setSelectedQuestionnaireId("");
  }, [clientId]);
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
  const [isManageSessionsModal, _setIsManageSessionsModal] = useState(false);
  const [sessionPageNumber, setSessionPageNumber] = useState<null | number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sessionsDateTab, setSessopmsDateTab] = useState<"upcoming" | "past">("upcoming");

  const [assignedForms, setAssignedForms] = useState<AssignedForm[]>([]);
  const [viewResultsForId, setViewResultsForId] = useState<string | null>(null);
  const [promptingId, setPromptingId] = useState<string | null>(null);

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
        "id, assigned_at, is_plotted, questionnaires(id, title, form_type, frequency, is_active, is_rcads, questions(id, text, type, options, order_index))",
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
          setSummaryLocked(false);
          return;
        }
        if (!data.is_encrypted) {
          const text = data.content as string;
          setAccountSummaryPreview(text?.length > 120 ? `${text.slice(0, 120)}…` : text);
          setSummaryLocked(false);
          return;
        }
        if (data.note_iv && encStatus === "unlocked") {
          try {
            const plain = await decryptNote(data.content as string, data.note_iv as string);
            setAccountSummaryPreview(plain?.length > 120 ? `${plain.slice(0, 120)}…` : plain);
            setSummaryLocked(false);
          } catch {
            setAccountSummaryPreview(null);
            setSummaryLocked(true);
          }
        } else {
          // Encrypted, but we're not unlocked (locked, or encryption was
          // never set up on this practice at all) — a summary exists, we
          // just can't show it right now. Previously this branch did
          // nothing, leaving the preview line blank with no way to tell
          // "no summary" apart from "summary exists but hidden."
          setAccountSummaryPreview(null);
          setSummaryLocked(true);
        }
      });
  }, [clientId, encStatus, decryptNote]);

  // Session-prep card: the most recent note actually tied to a session (as
  // opposed to the account-summary note above, which has session_id null).
  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("session_notes")
      .select("content, is_encrypted, note_iv, created_at")
      .eq("user_id", clientId)
      .not("session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data?.content) {
          setLastSessionNote(null);
          setLastNoteLocked(false);
          return;
        }
        if (!data.is_encrypted) {
          setLastSessionNote({ content: data.content as string, createdAt: data.created_at });
          setLastNoteLocked(false);
          return;
        }
        if (data.note_iv && encStatus === "unlocked") {
          try {
            const plain = await decryptNote(data.content as string, data.note_iv as string);
            setLastSessionNote({ content: plain, createdAt: data.created_at });
            setLastNoteLocked(false);
          } catch {
            setLastSessionNote(null);
            setLastNoteLocked(true);
          }
        } else {
          setLastSessionNote(null);
          setLastNoteLocked(true);
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

  // Non-recurring forms only ever show as "due" to the client once (see
  // CheckInPage's availableAssignments filter) — this re-opens that window
  // without deleting/reassigning, for forms meant to be filled in sporadically
  // rather than on a fixed cadence.
  const handlePromptAgain = async (formId: string) => {
    setPromptingId(formId);
    const { error } = await supabase
      .from("questionnaire_assignments")
      .update({ prompt_again_at: new Date().toISOString() })
      .eq("id", formId);
    setPromptingId(null);
    if (error) {
      showToast("Failed to prompt client", "danger");
      return;
    }
    showToast("Client will be prompted to fill this in again");
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

  // Pause / restore a client's access. `disabled` is enforced app-side in
  // AuthContext: a paused client can't sign in and is signed out of any live
  // session on their next token refresh (or sooner, via the realtime watch).
  const setClientDisabled = async (disabled: boolean) => {
    if (!clientId) return;
    setTogglingDisabled(true);
    const { error } = await supabase.from("users").update({ disabled }).eq("id", clientId);
    setTogglingDisabled(false);
    setPauseOpen(false);
    if (error) {
      showToast(`Couldn't ${disabled ? "pause" : "restore"} this client.`, "danger");
      return;
    }
    dispatch(fetchAllUsers());
    showToast(disabled ? "Client paused — they can no longer sign in." : "Client access restored.");
  };

  const displayedClientName = client ? clientDisplayName(client, practiceSettings?.use_client_codenames ?? false) : "";

  const questionnaireOptions = useMemo(
    () => questionnaires.filter((q) => clientResponses.some((r) => r.questionnaire_id === q.id)),
    [questionnaires, clientResponses],
  );

  const clientSessions = useAppSelector((state) => state.sessions.sessions);

  // Prep card: soonest still-scheduled session, and the most recent completed
  // one (for "last seen").
  const nextSession = [...clientSessions]
    .filter((s) => s.status === "scheduled" && new Date(s.scheduled_at) > new Date())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
  const totalSessionsCount = clientSessions.length;
  const attendedSessionsCount = clientSessions.filter((s) => s.status === "completed").length;
  const lastSeenSession = [...clientSessions]
    .filter((s) => s.status === "completed")
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0];

  const [reminderMuted, setReminderMuted] = useState(false);
  const [muteRowId, setMuteRowId] = useState<string | null>(null);
  const [togglingMute, setTogglingMute] = useState(false);

  useEffect(() => {
    if (!userProfile?.id || !clientId) return;
    supabase
      .from("admin_reminder_mutes")
      .select("id")
      .eq("admin_id", userProfile.id)
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        setReminderMuted(!!data);
        setMuteRowId(data?.id ?? null);
      });
  }, [userProfile?.id, clientId]);

  const handleToggleReminderMute = async () => {
    if (!userProfile?.id || !clientId) return;
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
        .insert({ admin_id: userProfile.id, client_id: clientId })
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
    if (!client || !clientId) return;
    setExporting(true);

    let payments: ExportPayment[] = [];
    if (exportSections.payments) {
      const { data } = await supabase
        .from("payments")
        .select("paid_at, amount_pence, description")
        .eq("client_id", clientId);
      payments = data ?? [];
    }

    let notes: ExportNote[] = [];
    if (exportSections.sessionNotes) {
      if (encStatus !== "unlocked") {
        showToast("Unlock encryption (open any session's notes) to include session notes in the export", "danger");
      } else {
        const { data } = await supabase
          .from("session_notes")
          .select("content, is_encrypted, note_iv, created_at, session_id")
          .eq("user_id", clientId);
        notes = await Promise.all(
          (data ?? []).map(async (n) => {
            const sessionDate = clientSessions.find((s) => s.id === n.session_id)?.scheduled_at ?? null;
            if (n.is_encrypted && n.note_iv) {
              try {
                return { created_at: n.created_at, sessionDate, content: await decryptNote(n.content, n.note_iv) };
              } catch {
                return { created_at: n.created_at, sessionDate, content: "[Could not decrypt]" };
              }
            }
            return { created_at: n.created_at, sessionDate, content: n.content };
          }),
        );
      }
    }

    await exportClientPDF({
      user: client,
      sections: exportSections,
      responses: selectedResponses,
      questionnaire: selectedQuestionnaire,
      sessions: clientSessions,
      accountSummary: accountSummaryPreview ?? undefined,
      formResults: formResultGroups,
      payments,
      notes,
    });
    setExporting(false);
  };

  const sessionsGroupByType = useMemo((): Session[] => {
    const now = new Date();
    return clientSessions.filter((session) => {
      // state.sessions.sessions is a shared list — if the last page to fill it
      // was a whole-practice fetch, guard against showing another client's
      // sessions here until fetchSessionsByClientId replaces it.
      if (clientId && session.client_id && session.client_id !== clientId) return false;
      const scheduledAt = new Date(session.scheduled_at);
      return sessionsDateTab === "upcoming" ? scheduledAt >= now : scheduledAt < now;
    });
  }, [sessionsDateTab, clientSessions, clientId]);

  const searchResults = useMemo(
    (): Session[] =>
      searchTerm.length > 0
        ? sessionsGroupByType.filter((s) => {
            const dateStr =
              `${dayjs(s.scheduled_at).format("dddd D MMMM YYYY")} ${dayjs(s.scheduled_at).format("D MMM YYYY")}`.toLowerCase();
            return (
              s.notes?.toLowerCase().includes(searchTerm.toLowerCase()) || dateStr.includes(searchTerm.toLowerCase())
            );
          })
        : sessionsGroupByType,
    [sessionsGroupByType, searchTerm],
  );

  // Group block bookings into one item BEFORE paginating — otherwise a block
  // whose sessions straddle a page boundary loses its grouping (each page
  // slice sees <2 of the block's sessions) and renders as loose single cards,
  // and it also means "N sessions coming up" that's really one block no
  // longer eats N of the page's rows. Past tab never groups (a past session
  // isn't a live block a counsellor acts on).
  const sessionRenderItems = useMemo(
    () =>
      sessionsDateTab === "past"
        ? searchResults.map((session) => ({ kind: "single" as const, session }))
        : groupSessionsForDisplay(searchResults),
    [searchResults, sessionsDateTab],
  );

  const totalSessionPages = Math.max(1, Math.ceil(sessionRenderItems.length / maxPageSize));

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
    const idx = sessionRenderItems.findIndex((item) =>
      item.kind === "single"
        ? item.session.id === highlightSessionId
        : item.sessions.some((s) => s.id === highlightSessionId),
    );
    return idx === -1 ? null : Math.floor(idx / maxPageSize) + 1;
  }, [highlightSessionId, sessionRenderItems]);

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
            <Button variant="secondary" className={styles.backButton} onClick={() => navigate("/admin/clients")}>
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
        <Button variant="ghost" className={styles.backButton} size="sm" onClick={() => navigate("/admin/clients")}>
          ← Back to clients
        </Button>

        {nextSession && (
          <SessionPrepCard
            nextSessionAt={nextSession.scheduled_at}
            totalSessions={totalSessionsCount}
            attendedSessions={attendedSessionsCount}
            lastSeenAt={lastSeenSession?.scheduled_at ?? null}
            lastNote={lastSessionNote}
            notesLocked={lastNoteLocked}
            onManageSession={() => {
              // Reuse the ?session=<id> deep-link machinery — it switches the
              // tab, pages to the right slice, scrolls and flash-highlights.
              handledHighlightRef.current = null;
              setSearchParams({ session: nextSession.id });
            }}
            onViewNotes={() => setNotesOpen(true)}
          />
        )}

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
              {practiceSettings?.consent_enabled && (
                <p className={client.has_consented ? styles.consentYes : styles.consentNo}>
                  {client.has_consented
                    ? `Signed${client.consent_signed_name ? ` by ${client.consent_signed_name}` : ""}${client.consented_at ? ` on ${dayjs(client.consented_at).format("DD/MM/YYYY")}` : ""}`
                    : "Has not agreed to consent terms yet"}
                </p>
              )}
              {accountSummaryPreview && <p className={styles.accountSummary}>{accountSummaryPreview}</p>}
              {!accountSummaryPreview && summaryLocked && (
                <p className={styles.accountSummaryLocked}>
                  <LockIcon />
                  {encStatus === "disabled"
                    ? "This client has an account summary, but note encryption isn't set up yet — open Account Summary to set it up."
                    : "This client has an account summary — open Account Summary to unlock and view it."}
                </p>
              )}
            </div>
          </div>

          <div className={styles.heroActions}>
            <SplitButton
              variant="secondary"
              size="sm"
              primaryLabel="Configure client"
              primaryAction={() => setIsConfigOpen(true)}
              options={[
                {
                  label: exporting ? "Exporting…" : "Export PDF",
                  onClick: () => setExportPickerOpen(true),
                  disabled: exporting,
                },
                {
                  label: reminderMuted ? "Unmute session reminders" : "Mute session reminders",
                  onClick: handleToggleReminderMute,
                  disabled: togglingMute,
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

        {/* Progress chart — auto-picks the plotted (or first available) form; see
            the preference useEffect above. Which one shows is controlled from the
            "Chart"/"Charting" toggle on each assigned form below, not here. */}
        <HideableSection id="client-progress-chart">
          <div className={styles.progressSection}>
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
              ASSIGNED_FORM_GROUPS.map(({ key, label }) => {
                const forms = assignedForms.filter((f) => (f.questionnaires?.form_type ?? "outcome_measure") === key);
                if (forms.length === 0) return null;
                return (
                  <div key={key} className={styles.formTypeGroup}>
                    <h3 className={styles.formTypeGroupLabel}>{label}</h3>
                    {forms.map((form) => {
                      const q = form.questionnaires;
                      const isRcads = !!q?.is_rcads;
                      const hasScaleQs = q?.questions?.some((qn) => qn.type === "scale") ?? false;
                      const hasResults = isRcads
                        ? hasRcadsAssessment
                        : formResultGroups.some((g) => g.questionnaire.id === q?.id);
                      const canPromptAgain = !q?.frequency && hasResults;
                      return (
                        <div key={form.id} className={styles.checkInRow}>
                          <div className={styles.checkInFormGroup}>
                            <span className={styles.checkInForm}>{q?.title ?? "Unknown form"}</span>
                            {q?.form_type && (
                              <span className={styles.checkInScore} style={{ textTransform: "capitalize" }}>
                                {String(q.form_type).replace(/_/g, " ")}
                              </span>
                            )}
                            {q?.frequency && (
                              <span className={styles.checkInScore} style={{ textTransform: "capitalize" }}>
                                {q.frequency}
                              </span>
                            )}
                            {q?.is_active === false && <span className={styles.checkInScoreNone}>Inactive</span>}
                          </div>
                          <div className={styles.checkInFormActions}>
                            {q && (
                              <button
                                type="button"
                                className={styles.plotToggle}
                                onClick={() => setViewResultsForId(q.id)}
                              >
                                View details
                              </button>
                            )}
                            {hasScaleQs && (
                              <button
                                type="button"
                                className={`${styles.plotToggle}${form.is_plotted ? ` ${styles.plotToggleActive}` : ""}`}
                                onClick={() => handleTogglePlot(form.id)}
                                title={form.is_plotted ? "Remove from progress chart" : "Use for progress chart"}
                              >
                                {form.is_plotted ? "Charting" : "Chart"}
                              </button>
                            )}

                            {canPromptAgain && (
                              <button
                                type="button"
                                className={styles.plotToggle}
                                onClick={() => handlePromptAgain(form.id)}
                                disabled={promptingId === form.id}
                                title="Ask the client to fill this in again"
                              >
                                {promptingId === form.id ? "Prompting…" : "Prompt again"}
                              </button>
                            )}
                            <span className={styles.checkInDate}>
                              Assigned {dayjs(form.assigned_at).format("D MMM YYYY")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </Card>
        </HideableSection>

        {/* Form details — opened per-form from the "View details" button above */}
        {viewResultsForId &&
          (() => {
            const group = formResultGroups.find((g) => g.questionnaire.id === viewResultsForId);
            const assignment = assignedForms.find((f) => f.questionnaires?.id === viewResultsForId);
            const fq = group?.questionnaire ?? assignment?.questionnaires;
            if (!fq) return null;

            if (fq.is_rcads) {
              return (
                <Modal title={fq.title} onClose={() => setViewResultsForId(null)} size="lg">
                  {clientId && <RcadsResultsCard clientId={clientId} />}
                </Modal>
              );
            }

            if (!group) {
              return (
                <Modal title={fq.title} onClose={() => setViewResultsForId(null)} size="lg">
                  <p className={styles.emptyState}>No responses yet.</p>
                </Modal>
              );
            }

            const { questions, responses: formResponses } = group;
            return (
              <Modal title={fq.title} onClose={() => setViewResultsForId(null)} size="lg">
                <div className={styles.formResultGroup}>
                  <span className={styles.formResultGroupMeta}>
                    {formResponses.length} submission{formResponses.length !== 1 ? "s" : ""} · Last:{" "}
                    {dayjs(formResponses[0].submitted_at ?? formResponses[0].created_at).format("D MMM YYYY")}
                  </span>

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
              </Modal>
            );
          })()}

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
                (() => {
                  const page = Math.min(sessionPageNumber ?? 1, totalSessionPages);
                  const pageItems = sessionRenderItems.slice((page - 1) * maxPageSize, page * maxPageSize);

                  return pageItems.map((item) => {
                    if (item.kind === "block") {
                      const highlightedInBlock =
                        !!highlightedSessionId && item.sessions.some((x) => x.id === highlightedSessionId);
                      const anchorId = highlightedInBlock ? highlightedSessionId : item.sessions[0].id;
                      return (
                        <BlockSessionCard
                          key={item.sessions[0].id}
                          id={`session-${anchorId}`}
                          className={highlightedInBlock ? styles.sessionHighlighted : undefined}
                          sessions={item.sessions}
                          isAdmin
                          isDemo={isDemo}
                          clientLabel={displayedClientName}
                          onNotesClick={(id) => setSelectedNoteSessionId(id)}
                          initialActiveId={highlightSessionId ?? undefined}
                        />
                      );
                    }
                    const s = item.session;
                    return (
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
                    );
                  });
                })()
              ))}

            {sessionRenderItems.length > maxPageSize && (
              <div className={styles.sessionPagination}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSessionPageNumber((sessionPageNumber ?? 1) - 1)}
                  disabled={(sessionPageNumber ?? 1) <= 1}
                >
                  ← Prev
                </Button>
                {totalSessionPages > 5 && (
                  <span className={styles.pageInput}>
                    <input
                      type="number"
                      min={1}
                      max={totalSessionPages}
                      value={sessionPageNumber ?? 1}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSessionPageNumber(Math.min(Math.max(val || 1, 1), totalSessionPages));
                      }}
                    />
                    <span className={styles.pageTotal}>of {totalSessionPages}</span>
                  </span>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSessionPageNumber((sessionPageNumber ?? 1) + 1)}
                  disabled={(sessionPageNumber ?? 1) >= totalSessionPages}
                >
                  Next →
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Danger zone */}
        <div className={styles.dangerZone}>
          <div className={styles.dangerRow}>
            <div>
              <p className={styles.dangerTitle}>
                {client?.disabled ? "Client access is paused" : "Pause client access"}
              </p>
              <p className={styles.dangerDesc}>
                {client?.disabled
                  ? "They can't sign in, and were signed out of any live session. Restore access whenever you're ready."
                  : "Blocks sign-in and signs them out of the app. Their data is kept — this is reversible."}
              </p>
            </div>
            {client?.disabled ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={isDemo || togglingDisabled}
                onClick={() => setClientDisabled(false)}
              >
                Restore access
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={isDemo || togglingDisabled}
                onClick={() => setPauseOpen(true)}
              >
                Pause client
              </Button>
            )}
          </div>

          <div className={styles.dangerRow}>
            <div>
              <p className={styles.dangerTitle}>Remove client</p>
              <p className={styles.dangerDesc}>Permanently deletes this client account and all associated data.</p>
            </div>
            <Button variant="danger" size="sm" disabled={isDemo} onClick={() => setDeleteOpen(true)}>
              Delete client
            </Button>
          </div>
        </div>
      </div>

      {pauseOpen && (
        <ConfirmModal
          title="Pause this client?"
          confirmLabel="Pause client"
          confirming={togglingDisabled}
          onConfirm={() => setClientDisabled(true)}
          onClose={() => setPauseOpen(false)}
        >
          <p>
            They won't be able to sign in. If they're using the app right now, they'll be signed out within a minute.
          </p>
          <p>Nothing is deleted — you can restore their access at any time.</p>
        </ConfirmModal>
      )}

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

          <div className={styles.configSection}>
            <p className={styles.configLabel}>Account Summary</p>
            <p className={styles.configHint}>A running note about this client, separate from per-session notes.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsConfigOpen(false);
                setNotesOpen(true);
              }}
            >
              Open Account Summary
            </Button>
          </div>
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
                { key: "payments", label: "Payments" },
                {
                  key: "sessionNotes",
                  label: "Session notes",
                  disabledHint: encStatus !== "unlocked" ? "unlock encryption first — open any session's notes" : null,
                },
              ] as { key: keyof ExportSections; label: string; disabledHint?: string | null }[]
            ).map(({ key, label, disabledHint }) => (
              <label
                key={key}
                className={styles.exportPickerItem}
                title={disabledHint ?? undefined}
                style={disabledHint ? { opacity: 0.5 } : undefined}
              >
                <input
                  type="checkbox"
                  checked={exportSections[key]}
                  disabled={!!disabledHint}
                  onChange={(e) => setExportSections((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
                {disabledHint && <span className={styles.exportPickerHintInline}> ({disabledHint})</span>}
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
