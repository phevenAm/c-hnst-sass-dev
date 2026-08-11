import { useCallback, useEffect, useState } from "react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Card from "@components/shared/Card/Card";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import CpdEntryModal from "./CpdEntryModal";

import styles from "./AdminCpdPage.module.scss";

export type CpdActivityType =
  | "supervision"
  | "training"
  | "reading"
  | "conference"
  | "peer_consultation"
  | "personal_therapy"
  | "other";

export type CpdLog = {
  id: string;
  admin_id: string;
  date: string;
  activity_type: CpdActivityType;
  session_number: number | null;
  contract_code: string | null;
  mode: string | null;
  venue: string | null;
  issues_raised: string | null;
  supervisor_name: string | null;
  title: string | null;
  provider: string | null;
  duration_minutes: number | null;
  notes: string | null;
  custom_category: string | null;
  created_at: string;
};

const ACTIVITY_LABELS: Record<CpdActivityType, string> = {
  supervision: "Supervision",
  training: "Training",
  reading: "Reading",
  conference: "Conference",
  peer_consultation: "Peer Consultation",
  personal_therapy: "Personal Therapy",
  other: "Other",
};

function activityLabel(log: CpdLog): string {
  if (log.activity_type === "other" && log.custom_category) return log.custom_category;
  return ACTIVITY_LABELS[log.activity_type];
}

function minutesToHours(mins: number | null): string {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function totalHours(logs: CpdLog[]): number {
  return logs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0) / 60;
}

export default function AdminCpdPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const [logs, setLogs] = useState<CpdLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CpdLog | null>(null);
  const [target, setTarget] = useState(30);
  const [filterType, setFilterType] = useState<string>("all");

  const currentYear = new Date().getFullYear();

  const fetchLogs = useCallback(async () => {
    if (!userProfile?.id) return;
    const { data, error } = await supabase
      .from("cpd_logs")
      .select("*")
      .eq("admin_id", userProfile.id)
      .order("date", { ascending: false });
    if (error) showToast("Failed to load CPD log", "error");
    else setLogs((data as CpdLog[]) ?? []);
    setLoading(false);
  }, [userProfile?.id]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!userProfile?.id) return;
    supabase
      .from("practice_settings")
      .select("cpd_annual_target_hours")
      .eq("admin_id", userProfile.id)
      .single()
      .then(({ data }) => {
        if (data?.cpd_annual_target_hours) setTarget(data.cpd_annual_target_hours);
      });
  }, [userProfile?.id]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("cpd_logs").delete().eq("id", id);
    if (error) showToast("Failed to delete entry", "error");
    else {
      showToast("Entry deleted.");
      setLogs((prev) => prev.filter((l) => l.id !== id));
    }
  };

  const handleSaveTarget = async (hours: number) => {
    if (!userProfile?.id) return;
    await supabase.from("practice_settings").update({ cpd_annual_target_hours: hours }).eq("admin_id", userProfile.id);
    setTarget(hours);
    showToast("Target updated.");
  };

  const exportCsv = () => {
    const headers = [
      "Date",
      "Type",
      "Session #",
      "Contract",
      "Mode",
      "Venue",
      "Title / Issues",
      "Provider / Supervisor",
      "Duration",
      "Notes",
    ];
    const rows = visibleLogs.map((l) => [
      l.date,
      ACTIVITY_LABELS[l.activity_type],
      l.session_number ?? "",
      l.contract_code ?? "",
      l.mode ?? "",
      l.venue ?? "",
      l.activity_type === "supervision" ? (l.issues_raised ?? "") : (l.title ?? ""),
      l.activity_type === "supervision" ? (l.supervisor_name ?? "") : (l.provider ?? ""),
      minutesToHours(l.duration_minutes),
      l.notes ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cpd-log-${currentYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    const name = userProfile?.display_name ?? "Counsellor";
    doc.setFontSize(16);
    doc.text("CPD Log", 14, 18);
    doc.setFontSize(10);
    doc.text(`${name} · ${currentYear}`, 14, 26);
    doc.text(`Total hours: ${totalHours(visibleLogs).toFixed(1)} / ${target}`, 14, 32);

    autoTable(doc, {
      startY: 38,
      head: [["Date", "Type", "Title / Issues", "Supervisor / Provider", "Duration"]],
      body: visibleLogs.map((l) => [
        l.date,
        ACTIVITY_LABELS[l.activity_type],
        l.activity_type === "supervision" ? (l.issues_raised ?? "") : (l.title ?? ""),
        l.activity_type === "supervision" ? (l.supervisor_name ?? "") : (l.provider ?? ""),
        minutesToHours(l.duration_minutes),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [45, 114, 100] },
    });

    doc.save(`cpd-log-${currentYear}.pdf`);
  };

  const thisYearLogs = logs.filter((l) => new Date(l.date).getFullYear() === currentYear);
  const hoursLogged = totalHours(thisYearLogs);
  const progressPct = Math.min(100, (hoursLogged / target) * 100);

  const standardFilterTypes: CpdActivityType[] = [
    "training",
    "reading",
    "conference",
    "peer_consultation",
    "personal_therapy",
  ];
  const customCategoryFilters = Array.from(
    new Set(logs.filter((l) => l.activity_type === "other" && l.custom_category).map((l) => l.custom_category!)),
  );
  const hasGenericOther = logs.some((l) => l.activity_type === "other" && !l.custom_category);

  const visibleLogs = (() => {
    if (filterType === "all") return logs;
    if (standardFilterTypes.includes(filterType as CpdActivityType))
      return logs.filter((l) => l.activity_type === filterType);
    if (filterType === "other") return logs.filter((l) => l.activity_type === "other" && !l.custom_category);
    return logs.filter((l) => l.activity_type === "other" && l.custom_category === filterType);
  })();

  const nextSessionNumber = (logs.filter((l) => l.activity_type === "supervision").length ?? 0) + 1;

  if (loading) return null;

  return (
    <div className="page">
      <div className={`inner ${styles.page}`}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>CPD Log</h1>
            <p className={styles.sub}>Track your continuing professional development activities</p>
          </div>
          <SplitButton
            variant="primary"
            primaryLabel="Add entry"
            primaryAction={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            options={[
              { label: "Export CSV", onClick: exportCsv },
              { label: "Export PDF", onClick: exportPdf },
            ]}
          />
        </div>

        {/* Annual progress */}
        <Card className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>
              {currentYear} progress — <strong>{hoursLogged.toFixed(1)} hrs</strong> of{" "}
              <input
                type="number"
                className={styles.targetInput}
                value={target}
                min={1}
                max={200}
                onChange={(e) => setTarget(Number(e.target.value))}
                onBlur={(e) => handleSaveTarget(Number(e.target.value))}
              />{" "}
              hr target
            </span>
            <span className={styles.progressPct}>{progressPct.toFixed(0)}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
        </Card>

        {/* Filter tabs */}
        <div className={styles.filters}>
          {(["all", ...standardFilterTypes, ...(hasGenericOther ? ["other"] : [])] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.filterBtn} ${filterType === t ? styles.filterBtnActive : ""}`}
              onClick={() => setFilterType(t)}
            >
              {t === "all" ? "All" : ACTIVITY_LABELS[t as CpdActivityType]}
            </button>
          ))}
          {customCategoryFilters.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`${styles.filterBtn} ${filterType === cat ? styles.filterBtnActive : ""}`}
              onClick={() => setFilterType(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Log table */}
        {visibleLogs.length === 0 ? (
          <Card className={styles.empty}>
            <p>No entries yet. Add your first CPD activity to get started.</p>
          </Card>
        ) : (
          <Card className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Title / Issues raised</th>
                  <th>Supervisor / Provider</th>
                  <th>Duration</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((log) => (
                  <tr key={log.id}>
                    <td className={styles.dateCell}>{log.date}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${log.activity_type}`]}`}>
                        {activityLabel(log)}
                        {log.activity_type === "supervision" && log.session_number ? ` #${log.session_number}` : ""}
                      </span>
                    </td>
                    <td className={styles.textCell}>
                      {log.activity_type === "supervision" ? log.issues_raised : log.title}
                    </td>
                    <td className={styles.textCell}>
                      {log.activity_type === "supervision" ? log.supervisor_name : log.provider}
                    </td>
                    <td className={styles.durationCell}>{minutesToHours(log.duration_minutes)}</td>
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => {
                          setEditing(log);
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(log.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {modalOpen && (
        <CpdEntryModal
          initial={editing}
          adminId={userProfile?.id ?? ""}
          nextSessionNumber={nextSessionNumber}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void fetchLogs();
          }}
        />
      )}
    </div>
  );
}
