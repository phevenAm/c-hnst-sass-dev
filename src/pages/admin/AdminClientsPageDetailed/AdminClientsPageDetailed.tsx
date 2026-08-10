/** biome-ignore-all lint/style/noNonNullAssertion: <explanation> */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import { SessionCard } from "@components/shared/SessionCard/SessionCard";
import type { RescheduleRequest, Session, UserProfile } from "@models/globalTypes";
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

type ExportSections = {
  clientDetails: boolean;
  sessions: boolean;
  checkIns: boolean;
  accountSummary: boolean;
};

export default function AdminClientsPageDetailed() {
  const { clientId } = useParams();
  const navigate = useNavigate();
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
  });
  const [selectedNoteSessionId, setSelectedNoteSessionId] = useState<string | null>(null);
  const [accountSummaryPreview, setAccountSummaryPreview] = useState<string | null>(null);

  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState("");
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
  const [isManageSessionsModal, setIsManageSessionsModal] = useState(false);
  const [sessionPageNumber, setSessionPageNumber] = useState<null | number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const [sessionsDateTab, setSessopmsDateTab] = useState<"upcoming" | "past">("upcoming");

  type AssignedForm = {
    id: string;
    assigned_at: string;
    questionnaires: {
      id: string;
      title: string;
      form_type: string;
      frequency: string | null;
      is_active: boolean;
    } | null;
  };
  const [assignedForms, setAssignedForms] = useState<AssignedForm[]>([]);

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
      .from("questionnaire_assignments")
      .select("id, assigned_at, questionnaires(id, title, form_type, frequency, is_active)")
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

  useRealtimeTable("sessions", clientId ? `client_id=eq.${clientId}` : undefined, () =>
    dispatch(fetchSessionsByClientId(clientId!)),
  );

  // Fetch latest account summary note and decrypt if possible
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
          setAccountSummaryPreview(text.length > 120 ? text.slice(0, 120) + "…" : text);
          return;
        }
        if (data.note_iv && encStatus === "unlocked") {
          try {
            const plain = await decryptNote(data.content as string, data.note_iv as string);
            setAccountSummaryPreview(plain.length > 120 ? plain.slice(0, 120) + "…" : plain);
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
      sections: exportSections,
      responses: selectedResponses,
      questionnaire: selectedQuestionnaire,
      sessions: clientSessions,
      accountSummary: accountSummaryPreview ?? undefined,
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
              assignedForms.map(({ id, assigned_at, questionnaires: q }) => (
                <div key={id} className={styles.checkInRow}>
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
                  <span className={styles.checkInDate} style={{ marginLeft: "auto" }}>
                    Assigned {dayjs(assigned_at).format("D MMM YYYY")}
                  </span>
                </div>
              ))
            )}
          </Card>
        </HideableSection>

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
                  <SessionCard
                    key={s.id}
                    session={s}
                    isDemo={isDemo}
                    isAdmin
                    onNotesClick={(id) => setSelectedNoteSessionId(id)}
                  />
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

      {/* Account summary modal */}
      {notesOpen && <SessionNotesModal user={client} onClose={() => setNotesOpen(false)} />}

      {/* Per-session notes modal */}
      {selectedNoteSessionId && (
        <SessionNotesModal
          user={client}
          sessionId={selectedNoteSessionId}
          onClose={() => setSelectedNoteSessionId(null)}
        />
      )}

      {/* Configure client modal */}
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

      {/* PDF export picker */}
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
