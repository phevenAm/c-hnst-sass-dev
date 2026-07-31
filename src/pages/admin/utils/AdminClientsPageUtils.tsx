import { Questionnaire, Response, UserProfile } from "../../../models/globalTypes";

export const generateAccessToken = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups = Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(""),
  );

  return groups.join("-");
};

export const getScoreAverage = (response: Response | undefined, questionnaire: Questionnaire | undefined) => {
  if (!response || !questionnaire) return null;

  const scaleQuestions = questionnaire.questions?.filter((question) => question.type === "scale");

  if (!scaleQuestions?.length) return null;

  const total = scaleQuestions.reduce((sum, question) => {
    const raw = (response.scores as Record<string, number | string>)[question.id];
    const score = Number(raw ?? 0);
    return sum + (Number.isFinite(score) ? score : 0);
  }, 0);

  return (total / scaleQuestions.length).toFixed(1);
};

export const getQuestionnaireForResponse = (response: Response | undefined, questionnaires: Questionnaire[]) => {
  if (!response) return undefined;
  return questionnaires.find((questionnaire) => questionnaire.id === response.questionnaire_id);
};

// ── PDF Export ─────────────────────────────────────────────
export const exportClientPDF = async ({
  user,
  responses,
  questionnaire,
}: {
  user: UserProfile;
  responses: Response[];
  questionnaire?: Questionnaire;
}) => {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 20;

  doc.setFillColor(31, 73, 64);
  doc.rect(0, 0, pageW, 40, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("WithMe", margin, 18);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Client Progress Report", margin, 28);

  doc.setTextColor(45, 41, 38);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`${user.first_name} ${user.last_name}`, margin, 56);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, margin, 64);

  if (questionnaire) {
    doc.text(`Survey: ${questionnaire.title}`, margin, 70);
  }

  if (responses.length > 0 && questionnaire) {
    const averages = responses
      .map((response) => Number(getScoreAverage(response, questionnaire)))
      .filter((score) => Number.isFinite(score));

    if (averages.length) {
      const overall = (averages.reduce((total, score) => total + score, 0) / averages.length).toFixed(1);
      const latest = averages[averages.length - 1];
      const change = (latest - averages[0]).toFixed(1);
      const colW = (pageW - margin * 2 - 8) / 3;

      [
        [`${overall}/10`, "Overall avg"],
        [`${latest}/10`, "Latest"],
        [`${parseFloat(change) >= 0 ? "+" : ""}${change}`, "Change"],
      ].forEach(([value, label], index) => {
        const x = margin + index * (colW + 4);
        doc.setFillColor(243, 241, 238);
        doc.roundedRect(x, 78, colW, 22, 4, 4, "F");
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(45, 41, 38);
        doc.text(value, x + 8, 87);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(130, 130, 130);
        doc.text(label, x + 8, 94);
      });
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(170, 170, 170);
  doc.text("Confidential — WithMe Client Report", margin, 285);
  doc.save(`${user.first_name}_${user.last_name}_progress.pdf`);
};
