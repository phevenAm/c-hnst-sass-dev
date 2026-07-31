import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../../../components/shared/Button/Button";
import Card from "../../../components/shared/Card/Card";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { getResponseDate, isPageStatusLoading, isQuestionnaireCheckInDue } from "../../../Helpers/Helpers";
import type { Question, Questionnaire, Response } from "../../../models/globalTypes";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { fetchAssignmentsByUser, selectAllAssignments } from "../../../store/slices/questionnaireAssignmentsSlice";
import { fetchResponsesByUser, selectUserResponses, submitResponse } from "../../../store/slices/responsesSlice";

import styles from "./CheckInPage.module.scss";

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
  questionnaires?: Questionnaire;
};

const getLatestResponseForQuestionnaire = (responses: Response[], questionnaireId: string) =>
  responses
    .filter((response) => response.questionnaire_id === questionnaireId)
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

export default function CheckInPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { authUser, userProfile, isDemo } = useAuth();
  const { showToast } = useToast();

  const assignments = useAppSelector(selectAllAssignments) as AssignmentWithQuestionnaire[];

  const allUserResponses = useAppSelector(selectUserResponses(authUser?.id ?? ""));
  const responsesStatus = useAppSelector((state) => state.responses.status);
  const assignmentsStatus = useAppSelector((state) => state.assignments.status);

  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    //!TODO: use idle hook
    if (!authUser?.id) return;

    dispatch(fetchAssignmentsByUser(authUser.id))
      .unwrap()
      .catch((err) => {
        console.error("Failed to fetch assigned questionnaires:", err);
      });

    dispatch(fetchResponsesByUser(authUser.id))
      .unwrap()
      .catch((err) => {
        console.error("Failed to fetch user responses:", err);
      });
  }, [dispatch, authUser?.id]);

  const activeAssignments = assignments.filter((assignment) => assignment.questionnaires?.is_active);

  const availableAssignments = activeAssignments.filter((assignment) => {
    const questionnaire = assignment.questionnaires;
    if (!questionnaire) return false;

    const latestResponse = getLatestResponseForQuestionnaire(allUserResponses, questionnaire.id);

    if (!latestResponse) return true;

    return isQuestionnaireCheckInDue(getResponseDate(latestResponse), questionnaire.frequency);
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

          <p className={styles.completeText}>Your check-in has been recorded.</p>

          <Button onClick={() => navigate("/dashboard")} fullWidth>
            View my progress
          </Button>
        </Card>
      </div>
    );
  }

  if (!questionnaire) {
    return (
      <div className={styles.emptyState}>
        <p>You have no check-ins available right now.</p>
        <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
      </div>
    );
  }

  const questions = questionnaire.questions ?? [];
  const currentQ = questions[currentStep];

  if (!currentQ) {
    return (
      <div className={styles.emptyState}>
        <p>This survey has no questions yet.</p>
        <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
      </div>
    );
  }

  const isLast = currentStep === questions.length - 1;
  const canProceed = currentQ.type === "text" || answers[currentQ.id] !== undefined;
  const progress = ((currentStep + 1) / questions.length) * 100;

  const handleAnswer = (value: number | string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: value,
    }));
  };

  const handleNext = () => {
    if (!isLast) {
      setCurrentStep((step) => step + 1);
      return;
    }

    if (isDemo) {
      showToast("Demo mode — check-ins are not saved.");
      setSubmitted(true);
      return;
    }

    if (!authUser?.id) return;

    const scores: Record<string, number | string> = {};

    questions.forEach((question) => {
      if (question.type === "scale") {
        scores[question.id] =
          (answers[question.id] as number | undefined) ?? Math.round((question.max_value ?? 10) / 2);
      }

      if (question.type === "text") {
        scores[question.id] = (answers[question.id] as string | undefined) ?? "";
      }
    });

    dispatch(
      submitResponse({
        user_id: authUser.id,
        questionnaire_id: questionnaire.id,
        scores,
      }),
    )
      .unwrap()
      .then(() => {
        setSubmitted(true);
      })
      .catch((err) => {
        console.error("Failed to submit check-in:", err);
      });
  };

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header}>
          <h1>{questionnaire.title}</h1>
          <p>{questionnaire.description}</p>
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
            onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
            disabled={currentStep === 0}
          >
            Back
          </Button>

          <Button onClick={handleNext} disabled={!canProceed}>
            {isLast ? "Submit check-in" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
