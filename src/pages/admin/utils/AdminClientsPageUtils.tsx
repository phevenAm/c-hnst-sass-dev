import type { Questionnaire, Response, Session, UserProfile } from "../../../models/globalTypes";

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
  formResults: boolean;
  payments: boolean;
  sessionNotes: boolean;
};

type FormQuestion = { id: string; text: string; order_index: number };

export type FormResultGroup = {
  questionnaire: { id: string; title: string };
  questions: FormQuestion[];
  responses: Response[];
};

export type ExportPayment = {
  paid_at: string;
  amount_pence: number;
  description: string | null;
};

export type ExportNote = {
  created_at: string;
  content: string;
  sessionDate?: string | null;
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
  formResults = [],
  payments = [],
  notes = [],
}: {
  user: UserProfile;
  sections: ExportSections;
  responses?: Response[];
  questionnaire?: Questionnaire;
  sessions?: Session[];
  accountSummary?: string;
  formResults?: FormResultGroup[];
  payments?: ExportPayment[];
  notes?: ExportNote[];
}) => {
  const jsPDF = (await import("jspdf")).default;
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Header band ──────────────────────────────────────────────
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 40, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("Clarity", MARGIN, 18);
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
    if (user.dob) {
      doc.text(`Date of birth: ${new Date(user.dob).toLocaleDateString("en-GB")}`, MARGIN, y);
      y += 7;
    }
    doc.text(
      user.has_consented
        ? `Consent: given${user.consented_at ? ` (${new Date(user.consented_at).toLocaleDateString("en-GB")})` : ""}`
        : "Consent: not yet given",
      MARGIN,
      y,
    );
    y += 7;
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

    const sortedSessions = [...sessions].sort(
      (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
    );

    autoTable(doc, {
      head: [["Date", "Time", "Location", "Status", "Paid"]],
      body: sortedSessions.map((s) => [
        new Date(s.scheduled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }),
        new Date(s.scheduled_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        s.location === "in_person" ? "In person" : "Online",
        s.status.charAt(0).toUpperCase() + s.status.slice(1),
        s.paid ? `£${(s.price_pence / 100).toFixed(0)}` : "—",
      ]),
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: BRAND as [number, number, number], textColor: [255, 255, 255], fontStyle: "bold" },
      bodyStyles: { textColor: TEXT_DARK as [number, number, number] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
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

  // ── Payments ─────────────────────────────────────────────────
  if (sections.payments && payments.length > 0) {
    sectionHeading("Payments");

    const sortedPayments = [...payments].sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());
    const total = payments.reduce((sum, p) => sum + p.amount_pence, 0) / 100;

    autoTable(doc, {
      head: [["Date", "Description", "Amount"]],
      body: sortedPayments.map((p) => [
        new Date(p.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }),
        p.description || "—",
        `£${(p.amount_pence / 100).toFixed(2)}`,
      ]),
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: BRAND as [number, number, number], textColor: [255, 255, 255], fontStyle: "bold" },
      bodyStyles: { textColor: TEXT_DARK as [number, number, number] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_DARK);
    doc.text(`Total: £${total.toFixed(2)}`, MARGIN, y);
    y += 12;
  }

  // ── Session notes ────────────────────────────────────────────
  if (sections.sessionNotes && notes.length > 0) {
    sectionHeading("Session Notes");

    const sortedNotes = [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    for (const note of sortedNotes) {
      if (y > 260) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_DARK);
      const label = note.sessionDate
        ? `Session — ${new Date(note.sessionDate).toLocaleDateString("en-GB")}`
        : "General note";
      doc.text(`${label}  ·  ${new Date(note.created_at).toLocaleDateString("en-GB")}`, MARGIN, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_DARK);
      const lines = doc.splitTextToSize(note.content, CONTENT_W);
      doc.text(lines, MARGIN, y);
      y += lines.length * 5 + 8;
    }
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

  // ── Form results ─────────────────────────────────────────────
  if (sections.formResults && formResults.length > 0) {
    sectionHeading("Form Results");

    for (const group of formResults) {
      const sortedQuestions = [...group.questions].sort((a, b) => a.order_index - b.order_index);

      // Sub-title for each form
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_DARK);
      doc.text(group.questionnaire.title, MARGIN, y);
      y += 6;

      // Build table head: Date | Q1 | Q2 … | Total
      const head = [["Date", ...sortedQuestions.map((_, i) => `Q${i + 1}`), "Total"]];

      // Build rows: one per response (newest first)
      const sortedResponses = [...group.responses].sort(
        (a, b) =>
          new Date(b.submitted_at ?? b.created_at).getTime() - new Date(a.submitted_at ?? a.created_at).getTime(),
      );

      const body = sortedResponses.map((r) => {
        const scores = r.scores as Record<string, number>;
        const vals = sortedQuestions.map((q) => {
          const v = scores[q.id];
          return typeof v === "number" ? String(v) : "–";
        });
        const total = sortedQuestions.reduce((s, q) => {
          const v = scores[q.id];
          return s + (typeof v === "number" && Number.isFinite(v) ? v : 0);
        }, 0);
        const date = new Date(r.submitted_at ?? r.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "2-digit",
        });
        return [date, ...vals, String(total)];
      });

      // Averages row
      const avgRow = [
        "Avg",
        ...sortedQuestions.map((q) => {
          const vals = group.responses
            .map((r) => (r.scores as Record<string, number>)[q.id])
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
          return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : "–";
        }),
        "",
      ];
      body.push(avgRow);

      autoTable(doc, {
        head,
        body,
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: {
          fillColor: BRAND as [number, number, number],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        bodyStyles: { textColor: TEXT_DARK as [number, number, number] },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === body.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = BG_MUTED as [number, number, number];
          }
          if (data.section === "body" && data.column.index === head[0].length - 1 && data.row.index < body.length - 1) {
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

      // Question legend
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_MUTED);
      for (const [i, q] of sortedQuestions.entries()) {
        const legendLine = `Q${i + 1}: ${q.text}`;
        const wrapped = doc.splitTextToSize(legendLine, CONTENT_W);
        doc.text(wrapped, MARGIN, y);
        y += wrapped.length * 4;
      }
      y += 8;
    }
  }

  // ── Footer ───────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(190, 190, 190);
  doc.text("Confidential — Clarity Client Report", MARGIN, 285);

  doc.save(`${user.first_name}_${user.last_name}_report.pdf`);
};
