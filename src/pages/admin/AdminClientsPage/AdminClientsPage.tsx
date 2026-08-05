import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import Avatar from "@components/shared/Avatar/Avatar";
import Card from "@components/shared/Card/Card";
import ProgressChart from "@components/shared/ProgressChart/ProgressChart";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import type { Questionnaire, Response, UserProfile } from "@models/globalTypes";
import { useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchQuestionnaires, selectAllQuestionnaires } from "@store/slices/questionnairesSlice";
import { fetchAllResponses, selectResponsesByUser } from "@store/slices/responsesSlice";
import { fetchAllUsers, selectAllUsers } from "@store/slices/userDirectorySlice";

import HideableSection from "@/components/shared/HideableSection/HideableSection";
import Search from "@/components/shared/Search/Search";
import { useAuth } from "@/context/AuthContext";
import { clientDisplayName, isPageStatusLoading } from "@/Helpers/Helpers";
import { getScoreAverage } from "../utils/AdminClientsPageUtils";
import AccessTokenModal from "./modals/AccessTokenModal/AccessTokenModal";
import DeleteClientModal from "./modals/DeleteClientModal/DeleteClientModal";
import ManageTokensModal from "./modals/ManageTokensModal/ManageTokensModal";
import SessionNotesModal from "./modals/SessionNotesModal/SessionNotesModal";

import styles from "./AdminClientsPage.module.scss";

const getQuestionnaireForResponse = (response: Response | undefined, questionnaires: Questionnaire[]) => {
  if (!response) return undefined;
  return questionnaires.find((questionnaire) => questionnaire.id === response.questionnaire_id);
};

// ── Client row ────────────────────────────────────────────────

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

  const [expanded, setExpanded] = useState(false);
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

  const selectedResponses = selectedQuestionnaire
    ? allResponses.filter((response) => response.questionnaire_id === selectedQuestionnaire.id)
    : [];

  const avgScore = getScoreAverage(latestResponse, latestQuestionnaire);

  return (
    <>
      <div className={styles.clientRow}>
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

        <div className={styles.rowActions}>
          <SplitButton
            primaryLabel="Manage"
            primaryAction={() => navigate(`/admin/clients/${user.id}`)}
            options={[{ label: "Remove", onClick: () => setDeleteModalOpen(true) }]}
            secondaryLabel="More options"
            variant="secondary"
          />
        </div>
      </div>

      {expanded && (
        <div className={styles.expandedChart}>
          {questionnaireOptions.length > 1 && (
            <div className={styles.progressControls}>
              <label htmlFor={`questionnaire-${user.id}`}>Survey</label>
              <select
                id={`questionnaire-${user.id}`}
                value={selectedQuestionnaire?.id ?? ""}
                onChange={(event) => setSelectedQuestionnaireId(event.target.value)}
              >
                {questionnaireOptions.map((questionnaire) => (
                  <option key={questionnaire.id} value={questionnaire.id}>
                    {questionnaire.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedQuestionnaire ? (
            <ProgressChart
              responses={selectedResponses}
              questions={selectedQuestionnaire.questions ?? []}
              title={`${user.first_name}'s Progress`}
            />
          ) : (
            <p className={styles.empty}>No survey responses yet.</p>
          )}
        </div>
      )}

      {isDeleteModalOpen && (
        <DeleteClientModal
          id={user.id}
          onClose={() => setDeleteModalOpen(false)}
          modalTitle="Delete user"
          bodyText={
            <>
              Are you sure you want to delete{" "}
              <strong>
                {user.first_name} {user.last_name}
              </strong>
              ?
            </>
          }
        />
      )}

      {isNotesOpen && <SessionNotesModal user={user} onClose={() => setNotesOpen(false)} />}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function AdminClientsPage() {
  const allUsers = useAppSelector(selectAllUsers) as UserProfile[];
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [manageTokensModal, setManageTokensModal] = useState(false);
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
              {allClients.length} active {allClients.length === 1 ? "client" : "clients"}
            </p>
          </div>

          <SplitButton
            primaryLabel="Create access token"
            primaryAction={() => setShowTokenModal(true)}
            options={[{ label: "Manage tokens", onClick: () => setManageTokensModal(true) }]}
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
          {filtered.length === 0 ? (
            <p className={styles.empty}>
              {allClients.length === 0
                ? "No clients yet. Create an access token and ask a client to sign up."
                : "No clients match your search."}
            </p>
          ) : (
            filtered.map((user) => <ClientRow key={user.id} user={user} />)
          )}
        </Card>
      </div>

      {showTokenModal && <AccessTokenModal onClose={() => setShowTokenModal(false)} />}
      {manageTokensModal && <ManageTokensModal onClose={() => setManageTokensModal(false)} />}
    </div>
  );
}
