import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Card from "@components/shared/Card/Card";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import { useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchPracticeSettings } from "@/store/slices/practiceSettingsSlice";
import CpdEntryModal from "./CpdEntryModal";
import CpdExportModal from "./CpdExportModal";

import styles from "./AdminCpdPage.module.scss";

export type CpdActivityType = "training" | "reading" | "conference" | "other";

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
  _source?: "private_event";
};

const ACTIVITY_LABELS: Record<CpdActivityType, string> = {
  training: "Training",
  reading: "Reading",
  conference: "Conference",
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
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();
  const [logs, setLogs] = useState<CpdLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [editing, setEditing] = useState<CpdLog | null>(null);

  // ?new=true (from the page walkthrough's CTA) opens the Add entry modal.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setModalOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);
  const [target, setTarget] = useState(30);
  const [filterType, setFilterType] = useState<string>("all");

  const currentYear = new Date().getFullYear();

  const fetchLogs = useCallback(async () => {
    if (!userProfile?.id) return;
    const [{ data, error }, { data: privateData }] = await Promise.all([
      supabase.from("cpd_logs").select("*").eq("admin_id", userProfile.id).order("date", { ascending: false }),
      supabase
        .from("admin_private_events")
        .select("id, admin_id, title, starts_at, ends_at, notes, created_at")
        .eq("is_cpd", true)
        .eq("is_supervision", false),
    ]);
    if (error) showToast("Failed to load CPD log", "error");
    else {
      const manual: CpdLog[] = (data as CpdLog[]) ?? [];
      const fromPrivate: CpdLog[] = (privateData ?? []).map((pe) => ({
        id: pe.id,
        admin_id: pe.admin_id,
        date: pe.starts_at.slice(0, 10),
        activity_type: "other" as CpdActivityType,
        session_number: null,
        contract_code: null,
        mode: null,
        venue: null,
        issues_raised: null,
        supervisor_name: null,
        title: pe.title,
        provider: null,
        duration_minutes: Math.round((new Date(pe.ends_at).getTime() - new Date(pe.starts_at).getTime()) / 60000),
        notes: pe.notes,
        custom_category: null,
        created_at: pe.created_at,
        _source: "private_event" as const,
      }));
      const merged = [...manual, ...fromPrivate].sort((a, b) => b.date.localeCompare(a.date));
      setLogs(merged);
    }
    setLoading(false);
  }, [userProfile?.id, showToast]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useFetchOnIdle((state) => state.practiceSettings.status, fetchPracticeSettings, "Failed to load practice settings");
  const cachedTargetHours = useAppSelector((state) => state.practiceSettings.data?.cpd_annual_target_hours);
  useEffect(() => {
    if (cachedTargetHours) setTarget(cachedTargetHours);
  }, [cachedTargetHours]);

  const handleDelete = async (log: CpdLog) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (log._source === "private_event") {
      // Calendar entries aren't in cpd_logs — just unmark is_cpd so the event
      // stays on the calendar but is removed from the CPD log.
      const { error } = await supabase.from("admin_private_events").update({ is_cpd: false }).eq("id", log.id);
      if (error) showToast("Failed to remove entry", "error");
      else {
        showToast("Removed from CPD log. The calendar event is unchanged.");
        setLogs((prev) => prev.filter((l) => l.id !== log.id));
      }
    } else {
      const { error } = await supabase.from("cpd_logs").delete().eq("id", log.id);
      if (error) showToast("Failed to delete entry", "error");
      else {
        showToast("Entry deleted.");
        setLogs((prev) => prev.filter((l) => l.id !== log.id));
      }
    }
  };

  const handleSaveTarget = async (hours: number) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (!userProfile?.id) return;
    await supabase.from("practice_settings").update({ cpd_annual_target_hours: hours }).eq("admin_id", userProfile.id);
    setTarget(hours);
    showToast("Target updated.");
  };

  const exportCsv = (logsToExport: CpdLog[]) => {
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
    const rows = logsToExport.map((l) => [
      l.date,
      ACTIVITY_LABELS[l.activity_type],
      l.session_number ?? "",
      l.contract_code ?? "",
      l.mode ?? "",
      l.venue ?? "",
      l.title ?? "",
      l.provider ?? "",
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

  // jsPDF + autotable (~150 kB gzipped) are pulled in on demand so they only
  // download when someone actually exports, not on every page load.
  const exportPdf = async (logsToExport: CpdLog[]) => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    const name = userProfile?.display_name ?? "Counsellor";
    doc.setFontSize(16);
    doc.text("CPD Log", 14, 18);
    doc.setFontSize(10);
    doc.text(`${name} · ${currentYear}`, 14, 26);
    doc.text(`Total hours: ${totalHours(logsToExport).toFixed(1)} / ${target}`, 14, 32);

    // Per-type breakdown, so the target line above isn't the only detail on offer.
    const byType = (Object.keys(ACTIVITY_LABELS) as CpdActivityType[])
      .map((type) => ({ type, hours: totalHours(logsToExport.filter((l) => l.activity_type === type)) }))
      .filter((t) => t.hours > 0);
    doc.setFontSize(9);
    doc.text(byType.map((t) => `${ACTIVITY_LABELS[t.type]}: ${t.hours.toFixed(1)}h`).join("   ·   "), 14, 38);

    autoTable(doc, {
      startY: 44,
      head: [["Date", "Type", "Title", "Provider", "Duration"]],
      body: logsToExport.map((l) => [
        l.date,
        activityLabel(l),
        l.title ?? "",
        l.provider ?? "",
        minutesToHours(l.duration_minutes),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [45, 114, 100] },
    });

    // Notes/reflections don't fit the table — list them below, one block per entry that has one.
    const withNotes = logsToExport.filter((l) => l.notes?.trim());
    if (withNotes.length > 0) {
      let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Notes", 14, y);
      y += 7;
      for (const l of withNotes) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`${l.date} — ${activityLabel(l)}`, 14, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(l.notes ?? "", 180);
        doc.text(lines, 14, y);
        y += lines.length * 5 + 6;
      }
    }

    doc.save(`cpd-log-${currentYear}.pdf`);
  };

  const thisYearLogs = logs.filter((l) => new Date(l.date).getFullYear() === currentYear);
  const hoursLogged = totalHours(thisYearLogs);
  const progressPct = Math.min(100, (hoursLogged / target) * 100);

  const standardFilterTypes: CpdActivityType[] = ["training", "reading", "conference"];
  const customCategoryFilters = Array.from(
    new Set(
      logs
        .filter((l) => l.activity_type === "other" && l.custom_category)
        // biome-ignore lint/style/noNonNullAssertion: filtered above — custom_category is guaranteed non-null here
        .map((l) => l.custom_category!),
    ),
  );
  const hasGenericOther = logs.some((l) => l.activity_type === "other" && !l.custom_category);

  const visibleLogs = (() => {
    if (filterType === "all") return logs;
    if (standardFilterTypes.includes(filterType as CpdActivityType))
      return logs.filter((l) => l.activity_type === filterType);
    if (filterType === "other") return logs.filter((l) => l.activity_type === "other" && !l.custom_category);
    return logs.filter((l) => l.activity_type === "other" && l.custom_category === filterType);
  })();

  if (loading) return null;

  return (
    <div className="page">
      <div className={`inner ${styles.page}`}>
        <div className={styles.header} id="cpd-header">
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
            options={[{ label: "Export…", onClick: () => setExportModalOpen(true) }]}
          />
        </div>

        {/* Annual progress */}
        <Card className={styles.progressCard} id="cpd-progress">
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
        <Card className={styles.filtersCard} id="cpd-filters">
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
        </Card>

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
                  <th>Title</th>
                  <th>Provider</th>
                  <th>Duration</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((log) => (
                  <tr key={log.id}>
                    <td className={styles.dateCell}>{log.date}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${log.activity_type}`]}`}>
                        {activityLabel(log)}
                      </span>
                    </td>
                    <td className={styles.textCell}>{log.title}</td>
                    <td className={styles.textCell}>{log.provider}</td>
                    <td className={styles.durationCell}>{minutesToHours(log.duration_minutes)}</td>
                    <td>
                      <div className={styles.actionsCell}>
                        {log._source === "private_event" ? (
                          <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(log)}>
                            Remove
                          </button>
                        ) : (
                          <>
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
                            <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(log)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
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
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void fetchLogs();
          }}
        />
      )}

      {exportModalOpen && (
        <CpdExportModal
          logs={logs}
          onClose={() => setExportModalOpen(false)}
          onExportCsv={(filtered) => {
            exportCsv(filtered);
            setExportModalOpen(false);
          }}
          onExportPdf={(filtered) => {
            void exportPdf(filtered);
            setExportModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
