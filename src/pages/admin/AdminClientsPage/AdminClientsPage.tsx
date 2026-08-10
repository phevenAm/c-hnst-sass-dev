import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import Avatar from "@components/shared/Avatar/Avatar";
import Card from "@components/shared/Card/Card";
import ProgressChart from "@components/shared/ProgressChart/ProgressChart";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import type { ClientStub, Questionnaire, Response, UserProfile } from "@models/globalTypes";
import { useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { deleteClientStub, fetchClientStubs, selectAllStubs } from "@store/slices/clientStubsSlice";
import { fetchQuestionnaires, selectAllQuestionnaires } from "@store/slices/questionnairesSlice";
import { fetchAllResponses, selectResponsesByUser } from "@store/slices/responsesSlice";
import { fetchAllUsers, selectAllUsers } from "@store/slices/userDirectorySlice";

import { Button } from "@/components/shared";
import HideableSection from "@/components/shared/HideableSection/HideableSection";
import Search from "@/components/shared/Search/Search";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { clientDisplayName, isPageStatusLoading } from "@/Helpers/Helpers";
import { useAppDispatch } from "@/store/hooks";
import { getScoreAverage } from "../utils/AdminClientsPageUtils";
import AccessTokenModal from "./modals/AccessTokenModal/AccessTokenModal";
import CreateStubModal from "./modals/CreateStubModal/CreateStubModal";
import DeleteClientModal from "./modals/DeleteClientModal/DeleteClientModal";
import ManageTokensModal from "./modals/ManageTokensModal/ManageTokensModal";
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

  const selectedQuestionnaire =
    questionnaireOptions.find((questionnaire) => questionnaire.id === selectedQuestionnaireId) ??
    questionnaireOptions[0];

  const avgScore = getScoreAverage(latestResponse, latestQuestionnaire);

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
          <p className={styles.clientName}>{displayName}</p>
          <p className={styles.clientEmail}>{user.email}</p>
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

        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>
          Added {dayjs(stub.created_at).format("D MMM YYYY")}
        </p>

        <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
          <SplitButton
            primaryLabel="Manage"
            primaryAction={() => navigate(`/admin/clients/stub/${stub.id}`)}
            options={[
              { label: "Edit", onClick: () => setEditOpen(true) },
              { label: "Delete", onClick: () => setConfirmDelete(true) },
              { label: "Link to real client", onClick: () => setConfirmDelete(true) },
            ]}
            secondaryLabel="More options"
            variant="secondary"
          />
        </div>
      </div>

      {editOpen && <CreateStubModal existing={stub} onClose={() => setEditOpen(false)} />}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function AdminClientsPage() {
  const allUsers = useAppSelector(selectAllUsers) as UserProfile[];
  const allStubs = useAppSelector(selectAllStubs);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [manageTokensModal, setManageTokensModal] = useState(false);
  const [createStubOpen, setCreateStubOpen] = useState(false);
  const [search, setSearch] = useState("");
  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const questionnairesStatus = useAppSelector((state: RootState) => state.questionnaires.status);
  const responsesStatus = useAppSelector((state: RootState) => state.responses.status);

  useFetchOnIdle(
    (state: RootState) => state.userDirectory.status,
    () => fetchAllUsers(),
    "Failed to fetch users:",
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

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setShowTokenModal(true);
      setSearchParams({}); // clear it so back/refresh doesn't re-open
    }
  }, [searchParams, setSearchParams]);

  const guard = isPageStatusLoading(usersStatus, questionnairesStatus, responsesStatus);
  if (guard) return guard;

  const allClients = allUsers.filter((user) => user.role !== "admin" && !user.deleted_at);

  const filtered = allClients.filter(
    (user) =>
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.pageHeader}>
          <div>
            <h1>Clients</h1>
            <p>
              {allClients.length} active {allClients.length === 1 ? "client" : "clients"}{" "}
              {allStubs.length > 0 &&
                `  |   ${allStubs.length}  offline ${allStubs.length === 1 ? "client" : "clients"}`}
            </p>
          </div>

          <SplitButton
            primaryLabel="Create access token"
            primaryAction={() => setShowTokenModal(true)}
            options={[
              { label: "Manage tokens", onClick: () => setManageTokensModal(true) },
              { label: "Create offline client", onClick: () => setCreateStubOpen(true) },
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
          {allClients.length === 0 ? (
            <div className={styles.freshAccount}>
              <p>
                No clients on the platform yet. Create an access token and share it with a client so they can sign up.
              </p>
              <Button onClick={() => setShowTokenModal(true)}>Create access token</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <p>No clients match your search.</p>
            </div>
          ) : (
            filtered.map((user) => <ClientRow key={user.id} user={user} />)
          )}
        </Card>

        {/* Offline clients section */}
        {allStubs.length > 0 && (
          <div className={styles.stubsSection}>
            <div className={styles.stubsSectionHeader}>
              <h2>Offline clients</h2>
              <p>
                {allStubs.length} offline {allStubs.length === 1 ? "client" : "clients"} — not yet on the platform
              </p>
            </div>
            <Card>
              {allStubs.map((stub) => (
                <StubRow key={stub.id} stub={stub} />
              ))}
            </Card>
          </div>
        )}
      </div>

      {showTokenModal && <AccessTokenModal onClose={() => setShowTokenModal(false)} />}
      {manageTokensModal && <ManageTokensModal onClose={() => setManageTokensModal(false)} />}
      {createStubOpen && <CreateStubModal onClose={() => setCreateStubOpen(false)} />}
    </div>
  );
}
