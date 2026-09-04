import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";

import styles from "./SuperAdminPage.module.scss";

type Practice = {
  id: string;
  admin_id: string;
  business_name: string | null;
  subscription_status: string;
  subscription_plan: string;
  stripe_subscription_id: string | null;
  billing_customer_id: string | null;
  is_paused: boolean;
  paused_reason: string | null;
  updated_at: string;
  users: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    created_at: string;
    disabled: boolean;
  } | null;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: styles.statusActive },
  trialing: { label: "Trial", cls: styles.statusTrial },
  inactive: { label: "Inactive", cls: styles.statusInactive },
  canceled: { label: "Cancelled", cls: styles.statusCancelled },
  past_due: { label: "Past due", cls: styles.statusPastDue },
};

const PLAN_LABELS: Record<string, string> = {
  website: "Website",
  app: "App",
  bundle: "Website + App",
};

type FeedbackRow = {
  id: string;
  type: "bug" | "feature";
  severity: "normal" | "high" | null;
  message: string;
  page: string | null;
  status: "new" | "reviewing" | "done";
  created_at: string;
  submitter: { first_name: string | null; last_name: string | null } | null;
};

const FEEDBACK_STATUSES: FeedbackRow["status"][] = ["new", "reviewing", "done"];

export default function SuperAdminPage() {
  const { signOut } = useAuth();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [pausingPractice, setPausingPractice] = useState<Practice | null>(null);
  const [resumingPractice, setResumingPractice] = useState<Practice | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [togglingPause, setTogglingPause] = useState(false);

  const loadPractices = useCallback(async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-all-practices");
      if (fnError) throw new Error(fnError.message);
      setPractices(data.practices ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load practices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPractices();
  }, [loadPractices]);

  // Pausing also pauses Stripe billing (see the edge function) — charging for
  // an account that's just been made read-only doesn't make sense, so the
  // two always move together rather than being separate toggles.
  const handleTogglePause = async (practice: Practice, paused: boolean) => {
    setTogglingPause(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("superadmin-set-practice-paused", {
        body: { admin_id: practice.admin_id, paused, reason: paused ? pauseReason.trim() || null : null },
      });
      if (fnError) throw new Error(fnError.message);
      await loadPractices();
      setPausingPractice(null);
      setResumingPractice(null);
      setPauseReason("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update pause status");
    } finally {
      setTogglingPause(false);
    }
  };

  // Feedback inbox (RLS: superadmin reads all rows).
  useEffect(() => {
    supabase
      .from("feedback")
      .select("id, type, severity, message, page, status, created_at, submitter:users(first_name, last_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data as FeedbackRow[]) ?? [];
        // high-severity (crash reports) float to the top, order otherwise kept
        rows.sort((a, b) => (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0));
        setFeedback(rows);
      });
  }, []);

  const updateFeedbackStatus = async (id: string, status: FeedbackRow["status"]) => {
    setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    await supabase.from("feedback").update({ status }).eq("id", id);
  };

  const filtered = practices.filter((p) => {
    const q = search.toLowerCase();
    return (
      !q ||
      p.business_name?.toLowerCase().includes(q) ||
      p.users?.email?.toLowerCase().includes(q) ||
      p.users?.first_name?.toLowerCase().includes(q) ||
      p.users?.last_name?.toLowerCase().includes(q)
    );
  });

  const counts = {
    total: practices.length,
    active: practices.filter((p) => p.subscription_status === "active").length,
    mrr: practices
      .filter((p) => p.subscription_status === "active")
      .reduce((sum, p) => {
        const prices: Record<string, number> = { website: 15, app: 20, bundle: 29 };
        return sum + (prices[p.subscription_plan] ?? 20);
      }, 0),
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Honest Portal</h1>
          <p className={styles.subtitle}>Superadmin — all practices</p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/dev" className={styles.signOutBtn}>
            Test coverage
          </Link>
          <button type="button" className={styles.signOutBtn} onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statVal}>{counts.total}</span>
          <span className={styles.statLabel}>Total practices</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statVal}>{counts.active}</span>
          <span className={styles.statLabel}>Active subscriptions</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statVal}>£{counts.mrr}</span>
          <span className={styles.statLabel}>Est. MRR</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {loading && <p className={styles.message}>Loading…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      {!loading && !error && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Practice</th>
                <th>Owner</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    No practices found.
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const status = STATUS_LABELS[p.subscription_status] ?? {
                  label: p.subscription_status,
                  cls: styles.statusInactive,
                };
                const ownerName = [p.users?.first_name, p.users?.last_name].filter(Boolean).join(" ") || "—";
                return (
                  <tr key={p.id}>
                    <td>
                      <span className={styles.practiceName}>{p.business_name || "Unnamed practice"}</span>
                    </td>
                    <td>
                      <span className={styles.ownerName}>{ownerName}</span>
                      {p.users?.email && <span className={styles.ownerEmail}>{p.users.email}</span>}
                    </td>
                    <td>
                      <span className={styles.planTag}>{PLAN_LABELS[p.subscription_plan] ?? p.subscription_plan}</span>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${status.cls}`}>{status.label}</span>
                      {p.is_paused && <span className={`${styles.statusBadge} ${styles.statusPaused}`}>Paused</span>}
                    </td>
                    <td className={styles.dateCell}>
                      {new Date(p.users?.created_at ?? p.updated_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td>
                      {p.is_paused ? (
                        <Button variant="secondary" size="sm" onClick={() => setResumingPractice(p)}>
                          Resume
                        </Button>
                      ) : (
                        <Button variant="ghost-danger" size="sm" onClick={() => setPausingPractice(p)}>
                          Pause
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pausingPractice && (
        <ConfirmModal
          title={`Pause ${pausingPractice.business_name || "this practice"}?`}
          confirmLabel="Pause practice"
          confirming={togglingPause}
          onConfirm={() => handleTogglePause(pausingPractice, true)}
          onClose={() => {
            setPausingPractice(null);
            setPauseReason("");
          }}
        >
          <p>
            This makes the practice read-only for the admin and every client — nothing can be created, edited, or
            deleted until resumed. Their Stripe subscription is also paused, so they won't be charged while paused.
          </p>
          <textarea
            className={styles.pauseReasonInput}
            placeholder="Reason (optional, internal only)"
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
          />
        </ConfirmModal>
      )}

      {resumingPractice && (
        <ConfirmModal
          title={`Resume ${resumingPractice.business_name || "this practice"}?`}
          confirmLabel="Resume practice"
          danger={false}
          confirming={togglingPause}
          onConfirm={() => handleTogglePause(resumingPractice, false)}
          onClose={() => setResumingPractice(null)}
        >
          <p>This restores normal read/write access and resumes their Stripe billing on its usual cycle.</p>
        </ConfirmModal>
      )}

      {/* ── Feedback inbox ── */}
      <h2 className={styles.sectionTitle}>Feedback ({feedback.length})</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Message</th>
              <th>From</th>
              <th>Page</th>
              <th>When</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {feedback.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  No feedback yet.
                </td>
              </tr>
            )}
            {feedback.map((f) => {
              const from = [f.submitter?.first_name, f.submitter?.last_name].filter(Boolean).join(" ") || "—";
              return (
                <tr key={f.id}>
                  <td>
                    {f.severity === "high" && <span className={styles.alertTag}>HIGH ALERT</span>}
                    <span className={styles.planTag}>{f.type === "bug" ? "🐛 Bug" : "💡 Feature"}</span>
                  </td>
                  <td>{f.message}</td>
                  <td>
                    <span className={styles.ownerName}>{from}</span>
                  </td>
                  <td className={styles.dateCell}>{f.page ?? "—"}</td>
                  <td className={styles.dateCell}>
                    {new Date(f.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <select
                      value={f.status}
                      onChange={(e) => updateFeedbackStatus(f.id, e.target.value as FeedbackRow["status"])}
                      className={styles.statusSelect}
                    >
                      {FEEDBACK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
