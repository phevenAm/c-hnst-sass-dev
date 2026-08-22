import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { RCADS_ITEMS, RCADS_SCALE_OPTIONS } from "@/data/rcadsItems";
import type { Gender } from "@/Helpers/rcadsScoring";
import { supabase } from "@/lib/supabase";

import styles from "./RcadsAssessmentPage.module.scss";

export default function RcadsAssessmentPage() {
  const { authUser, isDemo } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const canSubmit = !!dateOfBirth && !!gender && answeredCount === RCADS_ITEMS.length;

  const handleSubmit = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    if (!canSubmit || !authUser) return;
    setSubmitting(true);

    const answerArray = RCADS_ITEMS.map((item) => answers[item.number]);
    const { error } = await supabase.from("rcads_assessments").insert({
      client_id: authUser.id,
      date_of_birth: dateOfBirth,
      gender,
      answers: answerArray,
    });

    setSubmitting(false);
    if (error) {
      showToast("Something went wrong submitting this — please try again.", "danger");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="page">
        <div className="inner">
          <Card className={styles.doneCard}>
            <h2>Thank you</h2>
            <p>Your responses have been recorded and shared with your therapist.</p>
            <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header}>
          <h1>Wellbeing questionnaire</h1>
          <p>
            Please answer every question below, choosing the word that shows how often each thing happens to you. There
            are no right or wrong answers.
          </p>
        </div>

        <Card className={styles.detailsCard}>
          <div className={styles.detailsRow}>
            <label className={styles.field}>
              <span>Date of birth</span>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label className={styles.field}>
              <span>Gender</span>
              <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                <option value="">Select…</option>
                <option value="boy">Boy</option>
                <option value="girl">Girl</option>
              </select>
            </label>
          </div>
        </Card>

        <Card className={styles.questionsCard}>
          <ol className={styles.questionList}>
            {RCADS_ITEMS.map((item) => (
              <li key={item.number} className={styles.questionRow}>
                <span className={styles.questionText}>{item.text}</span>
                <div className={styles.optionsRow}>
                  {RCADS_SCALE_OPTIONS.map((opt) => (
                    <label key={opt.value} className={styles.optionLabel}>
                      <input
                        type="radio"
                        name={`item-${item.number}`}
                        checked={answers[item.number] === opt.value}
                        onChange={() => setAnswers((prev) => ({ ...prev, [item.number]: opt.value }))}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className={styles.footer}>
          <span className={styles.progress}>
            {answeredCount} of {RCADS_ITEMS.length} answered
          </span>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
