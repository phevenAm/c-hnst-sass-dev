import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import Avatar from "@components/shared/Avatar/Avatar";
import Badge from "@components/shared/Badge/Badge";
import Card from "@components/shared/Card/Card";
import FirstClientTipsModal from "@components/shared/FirstClientTipsModal/FirstClientTipsModal";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { supabase } from "@lib/supabase";
import type { ClientStub, Questionnaire, Response, UserProfile } from "@models/globalTypes";
import { useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { deleteClientStub, fetchClientStubs, selectAllStubs } from "@store/slices/clientStubsSlice";
import { fetchPracticeSettings } from "@store/slices/practiceSettingsSlice";
import { fetchAllAssignments, selectPlottedAssignmentByUser } from "@store/slices/questionnaireAssignmentsSlice";
import { fetchQuestionnaires, selectAllQuestionnaires } from "@store/slices/questionnairesSlice";
import { fetchAllResponses, selectResponsesByUser } from "@store/slices/responsesSlice";
import { fetchAllUsers, selectAllUsers, unarchiveClient } from "@store/slices/userDirectorySlice";

import { Button } from "@/components/shared";
import HideableSection from "@/components/shared/HideableSection/HideableSection";
import Search from "@/components/shared/Search/Search";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { clientDisplayName, isPageStatusLoading } from "@/Helpers/Helpers";
import { useAppDispatch } from "@/store/hooks";
import InviteStubModal from "../AdminStubDetailPage/InviteStubModal";
import { getScoreAverage } from "../utils/AdminClientsPageUtils";
import AccessTokenModal from "./modals/AccessTokenModal/AccessTokenModal";
import CreateStubModal from "./modals/CreateStubModal/CreateStubModal";
import DeleteClientModal from "./modals/DeleteClientModal/DeleteClientModal";
import ImportStubsModal from "./modals/ImportStubsModal/ImportStubsModal";
import InviteClientModal from "./modals/InviteClientModal/InviteClientModal";
import ManageTokensModal from "./modals/ManageTokensModal/ManageTokensModal";
import MergeStubModal from "./modals/MergeStubModal/MergeStubModal";
import SessionNotesModal from "./modals/SessionNotesModal/SessionNotesModal";

import styles from "./AdminClientsPage.module.scss";

const getQuestionnaireForResponse = (response: Response | undefined, questionnaires: Questionnaire[]) => {
  if (!response) return undefined;
  return questionnaires.find((questionnaire) => questionnaire.id === response.questionnaire_id);
};

// ── Real client row ───────────────────────────────────────────

function ClientRow({ user }: { user: UserProfile }) {
  const allResponses = useAppSelector(selectResponsesByUser(user.id));
  const questionnaires = useAppSelector(selectAllQuestionnaires);
  const plottedAssignment = useAppSelector(selectPlottedAssignmentByUser(user.id));
  const { practiceSettings } = useAuth();
  const displayName = clientDisplayName(user, practiceSettings?.use_client_codenames ?? false);

  const questionnaireOptions = useMemo(
    () =>
      questionnaires.filter((questionnaire) =>
        allResponses.some((response) => response.questionnaire_id === questionnaire.id),
      ),
    [questionnaires, allResponses],
  );

  const latestResponse = allResponses[allResponses.length - 1];
  const latestQuestionnaire = getQuestionnaireForResponse(latestResponse, questionnaires);
  const lastCheckIn = latestResponse
    ? dayjs(latestResponse.submitted_at ?? latestResponse.created_at).format("D MMM YYYY")
    : "–";

  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState("");
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isNotesOpen, setNotesOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedQuestionnaireId && questionnaireOptions[0]?.id) {
      setSelectedQuestionnaireId(questionnaireOptions[0].id);
    }
  }, [questionnaireOptions, selectedQuestionnaireId]);

  const _selectedQuestionnaire =
    questionnaireOptions.find((questionnaire) => questionnaire.id === selectedQuestionnaireId) ??
    questionnaireOptions[0];

  const avgScore = getScoreAverage(latestResponse, latestQuestionnaire);

  let signedLabel = "–";
  if (user.has_consented) {
    signedLabel = user.consented_at ? dayjs(user.consented_at).format("D MMM YYYY") : "Yes";
  }

  const handleRowClick = () => navigate(`/admin/clients/${user.id}`);
  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleRowClick();
    }
  };

  return (
    <>
      <div
        className={styles.clientRow}
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
      >
        <Avatar name={displayName} imageSrc={user.avatar_url ?? ""} size={40} />

        <div className={styles.clientMeta}>
          <p className={styles.clientName}>
            <span>{displayName}</span>
            {user.disabled && <Badge variant="warning">Paused</Badge>}
          </p>
          <p className={styles.clientEmail}>{user.email}</p>
          {plottedAssignment?.questionnaires?.title && (
            <p className={styles.clientPlotted}>Charting: {plottedAssignment.questionnaires.title}</p>
          )}
        </div>

        <div className={styles.statBlock}>
          <p className={styles.statValue}>
            {avgScore ?? "–"}
            <span>/10</span>
          </p>
          <p className={styles.statLabel}>Latest</p>
        </div>

        <div className={styles.statBlock}>
          <p className={styles.statValue}>{allResponses.length}</p>
          <p className={styles.statLabel}>Check-ins</p>
        </div>

        <div className={styles.statBlock}>
          <p className={styles.statValueDate}>{lastCheckIn}</p>
          <p className={styles.statLabel}>Last check-in</p>
        </div>

        {practiceSettings?.consent_enabled && (
          <div className={styles.statBlock}>
            <p className={styles.statValueDate}>{signedLabel}</p>
            <p className={styles.statLabel}>Signed</p>
          </div>
        )}

        <div className={styles.rowActions} onClick={(event) => event.stopPropagation()}>
          <SplitButton
            primaryLabel="Manage"
            primaryAction={() => navigate(`/admin/clients/${user.id}`)}
            options={[{ label: "Remove", onClick: () => setDeleteModalOpen(true) }]}
            secondaryLabel="More options"
            variant="secondary"
          />
        </div>
      </div>

      {isDeleteModalOpen && (
        <DeleteClientModal
          id={user.id}
          onClose={() => setDeleteModalOpen(false)}
          modalTitle="Delete user"
          bodyText={
            <>
              Are you sure you want to delete <strong>{displayName}</strong>?
            </>
          }
        />
      )}

      {isNotesOpen && <SessionNotesModal user={user} onClose={() => setNotesOpen(false)} />}
    </>
  );
}

// ── Offline client row ────────────────────────────────────────

function StubRow({ stub }: { stub: ClientStub }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isDemo, practiceSettings } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const platformClients = (useAppSelector(selectAllUsers) as UserProfile[]).filter(
    (u) => u.role !== "admin" && !u.deleted_at && !u.archived_at,
  );
  const selectedUser = platformClients.find((c) => c.id === selectedUserId) ?? null;

  const useCodenames = practiceSettings?.use_client_codenames ?? false;
  const displayName = useCodenames
    ? stub.codename || `${stub.first_name} ${stub.last_name}`
    : `${stub.first_name} ${stub.last_name}`;

  const handleDelete = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setDeleting(true);
    try {
      await dispatch(deleteClientStub(stub.id)).unwrap();
      showToast("Offline client removed.");
    } catch {
      showToast("Failed to delete client.", "danger");
      setDeleting(false);
    }
  };

  if (linkOpen) {
    return (
      <div className={styles.stubRow}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: 0 }}>
            Link <strong>{displayName}</strong> to an existing platform client.
          </p>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{
              padding: "6px 10px",
              border: "1.5px solid var(--border)",
              borderRadius: "var(--r-md)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              fontFamily: "var(--font-sans)",
              outline: "none",
              maxWidth: "280px",
            }}
          >
            <option value="">Choose a platform client…</option>
            {platformClients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientDisplayName(c, useCodenames)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.rowActions}>
          <Button size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => setMergeOpen(true)} disabled={!selectedUserId}>
            Review merge →
          </Button>
        </div>
        {mergeOpen && selectedUser && (
          <MergeStubModal
            stub={stub}
            realUser={selectedUser}
            onClose={() => setMergeOpen(false)}
            onMerged={() => {
              setMergeOpen(false);
              setLinkOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className={styles.stubRow}>
        <p style={{ flex: 1, fontSize: "0.88rem", color: "var(--text-secondary)", margin: 0 }}>
          Delete <strong>{displayName}</strong>? This removes all sessions and notes.
        </p>
        <div className={styles.rowActions}>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    );
  }

  const handleRowClick = () => navigate(`/admin/clients/stub/${stub.id}`);
  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") handleRowClick();
  };

  return (
    <>
      <div className={styles.stubRow} onClick={handleRowClick} onKeyDown={handleRowKeyDown} role="button" tabIndex={0}>
        <Avatar name={displayName} imageSrc="" size={40} />

        <div className={styles.clientMeta}>
          <p className={styles.clientName}>{displayName}</p>
          {stub.email ? (
            <p className={styles.clientEmail}>{stub.email}</p>
          ) : (
            <p className={styles.clientEmail} style={{ fontStyle: "italic" }}>
              No email
            </p>
          )}
        </div>

        <span className={stub.linked_user_id ? styles.badgeLinked : styles.badgeUnlinked}>
          {stub.linked_user_id ? "Linked" : "Offline"}
        </span>

        <p className={styles.stubDate}>Added {dayjs(stub.created_at).format("D MMM YYYY")}</p>

        <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
          <SplitButton
            primaryLabel="Manage"
            primaryAction={() => navigate(`/admin/clients/stub/${stub.id}`)}
            options={[
              { label: "Edit", onClick: () => setEditOpen(true) },
              ...(stub.email && !stub.linked_user_id
                ? [{ label: "Send invite email", onClick: () => setInviteOpen(true) }]
                : []),
              { label: "Delete", onClick: () => setConfirmDelete(true) },
              {
                label: "Link to real client",
                onClick: () => {
                  setSelectedUserId("");
                  setLinkOpen(true);
                },
              },
            ]}
            secondaryLabel="More options"
            variant="secondary"
          />
        </div>
      </div>

      {editOpen && <CreateStubModal existing={stub} onClose={() => setEditOpen(false)} />}
      {inviteOpen && <InviteStubModal stub={stub} onClose={() => setInviteOpen(false)} />}
    </>
  );
}

// ── Archived (deactivated) client row ─────────────────────────

function ArchivedClientRow({ user }: { user: UserProfile }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { practiceSettings, isDemo } = useAuth();
  const [restoring, setRestoring] = useState(false);
  const displayName = clientDisplayName(user, practiceSettings?.use_client_codenames ?? false);

  const handleReactivate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRestoring(true);
    try {
      await dispatch(unarchiveClient(user.id)).unwrap();
      showToast("Client reactivated.");
    } catch {
      showToast("Couldn't reactivate this client.", "danger");
      setRestoring(false);
    }
  };

  return (
    <div
      className={styles.clientRow}
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/admin/clients/${user.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/admin/clients/${user.id}`);
        }
      }}
    >
      <Avatar name={displayName} imageSrc={user.avatar_url ?? ""} size={40} />
      <div className={styles.clientMeta}>
        <p className={styles.clientName}>{displayName}</p>
        <p className={styles.clientEmail}>
          Deactivated{user.archived_at ? ` ${dayjs(user.archived_at).format("D MMM YYYY")}` : ""}
          {user.anonymised_at ? " · anonymised" : ""}
        </p>
      </div>
      <Button variant="secondary" size="sm" disabled={isDemo || restoring} onClick={handleReactivate}>
        Reactivate
      </Button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function AdminClientsPage() {
  const { userProfile } = useAuth();
  const dispatch = useAppDispatch();
  const allUsers = useAppSelector(selectAllUsers) as UserProfile[];
  const allStubs = useAppSelector(selectAllStubs);
  const unlinkedStubs = useMemo(() => allStubs.filter((s) => !s.linked_user_id), [allStubs]);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [manageTokensModal, setManageTokensModal] = useState(false);
  const [createStubOpen, setCreateStubOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tipsDismissed, setTipsDismissed] = useState(false);
  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const questionnairesStatus = useAppSelector((state: RootState) => state.questionnaires.status);

  useFetchOnIdle(
    (state: RootState) => state.userDirectory.status,
    () => fetchAllUsers(),
    "Failed to fetch users:",
  );
  useFetchOnIdle(
    (state: RootState) => state.practiceSettings.status,
    fetchPracticeSettings,
    "Failed to load practice settings:",
  );
  // Fires the first time this admin's client count goes from 0 to 1,
  // whichever way that client was added — gated purely on
  // first_client_milestone_shown plus a live count, not on the setup
  // wizard. tipsDismissed gives an instant close with no flash while the
  // DB write + refetch below settle in the background.
  const firstClientMilestoneShown = useAppSelector(
    (state: RootState) => state.practiceSettings.data?.first_client_milestone_shown,
  );
  useFetchOnIdle(
    (state: RootState) => state.responses.status,
    () => fetchAllResponses(),
    "Failed to fetch responses:",
  );
  useFetchOnIdle(
    (state: RootState) => state.questionnaires.status,
    () => fetchQuestionnaires(),
    "Failed to fetch questionnaires:",
  );
  useFetchOnIdle(
    (state: RootState) => state.clientStubs.status,
    () => fetchClientStubs(),
    "Failed to fetch offline clients:",
  );
  useFetchOnIdle(
    (state: RootState) => state.assignments.status,
    () => fetchAllAssignments(),
    "Failed to fetch assignments:",
  );

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setShowInviteModal(true);
      setSearchParams({}); // clear it so back/refresh doesn't re-open
    } else if (searchParams.get("newStub") === "true") {
      setCreateStubOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const guard = isPageStatusLoading(usersStatus, questionnairesStatus);
  if (guard) return guard;

  const nonAdminUsers = allUsers.filter((user) => user.role !== "admin" && !user.deleted_at);
  const allClients = nonAdminUsers.filter((user) => !user.archived_at);
  const archivedClients = nonAdminUsers.filter((user) => user.archived_at);

  const filtered = allClients.filter(
    (user) =>
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase()),
  );

  const showFirstClientTips =
    !tipsDismissed && firstClientMilestoneShown === false && allClients.length + unlinkedStubs.length >= 1;

  const handleCloseTips = () => {
    setTipsDismissed(true);
    // Demo admin's practice_settings row is shared by every visitor — a real
    // write here would permanently mark the milestone shown, and no future
    // demo viewer would ever see this modal again. tipsDismissed above
    // already closes it for this session; skip the persistent write.
    if (!userProfile?.id || userProfile.is_demo) return;
    supabase
      .from("practice_settings")
      .update({ first_client_milestone_shown: true })
      .eq("admin_id", userProfile.id)
      .then(() => {
        dispatch(fetchPracticeSettings());
      });
  };

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.pageHeader} id="clients-header">
          <div>
            <h1>Clients</h1>
            <p>
              {allClients.length} active {allClients.length === 1 ? "client" : "clients"}{" "}
              {unlinkedStubs.length > 0 &&
                `  |   ${unlinkedStubs.length}  offline ${unlinkedStubs.length === 1 ? "client" : "clients"}`}
            </p>
          </div>

          <SplitButton
            primaryLabel="Invite a client"
            primaryAction={() => setShowInviteModal(true)}
            options={[
              { label: "Create token", onClick: () => setShowTokenModal(true) },
              { label: "Create offline client", onClick: () => setCreateStubOpen(true) },
              { label: "Manage tokens", onClick: () => setManageTokensModal(true) },
              { label: "CSV client import", onClick: () => setImportOpen(true) },
            ]}
            secondaryLabel="View more options"
          />
        </div>

        <HideableSection id="clients-search">
          <div className={styles.searchWrap}>
            <Search
              id="clients"
              showLabel={false}
              label="Search clients"
              placeholder="Search by name or email…"
              handleChange={setSearch}
            />
          </div>
        </HideableSection>

        <Card>
          {allClients.length === 0 && unlinkedStubs.length === 0 ? (
            <div className={styles.freshAccount}>
              <h3>No clients yet</h3>
              <p>
                Invite someone to sign up themselves, add an offline client you manage yourself, or bring over your
                existing list all at once.
              </p>
              <div className={styles.freshAccountActions}>
                <Button variant="primary" onClick={() => setShowInviteModal(true)}>
                  Invite a client
                </Button>
                <Button variant="ghost" onClick={() => setCreateStubOpen(true)}>
                  Add offline client
                </Button>
                <Button variant="ghost" onClick={() => setImportOpen(true)}>
                  Import from CSV
                </Button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <p>No clients match your search.</p>
            </div>
          ) : (
            filtered.map((user) => <ClientRow key={user.id} user={user} />)
          )}
        </Card>

        {/* Archived (deactivated) clients section */}
        {archivedClients.length > 0 && (
          <div className={styles.stubsSection}>
            <div className={styles.stubsSectionHeader}>
              <h2>Deactivated clients</h2>
              <p>
                {archivedClients.length} deactivated {archivedClients.length === 1 ? "client" : "clients"} — history
                kept, no longer on your active list
              </p>
            </div>
            <Card>
              {archivedClients.map((user) => (
                <ArchivedClientRow key={user.id} user={user} />
              ))}
            </Card>
          </div>
        )}

        {/* Offline clients section */}
        {unlinkedStubs.length > 0 && (
          <div className={styles.stubsSection}>
            <div className={styles.stubsSectionHeader}>
              <h2>Offline clients</h2>
              <p>
                {unlinkedStubs.length} offline {unlinkedStubs.length === 1 ? "client" : "clients"} — not yet on the
                platform
              </p>
            </div>
            <Card>
              {unlinkedStubs.map((stub) => (
                <StubRow key={stub.id} stub={stub} />
              ))}
            </Card>
          </div>
        )}
      </div>

      {showInviteModal && <InviteClientModal onClose={() => setShowInviteModal(false)} />}
      {showTokenModal && <AccessTokenModal onClose={() => setShowTokenModal(false)} />}
      {manageTokensModal && <ManageTokensModal onClose={() => setManageTokensModal(false)} />}
      {createStubOpen && <CreateStubModal onClose={() => setCreateStubOpen(false)} />}
      {importOpen && <ImportStubsModal onClose={() => setImportOpen(false)} />}
      {showFirstClientTips && <FirstClientTipsModal onClose={handleCloseTips} />}
    </div>
  );
}
