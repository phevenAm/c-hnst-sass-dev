import { Questionnaire, Response, Session, UserProfile } from "../../../models/globalTypes";

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

// ── PDF Export ─────────────────────────────────────────────────────────────

type ExportSections = {
  clientDetails: boolean;
  sessions: boolean;
  checkIns: boolean;
  accountSummary: boolean;
};

const BRAND = [31, 73, 64] as const;
const TEXT_DARK = [45, 41, 38] as const;
const TEXT_MUTED = [120, 120, 120] as const;
const BG_MUTED = [243, 241, 238] as const;
const MARGIN = 20;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

export const exportClientPDF = async ({
  user,
  sections,
  responses = [],
  questionnaire,
  sessions = [],
  accountSummary,
}: {
  user: UserProfile;
  sections: ExportSections;
  responses?: Response[];
  questionnaire?: Questionnaire;
  sessions?: Session[];
  accountSummary?: string;
}) => {
  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Header band ──────────────────────────────────────────────
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 40, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("WithMe", MARGIN, 18);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Client Report", MARGIN, 28);

  // ── Client name + date ───────────────────────────────────────
  doc.setTextColor(...TEXT_DARK);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`${user.first_name} ${user.last_name}`, MARGIN, 56);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Generated ${new Date().toLocaleDateString("en-GB")}`, MARGIN, 64);

  let y = 76;

  const sectionHeading = (title: string) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND);
    doc.text(title.toUpperCase(), MARGIN, y);
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + 2, MARGIN + CONTENT_W, y + 2);
    y += 10;
    doc.setTextColor(...TEXT_DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
  };

  // ── Client details ───────────────────────────────────────────
  if (sections.clientDetails) {
    sectionHeading("Client Details");
    doc.text(`Email: ${user.email ?? "—"}`, MARGIN, y);
    y += 7;
    if (user.created_at) {
      doc.text(`Member since: ${new Date(user.created_at).toLocaleDateString("en-GB")}`, MARGIN, y);
      y += 7;
    }
    if (user.admin_codename) {
      doc.text(`Codename: ${user.admin_codename}`, MARGIN, y);
      y += 7;
    }
    y += 6;
  }

  // ── Sessions ─────────────────────────────────────────────────
  if (sections.sessions && sessions.length > 0) {
    sectionHeading("Session History");

    const attended = sessions.filter((s) => s.attended === true).length;
    const noShows = sessions.filter((s) => s.attended === false).length;
    const collected = sessions.reduce((sum, s) => sum + (s.paid ? (s.price_pence ?? 0) : 0), 0) / 100;
    const outstanding = sessions.reduce((sum, s) => sum + (!s.paid ? (s.price_pence ?? 0) : 0), 0) / 100;

    const colW = (CONTENT_W - 8) / 4;
    const statItems = [
      [String(sessions.length), "Total"],
      [String(attended), "Attended"],
      [String(noShows), "No-shows"],
      [`£${collected.toFixed(0)}`, "Collected"],
    ];

    statItems.forEach(([val, label], i) => {
      const x = MARGIN + i * (colW + 2.7);
      doc.setFillColor(...BG_MUTED);
      doc.roundedRect(x, y, colW, 18, 3, 3, "F");
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_DARK);
      doc.text(val, x + 4, y + 8);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_MUTED);
      doc.text(label, x + 4, y + 14);
    });

    y += 24;
    if (outstanding > 0) {
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(`£${outstanding.toFixed(0)} outstanding`, MARGIN, y);
      y += 6;
    }
    y += 6;
  }

  // ── Check-in scores ──────────────────────────────────────────
  if (sections.checkIns && responses.length > 0 && questionnaire) {
    sectionHeading("Check-in Scores");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Survey: ${questionnaire.title}`, MARGIN, y);
    y += 8;

    const averages = responses.map((r) => Number(getScoreAverage(r, questionnaire))).filter((s) => Number.isFinite(s));

    if (averages.length) {
      const overall = (averages.reduce((t, s) => t + s, 0) / averages.length).toFixed(1);
      const latest = averages[averages.length - 1].toFixed(1);
      const change = (averages[averages.length - 1] - averages[0]).toFixed(1);

      const colW = (CONTENT_W - 4) / 3;
      [
        [`${overall}/10`, "Overall avg"],
        [`${latest}/10`, "Latest"],
        [`${parseFloat(change) >= 0 ? "+" : ""}${change}`, "Change"],
      ].forEach(([val, label], i) => {
        const x = MARGIN + i * (colW + 2);
        doc.setFillColor(...BG_MUTED);
        doc.roundedRect(x, y, colW, 18, 3, 3, "F");
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...TEXT_DARK);
        doc.text(val, x + 4, y + 8);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...TEXT_MUTED);
        doc.text(label, x + 4, y + 14);
      });
      y += 24;
    }
    y += 6;
  }

  // ── Account summary ──────────────────────────────────────────
  if (sections.accountSummary && accountSummary) {
    sectionHeading("Account Summary");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_DARK);
    const lines = doc.splitTextToSize(accountSummary, CONTENT_W);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 6;
  }

  // ── Footer ───────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(190, 190, 190);
  doc.text("Confidential — WithMe Client Report", MARGIN, 285);

  doc.save(`${user.first_name}_${user.last_name}_report.pdf`);
};
