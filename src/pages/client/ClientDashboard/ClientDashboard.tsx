import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getResponseDate, isPageStatusLoading, isQuestionnaireCheckInDue } from "@Helpers/Helpers";
import { useRealtimeTable } from "@Hooks/useRealtimeTable";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import NextSessionCard from "@components/shared/NextSessionCard/NextSessionCard";
import ProgressChart from "@components/shared/ProgressChart/ProgressChart";
import { useAuth } from "@context/AuthContext";
import type { Response } from "@models/globalTypes";
import { useGetQuotesByTagQuery } from "@services/inspirationalQuotesApi";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import {
  fetchAssignmentsByUser,
  selectAllAssignments,
  selectPlottedAssignmentByUser,
} from "@store/slices/questionnaireAssignmentsSlice";
import { fetchQuestionnaires, selectActiveQuestionnaires } from "@store/slices/questionnairesSlice";
import { fetchResponsesByUser, selectUserResponses } from "@store/slices/responsesSlice";
import { fetchSessionsByClientId } from "@store/slices/sessionsSlice";

import { supabase } from "@/lib/supabase";

import styles from "./ClientDashboard.module.scss";

const getLatestResponseForQuestionnaire = (responses: Response[], questionnaireId: string) =>
  responses
    .filter((response) => response.questionnaire_id === questionnaireId)
    .sort((a, b) => new Date(getResponseDate(b)).getTime() - new Date(getResponseDate(a)).getTime())[0];

// The form types /check-in can actually render for a client.
const CLIENT_FILLABLE_FORM_TYPES = new Set(["check_in", "outcome_measure", "feedback"]);

export default function ClientDashboard() {
  const { authUser, userProfile, displayName } = useAuth();
  const dispatch = useAppDispatch();

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

  // Only the form types a client can actually fill from /check-in. A stray
  // 'onboarding' (or any unknown) type would otherwise show as an "available
  // check-in" whose Start link lands on a page with no tab for it — blank.
  const assignedQs = questionnaires.filter(
    (q) =>
      q.assignedTo.includes(authUser?.id ?? "") &&
      ((q as { is_rcads?: boolean }).is_rcads ||
        CLIENT_FILLABLE_FORM_TYPES.has((q as { form_type?: string }).form_type ?? "outcome_measure")),
  );
  const allAssignments = useAppSelector(selectAllAssignments);

  // RCADS answers live in rcads_assessments, not `responses` — the generic
  // getLatestResponseForQuestionnaire check below can never see it, so
  // without this it would count as "available" forever, even once complete.
  // prompt_again_at re-opens it, same as every other one-time form.
  const [latestRcadsAt, setLatestRcadsAt] = useState<string | null>(null);
  useEffect(() => {
    if (!authUser?.id) return;
    supabase
      .from("rcads_assessments")
      .select("submitted_at")
      .eq("client_id", authUser.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLatestRcadsAt(data?.submitted_at ?? null));
  }, [authUser?.id]);

  const availableAssignedQs = assignedQs.filter((q) => {
    if ((q as any).is_rcads) {
      if (!latestRcadsAt) return true;
      const assignment = allAssignments.find((a) => a.questionnaire_id === q.id && a.user_id === authUser?.id);
      return !!assignment?.prompt_again_at && new Date(assignment.prompt_again_at) > new Date(latestRcadsAt);
    }

    const latestResponse = getLatestResponseForQuestionnaire(allUserResponses, q.id);

    if (!latestResponse) return true;

    return isQuestionnaireCheckInDue(getResponseDate(latestResponse), q.frequency);
  });

  // Which single form the wellbeing chart is built from. Only `check_in` forms
  // are ever plotted — they're the light-touch, recurring, tagged ones. Outcome
  // measures (CORE-10, PHQ-9, RCADS, GAD-7 …) are point-in-time assessments on
  // fixed clinical scales and are deliberately never charted here; blending
  // their responses in produced meaningless averages, and the admin "Chart"
  // toggle is now hidden for them too. Prefer the form the admin explicitly
  // plotted (selectPlottedAssignmentByUser), else the first check-in with
  // responses.
  const isPlottable = (q: (typeof assignedQs)[number]) =>
    q.form_type === "check_in" && (q.questions?.some((qn) => qn.type === "scale") ?? false);
  const plottedAssignment = useAppSelector(selectPlottedAssignmentByUser(authUser?.id ?? ""));
  const plottedQuestionnaire = assignedQs.find((q) => q.id === plottedAssignment?.questionnaire_id);
  const chartedQuestionnaire =
    (plottedQuestionnaire && isPlottable(plottedQuestionnaire) ? plottedQuestionnaire : undefined) ??
    assignedQs.find((q) => isPlottable(q) && allUserResponses.some((r) => r.questionnaire_id === q.id));
  const chartedQuestionnaireId = chartedQuestionnaire?.id;

  const chartResponses = allUserResponses
    .filter((r) => r.questionnaire_id === chartedQuestionnaireId)
    .slice()
    .sort((a, b) => new Date(getResponseDate(a)).getTime() - new Date(getResponseDate(b)).getTime());

  const allAssignedQuestions = chartedQuestionnaire?.questions ?? [];

  useFetchOnIdle(
    (state: RootState) => state.questionnaires.status,
    () => fetchQuestionnaires(),
    "Error fetch questionnares",
  );

  useFetchOnIdle(
    (state: RootState) => state.assignments.status,
    authUser ? () => fetchAssignmentsByUser(authUser.id) : null,
    "Failed to fetch assignments",
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

  // Without this, a session cancelled/updated by the admin while the client
  // is sitting on the dashboard (rather than the Schedule page, which already
  // had this) never refreshes — useFetchOnIdle only fires once per Redux
  // session, and the dashboard's "next session" card would keep showing a
  // session that's actually been cancelled.
  useRealtimeTable("sessions", authUser?.id ? `client_id=eq.${authUser.id}` : undefined, () =>
    dispatch(fetchSessionsByClientId(authUser?.id)),
  );

  // Same gap for forms: an admin assigning (or re-prompting) a form while
  // the client is sitting on this page never showed up without a reload.
  // questionnaires.assignedTo drives "available check-ins" above, and
  // assignments drives the plotted-form pick — both need a refetch.
  useRealtimeTable("questionnaire_assignments", authUser?.id ? `user_id=eq.${authUser.id}` : undefined, () => {
    dispatch(fetchQuestionnaires());
    dispatch(fetchAssignmentsByUser(authUser?.id));
  });

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
          {/* ProgressChart plots one line per question *tag* (category — Mood, Sleep,
              Energy …) when the check-in's scale questions are tagged, averaging
              every question that shares a tag; it falls back to per-question lines
              only when no tags are set. Tag questions in the form builder. */}
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
                    {availableAssignedQs.map((q) => {
                      // RCADS lives on its own page, not a /check-in tab.
                      // Every other form type maps 1:1 to a CheckInPage tab —
                      // send the client straight there instead of dropping
                      // them on the (unrelated) default Check-ins tab.
                      const isRcads = (q as { is_rcads?: boolean }).is_rcads;
                      const formType = (q as { form_type?: string }).form_type ?? "outcome_measure";
                      const startPath = isRcads ? "/rcads" : `/check-in?tab=${formType}`;

                      return (
                        <div key={q.id} className={styles.checkInRow}>
                          <div>
                            <p className={styles.checkInTitle}>{q.title}</p>
                            <p className={styles.checkInFreq}>{q.frequency}</p>
                          </div>

                          <Link to={startPath} style={{ textDecoration: "none" }}>
                            <Button size="sm" variant="secondary">
                              Start
                            </Button>
                          </Link>
                        </div>
                      );
                    })}
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
