import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import AgreementView from "../../../components/Consent/AgreementView";
import Button from "../../../components/shared/Button/Button";
import Card from "../../../components/shared/Card/Card";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { getResponseDate, isPageStatusLoading, isQuestionnaireCheckInDue } from "../../../Helpers/Helpers";
import { useRealtimeTable } from "../../../Hooks/useRealtimeTable";
import { supabase } from "../../../lib/supabase";
import type { Question, Questionnaire, Response } from "../../../models/globalTypes";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { fetchAssignmentsByUser, selectAllAssignments } from "../../../store/slices/questionnaireAssignmentsSlice";
import { fetchResponsesByUser, selectUserResponses, submitResponse } from "../../../store/slices/responsesSlice";

import styles from "./CheckInPage.module.scss";

type FormTab = "outcome_measure" | "feedback" | "onboarding";

const TABS: { id: FormTab; label: string }[] = [
  { id: "outcome_measure", label: "Outcome Measures" },
  { id: "feedback", label: "Feedback" },
  { id: "onboarding", label: "Onboarding" },
];

const CheckIcon = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

type AssignmentWithQuestionnaire = {
  id: string;
  questionnaire_id: string;
  user_id: string;
  assigned_at: string;
  prompt_again_at?: string | null;
  questionnaires?: Questionnaire;
};

const getLatestResponseForQuestionnaire = (responses: Response[], questionnaireId: string) =>
  responses
    .filter((r) => r.questionnaire_id === questionnaireId)
    .sort((a, b) => new Date(getResponseDate(b)).getTime() - new Date(getResponseDate(a)).getTime())[0];

function ScaleQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: number | undefined;
  onChange: (n: number) => void;
}) {
  const min = question.min_value ?? 1;
  const max = question.max_value ?? 10;

  return (
    <div className={styles.scaleWrap}>
      <div role="radiogroup" aria-label={question.text} className={styles.scaleButtons}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={value === n ? styles.scaleBtnActive : styles.scaleBtn}
          >
            {n}
          </button>
        ))}
      </div>
      <div className={styles.scaleLabels}>
        <span>{question.min_label}</span>
        <span>{question.max_label}</span>
      </div>
    </div>
  );
}

function MultipleChoiceQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: number | undefined;
  onChange: (n: number) => void;
}) {
  const options = question.options ?? [];

  return (
    <div role="radiogroup" aria-label={question.text} className={styles.mcOptions}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={value === opt.value ? styles.mcOptionActive : styles.mcOption}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function CheckInPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { authUser, userProfile, isDemo } = useAuth();
  const { showToast } = useToast();

  const assignments = useAppSelector(selectAllAssignments) as AssignmentWithQuestionnaire[];
  const allUserResponses = useAppSelector(selectUserResponses(authUser?.id ?? ""));
  const responsesStatus = useAppSelector((state) => state.responses.status);
  const assignmentsStatus = useAppSelector((state) => state.assignments.status);

  const [activeTab, setActiveTab] = useState<FormTab>("outcome_measure");
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  // RCADS answers live in rcads_assessments, not `responses` — the generic
  // "has this been answered" check below can't see it, so its completion
  // (and re-prompting, via prompt_again_at like every other one-time form)
  // is tracked separately.
  const [latestRcadsAt, setLatestRcadsAt] = useState<string | null>(null);

  useEffect(() => {
    if (!authUser?.id) return;
    dispatch(fetchAssignmentsByUser(authUser.id)).unwrap().catch(console.error);
    dispatch(fetchResponsesByUser(authUser.id)).unwrap().catch(console.error);
    supabase
      .from("rcads_assessments")
      .select("submitted_at")
      .eq("client_id", authUser.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLatestRcadsAt(data?.submitted_at ?? null));
  }, [dispatch, authUser?.id]);

  // Without this, an admin assigning (or re-prompting) a form while the
  // client is sitting on this exact page never showed up — the effect above
  // only fires once per mount, not on every assignment change.
  useRealtimeTable("questionnaire_assignments", authUser?.id ? `user_id=eq.${authUser.id}` : undefined, () => {
    dispatch(fetchAssignmentsByUser(authUser!.id));
  });

  // Reset form state when tab changes
  useEffect(() => {
    setAnswers({});
    setCurrentStep(0);
    setSubmitted(false);
  }, [activeTab]);

  const activeAssignments = assignments.filter((a) => a.questionnaires?.is_active);

  const tabAssignments = activeAssignments.filter(
    (a) => (a.questionnaires?.form_type ?? "outcome_measure") === activeTab,
  );

  const availableAssignments = tabAssignments.filter((a) => {
    const q = a.questionnaires;
    if (!q) return false;
    if ((q as any).is_rcads) {
      if (!latestRcadsAt) return true;
      return !!a.prompt_again_at && new Date(a.prompt_again_at) > new Date(latestRcadsAt);
    }
    const latest = getLatestResponseForQuestionnaire(allUserResponses, q.id);
    if (activeTab === "outcome_measure") {
      if (!q.frequency) {
        if (!latest) return true; // one-time: show until answered once
        // admin re-opened it since the client's last response
        return !!a.prompt_again_at && new Date(a.prompt_again_at) > new Date(getResponseDate(latest));
      }
      if (!latest) return true;
      return isQuestionnaireCheckInDue(getResponseDate(latest), q.frequency);
    }
    // feedback and onboarding: show once (if never submitted)
    return !latest;
  });

  const questionnaire = availableAssignments[0]?.questionnaires;

  const guard = isPageStatusLoading(responsesStatus, assignmentsStatus);
  if (guard) return guard;

  if (submitted) {
    return (
      <div className={styles.completePage}>
        <Card className={styles.completeCard}>
          <div className={styles.completeIconWrap}>
            <CheckIcon />
          </div>
          <h2 className={styles.completeTitle}>Thank you, {userProfile?.first_name}</h2>
          <p className={styles.completeText}>Your response has been recorded.</p>
          <Button onClick={() => navigate("/dashboard")} fullWidth>
            View my progress
          </Button>
        </Card>
      </div>
    );
  }

  const emptyMessages: Record<FormTab, string> = {
    outcome_measure: "You have no outcome measure forms due right now.",
    feedback: "No feedback forms to complete.",
    onboarding: "No onboarding forms pending.",
  };

  const isRcads = !!(questionnaire as any)?.is_rcads;
  const questions = questionnaire?.questions ?? [];
  const currentQ = questions[currentStep];
  const isLast = currentStep === questions.length - 1;
  const canProceed = currentQ?.type === "text" || answers[currentQ?.id ?? ""] !== undefined;
  const progress = questions.length > 0 ? ((currentStep + 1) / questions.length) * 100 : 0;

  const handleAnswer = (value: number | string) => {
    setAnswers((prev) => ({ ...prev, [currentQ.id]: value }));
  };

  const handleNext = () => {
    if (!isLast) {
      setCurrentStep((s) => s + 1);
      return;
    }
    if (isDemo) {
      showToast("Demo mode — responses are not saved.");
      setSubmitted(true);
      return;
    }
    if (!authUser?.id || !questionnaire) return;

    const scores: Record<string, number | string> = {};
    for (const q of questions) {
      if (q.type === "scale") {
        scores[q.id] = (answers[q.id] as number | undefined) ?? Math.round((q.max_value ?? 10) / 2);
      } else if (q.type === "multiple_choice") {
        if (answers[q.id] !== undefined) scores[q.id] = answers[q.id];
      } else {
        scores[q.id] = (answers[q.id] as string | undefined) ?? "";
      }
    }

    dispatch(submitResponse({ user_id: authUser.id, questionnaire_id: questionnaire.id, scores }))
      .unwrap()
      .then(() => setSubmitted(true))
      .catch(console.error);
  };

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header} id="forms-header">
          <h1>Check-in</h1>
        </div>

        <div className={styles.tabs} id="forms-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Onboarding tab, nothing pending: instead of a dead end, show the
            client the agreement they signed (consent doc / onboarding form)
            back to them for reference. */}
        {!questionnaire && activeTab === "onboarding" && userProfile?.has_consented && (
          <AgreementView
            signedName={userProfile.consent_signed_name ?? null}
            signedAt={userProfile.consented_at ?? null}
          />
        )}

        {!questionnaire && !(activeTab === "onboarding" && userProfile?.has_consented) && (
          <div className={styles.emptyState}>
            <p>{emptyMessages[activeTab]}</p>
            <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
          </div>
        )}

        {questionnaire && isRcads && (
          <div className={styles.formMeta}>
            <h2>{questionnaire.title}</h2>
            {questionnaire.description && <p>{questionnaire.description}</p>}
            <div style={{ marginTop: "var(--sp-5)" }}>
              <Button onClick={() => navigate("/rcads")}>Start</Button>
            </div>
          </div>
        )}

        {questionnaire && !isRcads && !currentQ && (
          <div className={styles.emptyState}>
            <p>This form has no questions yet.</p>
            <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
          </div>
        )}

        {questionnaire && !isRcads && currentQ && (
          <>
            <div className={styles.formMeta}>
              <h2>{questionnaire.title}</h2>
              {questionnaire.description && <p>{questionnaire.description}</p>}
            </div>

            <div className={styles.progressMeta}>
              <span>
                Question {currentStep + 1} of {questions.length}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>

            <Card className={styles.questionCard}>
              <p className={styles.questionText}>{currentQ.text}</p>

              {currentQ.type === "scale" ? (
                <ScaleQuestion
                  question={currentQ}
                  value={answers[currentQ.id] as number | undefined}
                  onChange={handleAnswer}
                />
              ) : currentQ.type === "multiple_choice" ? (
                <MultipleChoiceQuestion
                  question={currentQ}
                  value={answers[currentQ.id] as number | undefined}
                  onChange={handleAnswer}
                />
              ) : (
                <textarea
                  aria-label={currentQ.text}
                  value={(answers[currentQ.id] as string) || ""}
                  onChange={(e) => handleAnswer(e.target.value)}
                  placeholder="Take a moment to reflect…"
                  rows={4}
                  className={styles.textarea}
                />
              )}
            </Card>

            <div className={styles.navRow}>
              <Button
                variant="ghost"
                onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                disabled={currentStep === 0}
              >
                Back
              </Button>
              <Button onClick={handleNext} disabled={!canProceed}>
                {isLast ? "Submit" : "Next"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
