/** biome-ignore-all lint/style/noNonNullAssertion: <explanation> */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import dayjs from "dayjs";

import { Avatar, Button, Card, ProgressChart, Search, ToggleButtonTabs } from "@components/shared/index";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import { SessionCard } from "@components/shared/SessionCard/SessionCard";
import type { RescheduleRequest, Session, UserProfile } from "@models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchQuestionnaires, selectAllQuestionnaires } from "@store/slices/questionnairesSlice";
import { fetchAllResponses, selectResponsesByUser } from "@store/slices/responsesSlice";
import { fetchAllUsers, selectAllUsers } from "@store/slices/userDirectorySlice";

import Spinner from "@/components/shared/Spinner/Spinner";
import { ToggleButtonTabsTypes } from "@/components/shared/ToggleButtonTabs/ToggleButtonTabs";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { isPageStatusLoading } from "@/Helpers/Helpers";
import { useCounsellorName } from "@/Hooks/useCounsellorName";
import { supabase } from "@/lib/supabase.js";
import { fetchSessionsByClientId } from "@/store/slices/sessionsSlice";
import DeleteClientModal from "../AdminClientsPage/modals/DeleteClientModal/DeleteClientModal";
import SessionNotesModal from "../AdminClientsPage/modals/SessionNotesModal/SessionNotesModal";
import { exportClientPDF, getScoreAverage } from "../utils/AdminClientsPageUtils";

import styles from "./AdminClientsPageDetailed.module.scss";

export default function AdminClientsPageDetailed() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isDemo } = useAuth();
  const { showToast } = useToast();

  const allUsers = useAppSelector(selectAllUsers) as UserProfile[];
  const questionnaires = useAppSelector(selectAllQuestionnaires);
  const questionnairesStatus = useAppSelector((state: RootState) => state.questionnaires.status);
  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const responsesStatus = useAppSelector((state: RootState) => state.responses.status);
  const sessionsStatus = useAppSelector((state: RootState) => state.sessions.status);
  const clientResponses = useAppSelector(selectResponsesByUser(clientId ?? ""));

  const counsellorName = useCounsellorName();
  const [rescheduleRequests, setRescheduleRequests] = useState<RescheduleRequest[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [notesOpen, setNotesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState("");
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
  const [isManageSessionsModal, setIsManageSessionsModal] = useState(false);
  const [sessionPageNumber, setSessionPageNumber] = useState<null | number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const [sessionsDateTab, setSessopmsDateTab] = useState<"upcoming" | "past">("upcoming");

  useFetchOnIdle(
    (state: RootState) => state.sessions.status,
    () => fetchSessionsByClientId(clientId!),
    "Failed to fetch questionnaires:",
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
    supabase
      .from("reschedule_requests")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRescheduleRequests(data as RescheduleRequest[]);
      });
  }, [clientId]);

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

  const client = allUsers.find((u) => u.id === clientId);

  const questionnaireOptions = useMemo(
    () => questionnaires.filter((q) => clientResponses.some((r) => r.questionnaire_id === q.id)),
    [questionnaires, clientResponses],
  );

  //! is there a selector for this? nah, i shuld just fetch sessions by id. i have a THUNK for that
  const clientSessions = useAppSelector((state) => state.sessions.sessions);

  useEffect(() => {
    if (!selectedQuestionnaireId && questionnaireOptions[0]) {
      setSelectedQuestionnaireId(questionnaireOptions[0].id);
    }
  }, [questionnaireOptions, selectedQuestionnaireId]);

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

  const handleExport = async () => {
    if (!client) return;
    setExporting(true);
    await exportClientPDF({
      user: client,
      responses: selectedResponses,
      questionnaire: selectedQuestionnaire,
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

  const maxPageSize = 4;

  const guard = isPageStatusLoading(usersStatus, questionnairesStatus, responsesStatus, sessionsStatus);
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

  return (
    <div className="page">
      <div className="inner">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/clients")}>
          ← Back to clients
        </Button>

        {/* TODO Section 5 — per-client attendance stats strip
            Add a small stats row here between the back button and the profile hero.
            Data comes from the sessions already fetched below (clientSessions).
            Show: total sessions · attended · no-shows · attendance % · unpaid count
            Derive from clientSessions: filter by status/attended fields, count each bucket.
            Aggregate view across all clients lives in AdminScheduler. */}

        {/* Profile hero */}
        <div className={styles.hero}>
          <div className={styles.heroLeft}>
            <Avatar name={`${client.first_name} ${client.last_name}`} imageSrc={client.avatar_url ?? ""} size={80} />
            <div>
              <h1 className={styles.heroName}>
                {client.first_name} {client.last_name}
              </h1>
              <p className={styles.heroEmail}>{client.email}</p>
              {clientSince && (
                <p className={styles.heroSince}>Client since {dayjs(clientSince).format("DD/MM/YYYY")}</p>
              )}
            </div>
          </div>

          <div className={styles.heroActions}>
            <Button variant="secondary" size="sm" onClick={() => setNotesOpen(true)}>
              Notes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={exporting || selectedResponses.length === 0}
            >
              {exporting ? "Exporting…" : "Export PDF"}
            </Button>
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

        {/* Progress chart — ProgressChart renders its own Card, so no outer wrapper */}
        <div className={styles.progressSection}>
          <div className={styles.sectionHead}>
            {questionnaireOptions.length > 1 && (
              <div className={styles.progressControls}>
                <label htmlFor="q-select">Questionnaire</label>
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

        {rescheduleRequests.some((r) => r.status === "pending") && (
          <div className={styles.pendingRequests}>
            <p className={styles.pendingRequestsTitle}>Pending reschedule requests</p>
            {rescheduleRequests
              .filter((r) => r.status === "pending")
              .map((req) => {
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
                  <SessionCard key={s.id} session={s} isDemo={isDemo} isAdmin />
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
          clientName={client.display_name || client.first_name}
          clientId={clientId!}
          onClose={() => setIsScheduleEditorOpen(false)}
        />
      )}
    </div>
  );
}
