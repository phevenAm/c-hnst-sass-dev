import { useEffect, useState } from "react";

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
  created_at: string;
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

export default function SuperAdminPage() {
  const { signOut } = useAuth();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("get-all-practices");
        if (fnError) throw new Error(fnError.message);
        setPractices(data.practices ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load practices");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
        <button type="button" className={styles.signOutBtn} onClick={signOut}>
          Sign out
        </button>
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
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
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
                    </td>
                    <td className={styles.dateCell}>
                      {new Date(p.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
