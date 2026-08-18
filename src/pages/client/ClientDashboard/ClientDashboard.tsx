import { useMemo } from "react";
import { Link } from "react-router-dom";

import { getResponseDate, isPageStatusLoading, isQuestionnaireCheckInDue } from "@Helpers/Helpers";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import NextSessionCard from "@components/shared/NextSessionCard/NextSessionCard";
import ProgressChart from "@components/shared/ProgressChart/ProgressChart";
import UpdateBanner from "@components/shared/UpdateBanner/UpdateBanner";
import { useAuth } from "@context/AuthContext";
import type { Response } from "@models/globalTypes";
import { useGetQuotesByTagQuery } from "@services/inspirationalQuotesApi";
import { useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchQuestionnaires, selectActiveQuestionnaires } from "@store/slices/questionnairesSlice";
import { fetchResponsesByUser, selectUserResponses } from "@store/slices/responsesSlice";
import { fetchSessionsByClientId } from "@store/slices/sessionsSlice";

import styles from "./ClientDashboard.module.scss";

const getLatestResponseForQuestionnaire = (responses: Response[], questionnaireId: string) =>
  responses
    .filter((response) => response.questionnaire_id === questionnaireId)
    .sort((a, b) => new Date(getResponseDate(b)).getTime() - new Date(getResponseDate(a)).getTime())[0];

export default function ClientDashboard() {
  const { authUser, userProfile, displayName } = useAuth();

  const questionnairesStatus = useAppSelector((state: RootState) => state.questionnaires.status);
  const responsesStatus = useAppSelector((state: RootState) => state.responses.status);

  const questionnaires = useAppSelector(selectActiveQuestionnaires); // all available questionnares (backend should only return assigned; frontend checks anyway)
  const allUserResponses = useAppSelector(selectUserResponses(authUser?.id ?? "")); // all submissions ever

  const quoteKeyword = useMemo(() => {
    const kws = userProfile?.focus_keywords;
    if (!kws || kws.length === 0) return null;
    return kws[Math.floor(Math.random() * kws.length)];
  }, [userProfile?.focus_keywords]);

  const { data: taggedQuotes = [] } = useGetQuotesByTagQuery(quoteKeyword);

  const randomQuote = useMemo(
    () => (taggedQuotes.length > 0 ? taggedQuotes[Math.floor(Math.random() * taggedQuotes.length)] : undefined),
    [taggedQuotes],
  );

  const assignedQs = questionnaires.filter((q) => q.assignedTo.includes(authUser?.id ?? ""));

  const availableAssignedQs = assignedQs.filter((q) => {
    const latestResponse = getLatestResponseForQuestionnaire(allUserResponses, q.id);

    if (!latestResponse) return true;

    return isQuestionnaireCheckInDue(getResponseDate(latestResponse), q.frequency);
  });

  // All responses across every assigned questionnaire, sorted oldest → newest for the chart
  const assignedQIds = new Set(assignedQs.map((q) => q.id));
  const chartResponses = allUserResponses
    .filter((r) => assignedQIds.has(r.questionnaire_id))
    .slice()
    .sort((a, b) => new Date(getResponseDate(a)).getTime() - new Date(getResponseDate(b)).getTime());

  // All questions from all assigned questionnaires, flattened (tags joined in by the fetch query)
  const allAssignedQuestions = assignedQs.flatMap((q) => q.questions ?? []);

  useFetchOnIdle(
    (state: RootState) => state.questionnaires.status,
    () => fetchQuestionnaires(),
    "Error fetch questionnares",
  );

  useFetchOnIdle(
    (state: RootState) => state.responses.status,
    () => fetchResponsesByUser(authUser?.id ?? ""),
    "Failed to fetch user responses",
  );

  useFetchOnIdle(
    (state: RootState) => state.sessions.status,
    authUser ? () => fetchSessionsByClientId(authUser.id) : null,
    "Failed to fetch sessions",
  );

  const allSessions = useAppSelector((state: RootState) => state.sessions.sessions);
  const nextSession = useMemo(() => {
    const now = new Date();
    return (
      allSessions
        .filter((s) => s.status !== "cancelled" && new Date(s.scheduled_at) > now)
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null
    );
  }, [allSessions]);

  const latestResponse = chartResponses[chartResponses.length - 1] ?? null;

  const scaleAverage = (response: typeof latestResponse) => {
    if (!response) return null;

    const scaleQuestions = allAssignedQuestions.filter((q) => q.type === "scale");

    if (scaleQuestions.length === 0) return null;

    const total = scaleQuestions.reduce((sum, q) => sum + ((response.scores as Record<string, number>)[q.id] ?? 0), 0);

    return (total / scaleQuestions.length).toFixed(1);
  };

  const avgScore = scaleAverage(latestResponse) ?? "–";
  const firstAvg = scaleAverage(chartResponses[0] ?? null);

  const improvement =
    firstAvg && latestResponse ? (parseFloat(avgScore as string) - parseFloat(firstAvg)).toFixed(1) : null;

  const hour = new Date().getHours();
  let greeting: string;
  if (hour < 12) greeting = "Good morning";
  else if (hour < 17) greeting = "Good afternoon";
  else greeting = "Good evening";

  const stats = [
    {
      label: "Latest score",
      value: `${avgScore}/10`,
      sub: "This week's average",
      color: "teal",
    },
    {
      label: "Weeks tracked",
      value: chartResponses.length,
      sub: "Total check-ins",
      color: "stone",
    },
    ...(improvement !== null
      ? [
          {
            label: "Overall change",
            value: `${parseFloat(improvement) >= 0 ? "+" : ""}${improvement}`,
            sub: "Since you started",
            color: parseFloat(improvement) >= 0 ? "teal" : "danger",
          },
        ]
      : []),
    {
      label: "Available check-ins",
      value: availableAssignedQs.length,
      sub: "Ready to complete",
      color: "warm",
    },
  ];

  const guard = isPageStatusLoading(responsesStatus, questionnairesStatus);
  if (guard) return guard;

  return (
    <div className="page">
      <UpdateBanner />
      <div className="inner">
        <div className={styles.header} id="client-dash-header">
          <h1>
            {greeting}, {displayName ?? "friend"}
          </h1>
          <p>Here's a look at how you've been doing</p>
        </div>

        {nextSession && (
          <div className={styles.nextSessionCard} id="client-next-session">
            <h3 className={styles.cardTitle}>Next session</h3>
            <NextSessionCard session={nextSession} compact />
          </div>
        )}

        <div className={styles.statsRow} id="client-stats">
          {stats.map((s) => (
            <div key={s.label} className={`${styles.statCard} ${styles[s.color as keyof typeof styles]}`}>
              <p className={styles.statLabel}>{s.label}</p>
              <p className={styles.statValue}>{s.value}</p>
              <p className={styles.statSub}>{s.sub}</p>
            </div>
          ))}
        </div>

        {randomQuote ? (
          <section className={`${styles.quotes} ${styles.warm}`}>
            <h2>{randomQuote?.content}</h2>
            <small>{randomQuote?.author}</small>
          </section>
        ) : null}

        <div className={styles.chartWrap} id="client-chart">
          <ProgressChart responses={chartResponses} questions={allAssignedQuestions} title="Your Wellbeing Over Time" />
          {/* //!TODO: questons should really have categories like sleep, selfcare, love-tank etc etc, for each question thats made, it should map to a category. and its these cats. that will be plotted and not the long winded questions. assignment to cat. is required */}
        </div>

        <div className={styles.bottomGrid} id="client-checkins">
          <Card>
            <div className={styles.cardPad}>
              <h3 className={styles.cardTitle}>Your Check-ins</h3>

              {(() => {
                if (assignedQs.length === 0) {
                  return <p className={styles.emptyText}>No check-ins assigned yet.</p>;
                }
                if (availableAssignedQs.length === 0) {
                  return <p className={styles.emptyText}>You have completed your assigned check-ins for now.</p>;
                }
                return (
                  <div className={styles.checkInList}>
                    {availableAssignedQs.map((q) => (
                      <div key={q.id} className={styles.checkInRow}>
                        <div>
                          <p className={styles.checkInTitle}>{q.title}</p>
                          <p className={styles.checkInFreq}>{q.frequency}</p>
                        </div>

                        <Link to="/check-in" style={{ textDecoration: "none" }}>
                          <Button size="sm" variant="secondary">
                            Start
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </Card>

          <Card>
            <div className={styles.resourcesCard}>
              <h3 className={styles.resourcesTitle}>Resources for you</h3>
              <p className={styles.resourcesDesc}>
                Articles, breathing exercises, and tools curated by your practitioner.
              </p>

              <Link to="/resources" style={{ textDecoration: "none" }}>
                <Button variant="primary" size="sm">
                  Browse resources
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
