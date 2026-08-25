import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import dayjs from "dayjs";

import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import DonutChart, { type DonutSlice } from "@components/shared/DonutChart/DonutChart";
import { Card, CollapsibleSection } from "@components/shared/index";
import Modal from "@components/shared/Modal/Modal";
import SortableTable, { type SortableColumn } from "@components/shared/SortableTable/SortableTable";
import type { RootState } from "@/store";

import { Button } from "@/components/shared";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { clientDisplayName, isPageStatusLoading } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/models/database.types";
import type { Session, StubSession } from "@/models/globalTypes";
import TrendChart from "@/pages/admin/AdminDashboard/Blocks/TrendChart/TrendChart";
import {
  mergeTrendPoints,
  revenueByMonth,
  revenueByMonthFromPayments,
  revenueByMonthFromStubSessions,
} from "@/pages/admin/AdminDashboard/dashboardUtils";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchClientStubs, selectAllStubs } from "@/store/slices/clientStubsSlice";
import { fetchAllSessions, updateSession, upsertSession } from "@/store/slices/sessionsSlice";
import { fetchAllUsers, selectClientUsers } from "@/store/slices/userDirectorySlice";
import AddPaymentModal from "./AddPaymentModal/AddPaymentModal";

import styles from "./AdminPaymentsPage.module.scss";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ManualPayment = {
  id: string;
  client_id: string | null;
  stub_id: string | null;
  amount_pence: number;
  description: string | null;
  paid_at: string;
};

type StatusFilter = "all" | "paid" | "unpaid";

function respondConfirmMessage(target: { sessions: Session[]; approved: boolean }): string {
  if (!target.approved) {
    return "The client will need to re-check the transfer details or contact you directly.";
  }
  if (target.sessions.length > 1) {
    return `This marks all ${target.sessions.length} sessions in the block as paid.`;
  }
  return "This marks the session as paid.";
}

type PaymentRow = {
  id: string;
  clientId: string | null;
  stubId: string | null;
  clientName: string;
  date: string;
  amountPence: number;
  isPaid: boolean;
  source: "session" | "manual" | "stub-session";
  description: string | null;
  viewPath: string | null;
};

type LedgerRow = Database["public"]["Views"]["payment_ledger_rows"]["Row"];

const LEDGER_PAGE_SIZE = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

function statusPillLabel(filter: StatusFilter, unpaidCount: number): string {
  if (filter === "all") return "All";
  if (filter === "paid") return "Paid";
  return `Outstanding${unpaidCount > 0 ? ` (${unpaidCount})` : ""}`;
}

function ledgerRowName(row: LedgerRow, useCodenames: boolean): string {
  if (row.stub_id) {
    if (useCodenames && row.stub_codename) return row.stub_codename;
    return `${row.stub_first_name ?? ""} ${row.stub_last_name ?? ""}`.trim() || "Unknown offline client";
  }
  if (row.client_id) {
    if (useCodenames && row.admin_codename) return row.admin_codename;
    return (
      row.display_name || `${row.client_first_name ?? ""} ${row.client_last_name ?? ""}`.trim() || "Unnamed client"
    );
  }
  return "—";
}

function ledgerRowViewPath(row: LedgerRow): string | null {
  if (row.source === "session" && row.client_id) return `/admin/clients/${row.client_id}?session=${row.id}`;
  if (row.source === "stub-session" && row.stub_id) return `/admin/clients/stub/${row.stub_id}?session=${row.id}`;
  if (row.client_id) return `/admin/clients/${row.client_id}`;
  if (row.stub_id) return `/admin/clients/stub/${row.stub_id}`;
  return null;
}

function toPaymentRow(row: LedgerRow, useCodenames: boolean): PaymentRow {
  return {
    id: row.id ?? "",
    clientId: row.client_id,
    stubId: row.stub_id,
    clientName: ledgerRowName(row, useCodenames),
    date: row.date ?? "",
    amountPence: row.amount_pence ?? 0,
    isPaid: row.is_paid ?? false,
    source: (row.source as PaymentRow["source"]) ?? "manual",
    description: row.description,
    viewPath: ledgerRowViewPath(row),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

const AdminPaymentsPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isDemo, practiceSettings } = useAuth();
  const { showToast } = useToast();
  const useCodenames = practiceSettings?.use_client_codenames ?? false;

  const [selectedClientId, setSelectedClientId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [stubSessions, setStubSessions] = useState<StubSession[]>([]);
  const [manualPayments, setManualPayments] = useState<ManualPayment[]>([]);
  const [markStubPaid, setMarkStubPaid] = useState<{ id: string; currency: string } | null>(null);
  const [markAmount, setMarkAmount] = useState("");
  const [markNotify, setMarkNotify] = useState(true);
  const [respondTarget, setRespondTarget] = useState<{ sessions: Session[]; approved: boolean } | null>(null);
  const [respondNotify, setRespondNotify] = useState(true);
  const [responding, setResponding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  // Ledger table — server-paginated (see payment_ledger_rows), separate from
  // the unpaginated `sessions`/`stubSessions` used below for Summary stats,
  // which genuinely need the full set to aggregate correctly.
  const [ledgerRows, setLedgerRows] = useState<PaymentRow[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [unpaidLedgerCount, setUnpaidLedgerCount] = useState(0);
  const [ledgerSearchInput, setLedgerSearchInput] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");

  useFetchOnIdle((s: RootState) => s.sessions.status, fetchAllSessions, "Failed to load sessions");
  useFetchOnIdle((s: RootState) => s.userDirectory.status, fetchAllUsers, "Failed to load users");
  useFetchOnIdle((s: RootState) => s.clientStubs.status, fetchClientStubs, "Failed to load offline clients");

  const sessions = useAppSelector((s) => s.sessions.sessions);
  const clients = useAppSelector(selectClientUsers);
  const allStubs = useAppSelector(selectAllStubs);
  const sessionsStatus = useAppSelector((s: RootState) => s.sessions.status);

  const loadStubSessions = useCallback(async () => {
    const { data } = await supabase.from("stub_sessions").select("*").order("scheduled_at", { ascending: false });
    if (data) setStubSessions(data as StubSession[]);
  }, []);

  useEffect(() => {
    loadStubSessions();
  }, [loadStubSessions]);

  // Unpaginated, like stubSessions above — Summary/Revenue need the full set
  // to aggregate correctly, same reasoning as the comment on ledgerRows below.
  // Previously the Summary/Revenue calc only looked at sessions + stub
  // sessions, so manually-recorded payments (cash, bank transfer — anything
  // logged via "Add payment") showed up in the ledger table but never in
  // Collected or the revenue chart.
  const loadManualPayments = useCallback(async () => {
    const { data } = await supabase
      .from("payments")
      .select("id, client_id, stub_id, amount_pence, description, paid_at")
      .order("paid_at", { ascending: false });
    if (data) setManualPayments(data as ManualPayment[]);
  }, []);

  useEffect(() => {
    loadManualPayments();
  }, [loadManualPayments]);

  // Debounce the search box before it drives a server query
  useEffect(() => {
    const t = setTimeout(() => setLedgerSearch(ledgerSearchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [ledgerSearchInput]);

  // Any filter change invalidates the current page
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps intentionally listed to retrigger the reset, not referenced in the body
  useEffect(() => {
    setLedgerPage(1);
  }, [selectedClientId, statusFilter, ledgerSearch]);

  const buildLedgerQuery = useCallback(() => {
    let query = supabase.from("payment_ledger_rows").select("*", { count: "exact" });

    if (selectedClientId !== "all") {
      const isStub = allStubs.some((s) => s.id === selectedClientId);
      query = isStub ? query.eq("stub_id", selectedClientId) : query.eq("client_id", selectedClientId);
    }
    if (statusFilter === "paid") query = query.eq("is_paid", true);
    if (statusFilter === "unpaid") query = query.eq("is_paid", false);
    if (ledgerSearch) {
      const q = `%${ledgerSearch}%`;
      query = query.or(
        [
          `display_name.ilike.${q}`,
          `client_first_name.ilike.${q}`,
          `client_last_name.ilike.${q}`,
          `admin_codename.ilike.${q}`,
          `stub_first_name.ilike.${q}`,
          `stub_last_name.ilike.${q}`,
          `stub_codename.ilike.${q}`,
          `description.ilike.${q}`,
        ].join(","),
      );
    }
    return query;
  }, [selectedClientId, statusFilter, ledgerSearch, allStubs]);

  const loadLedgerPage = useCallback(async () => {
    setLedgerLoading(true);
    const from = (ledgerPage - 1) * LEDGER_PAGE_SIZE;
    const to = from + LEDGER_PAGE_SIZE - 1;
    const { data, count, error } = await buildLedgerQuery().order("date", { ascending: false }).range(from, to);

    if (!error) {
      setLedgerRows((data ?? []).map((row) => toPaymentRow(row, useCodenames)));
      setLedgerTotal(count ?? 0);
    }
    setLedgerLoading(false);
  }, [buildLedgerQuery, ledgerPage, useCodenames]);

  useEffect(() => {
    loadLedgerPage();
  }, [loadLedgerPage]);

  // Lightweight count-only query for the "Outstanding (N)" filter pill —
  // scoped to the client filter but not the status filter or search, since
  // it needs to reflect the unpaid total regardless of which pill is active.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase.from("payment_ledger_rows").select("*", { count: "exact", head: true }).eq("is_paid", false);
      if (selectedClientId !== "all") {
        const isStub = allStubs.some((s) => s.id === selectedClientId);
        query = isStub ? query.eq("stub_id", selectedClientId) : query.eq("client_id", selectedClientId);
      }
      const { count } = await query;
      if (!cancelled) setUnpaidLedgerCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClientId, allStubs]);

  // ── Name resolution ───────────────────────────────────────────────────────

  const clientNameById = useCallback(
    (clientId: string | null, stubId: string | null): string => {
      if (clientId) {
        const c = clients.find((x) => x.id === clientId);
        return c ? clientDisplayName(c, useCodenames) : "Unknown client";
      }
      if (stubId) {
        const s = allStubs.find((x) => x.id === stubId);
        if (!s) return "Unknown offline client";
        return useCodenames ? s.codename || `${s.first_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`;
      }
      return "—";
    },
    [clients, allStubs, useCodenames],
  );

  // ── Summary ───────────────────────────────────────────────────────────────

  const scopedSessions = useMemo(
    () => (selectedClientId === "all" ? sessions : sessions.filter((s) => s.client_id === selectedClientId)),
    [sessions, selectedClientId],
  );

  const scopedStubSessions = useMemo(() => {
    if (selectedClientId === "all") return stubSessions;
    // Direct stub filter (stub selected in dropdown)
    if (allStubs.some((s) => s.id === selectedClientId)) {
      return stubSessions.filter((s) => s.stub_id === selectedClientId);
    }
    // Real user selected — include sessions from stubs merged into this user
    const linkedStubIds = new Set(allStubs.filter((s) => s.linked_user_id === selectedClientId).map((s) => s.id));
    return stubSessions.filter((s) => linkedStubIds.has(s.stub_id));
  }, [stubSessions, allStubs, selectedClientId]);

  const scopedManualPayments = useMemo(() => {
    if (selectedClientId === "all") return manualPayments;
    if (allStubs.some((s) => s.id === selectedClientId)) {
      return manualPayments.filter((p) => p.stub_id === selectedClientId);
    }
    const linkedStubIds = new Set(allStubs.filter((s) => s.linked_user_id === selectedClientId).map((s) => s.id));
    return manualPayments.filter(
      (p) => p.client_id === selectedClientId || (!!p.stub_id && linkedStubIds.has(p.stub_id)),
    );
  }, [manualPayments, allStubs, selectedClientId]);

  const stats = useMemo(() => {
    const base = scopedSessions.reduce(
      (acc, s) => {
        if (s.status === "cancelled") return acc;
        if (s.paid) {
          acc.collectedPence += s.price_pence ?? 0;
          acc.paidCount += 1;
        } else {
          acc.outstandingPence += s.price_pence ?? 0;
          acc.unpaidCount += 1;
        }
        return acc;
      },
      { collectedPence: 0, outstandingPence: 0, paidCount: 0, unpaidCount: 0 },
    );
    const withStubs = scopedStubSessions
      .filter((s) => s.status !== "cancelled")
      .reduce((acc, s) => {
        const amountPence = Math.round((s.amount_paid ?? 0) * 100);
        if (s.amount_paid != null && s.amount_paid > 0) {
          acc.collectedPence += amountPence;
          acc.paidCount += 1;
        } else {
          acc.unpaidCount += 1;
        }
        return acc;
      }, base);
    // Manual payments (cash, bank transfer, etc. logged via "Add payment")
    // are money already received, not a session — they add to Collected but
    // deliberately don't touch paidCount/unpaidCount, which are session tallies.
    const manualPence = scopedManualPayments.reduce((sum, p) => sum + p.amount_pence, 0);
    return { ...withStubs, collectedPence: withStubs.collectedPence + manualPence };
  }, [scopedSessions, scopedStubSessions, scopedManualPayments]);

  const revenueData = useMemo(
    () =>
      mergeTrendPoints(
        revenueByMonth(scopedSessions, 6),
        revenueByMonthFromStubSessions(scopedStubSessions, 6),
        revenueByMonthFromPayments(scopedManualPayments, 6),
      ),
    [scopedSessions, scopedStubSessions, scopedManualPayments],
  );

  // Not scoped to selectedClientId — this is an actionable inbox, so a client
  // filter shouldn't hide something the admin still needs to respond to.
  const pendingManualPayments = useMemo(
    () => sessions.filter((s) => s.manual_payment_status === "pending"),
    [sessions],
  );

  // request_manual_payment() flags every session in a block as pending at
  // once (see 20260819000006_block_aware_manual_payment.sql), so a 3-session
  // block previously showed as 3 separate rows here, each with its own
  // Confirm/Decline — approving any one of them cascades server-side and
  // makes all 3 vanish on the next refetch, which read as "the others just
  // disappeared". Grouping by block_id shows one row for the whole block
  // (any session's id is enough — respond_manual_payment cascades from it).
  const pendingManualPaymentGroups = useMemo(() => {
    const groups = new Map<string, Session[]>();
    for (const s of pendingManualPayments) {
      const blockId = (s.metadata as { block_id?: string } | null)?.block_id;
      const key = blockId ? `block:${blockId}` : `session:${s.id}`;
      const existing = groups.get(key);
      if (existing) existing.push(s);
      else groups.set(key, [s]);
    }
    return Array.from(groups.values()).map((group) => ({
      sessions: group.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
      totalPence: group.reduce((sum, s) => sum + (s.price_pence ?? 0), 0),
    }));
  }, [pendingManualPayments]);

  const paymentSlices: DonutSlice[] = [
    { name: "Paid", value: stats.paidCount, color: "#2d7264" },
    { name: "Unpaid", value: stats.unpaidCount, color: "#c98a2b" },
  ];

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleMarkPaid = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    await dispatch(updateSession({ id: sessionId, paid: true })).unwrap();
    await loadLedgerPage();
    showToast("Session marked as paid.");
  };

  const handleConfirmMarkStubPaid = async () => {
    if (!markStubPaid) return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    const amount = parseFloat(markAmount);
    if (!amount || amount <= 0) {
      showToast("Enter a valid amount.", "danger");
      return;
    }
    const { error } = await supabase.from("stub_sessions").update({ amount_paid: amount }).eq("id", markStubPaid.id);
    if (error) {
      showToast("Failed to update payment.", "danger");
      return;
    }
    setStubSessions((prev) => prev.map((s) => (s.id === markStubPaid.id ? { ...s, amount_paid: amount } : s)));
    await loadLedgerPage();
    if (markNotify) {
      supabase.functions.invoke("notify-stub-payment-recorded", { body: { stub_session_id: markStubPaid.id } });
    }
    showToast("Payment recorded.");
    setMarkStubPaid(null);
    setMarkAmount("");
  };

  const openRespondConfirm = (sessions: Session[], approved: boolean) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setRespondNotify(true);
    setRespondTarget({ sessions, approved });
  };

  const handleConfirmRespond = async () => {
    if (!respondTarget) return;
    const { sessions: targetSessions, approved } = respondTarget;
    // respond_manual_payment cascades to every session sharing this one's
    // block_id server-side (or just this session, if it's not part of a
    // block) — any session in the group is enough to trigger the whole
    // group's approval/decline.
    const primarySession = targetSessions[0];
    setResponding(true);
    const { error } = await supabase.rpc("respond_manual_payment", {
      p_session_id: primarySession.id,
      p_approved: approved,
    });
    setResponding(false);
    if (error) {
      showToast("Failed to update payment.", "error");
      return;
    }
    const paidAt = new Date().toISOString();
    for (const session of targetSessions) {
      dispatch(
        upsertSession({
          ...session,
          manual_payment_status: approved ? "approved" : "declined",
          paid: approved ? true : session.paid,
          paid_at: approved ? paidAt : session.paid_at,
        }),
      );
    }
    await loadLedgerPage();
    if (respondNotify) {
      supabase.functions.invoke(approved ? "send-payment-notification" : "notify-manual-payment-declined", {
        body: { session_id: primarySession.id },
      });
    }
    showToast(approved ? "Payment confirmed." : "Payment declined.");
    setRespondTarget(null);
  };

  const openRemoveConfirm = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    setRemoveTarget(id);
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    await supabase.from("payments").delete().eq("id", removeTarget);
    setRemoving(false);
    await Promise.all([loadLedgerPage(), loadManualPayments()]);
    showToast("Payment removed.");
    setRemoveTarget(null);
  };

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns: SortableColumn<PaymentRow>[] = [
    {
      key: "client",
      label: "Client",
      render: (r) => <span className={styles.clientCell}>{r.clientName}</span>,
    },
    {
      key: "date",
      label: "Date",
      render: (r) => <span className={styles.dateCell}>{dayjs(r.date).format("D MMM YYYY")}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      render: (r) => <span className={styles.amountCell}>{r.amountPence > 0 ? money(r.amountPence) : "—"}</span>,
    },
    {
      key: "description",
      label: "Description",
      mobileHide: true,
      render: (r) => (
        <span className={styles.descCell}>
          {r.description ||
            (r.source === "session" ? "Session" : r.source === "stub-session" ? "Offline session" : "—")}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <span className={r.isPaid ? styles.badgePaid : styles.badgeUnpaid}>{r.isPaid ? "Paid" : "Outstanding"}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <div className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
          {!r.isPaid && r.source === "session" && (
            <Button size="sm" variant="ghost" onClick={(e) => handleMarkPaid(e, r.id)}>
              Mark paid
            </Button>
          )}
          {!r.isPaid && r.source === "stub-session" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setMarkAmount("");
                setMarkStubPaid({ id: r.id, currency: "GBP" });
              }}
            >
              Mark paid
            </Button>
          )}
          {r.source === "manual" && (
            <Button size="sm" variant="ghost" onClick={(e) => openRemoveConfirm(e, r.id)}>
              Remove
            </Button>
          )}
          {r.viewPath && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                navigate(r.viewPath!);
              }}
            >
              View
            </Button>
          )}
        </div>
      ),
    },
  ];

  const guard = isPageStatusLoading(sessionsStatus);
  if (guard) return guard;

  return (
    <div className="page">
      <div className="inner">
        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.heading}>Payments</h1>
            <p className={styles.subheading}>Revenue collected, outstanding balances, and payment history.</p>
          </div>
          <div className={styles.headerActions}>
            <label className={styles.filter}>
              <span className={styles.filterLabel}>Client</span>
              <select
                className={styles.filterSelect}
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="all">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientDisplayName(c, useCodenames)}
                  </option>
                ))}
                {allStubs.some((s) => !s.linked_user_id) && (
                  <optgroup label="Offline clients">
                    {allStubs
                      .filter((s) => !s.linked_user_id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {useCodenames
                            ? s.codename || `${s.first_name} ${s.last_name}`
                            : `${s.first_name} ${s.last_name}`}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </label>
            <Button size="sm" onClick={() => setAddPaymentOpen(true)}>
              Add payment
            </Button>
          </div>
        </div>

        {/* ── Pending bank transfers ── */}
        {pendingManualPayments.length > 0 && (
          <Card className={styles.pendingCard}>
            <h2 className={styles.pendingHeading}>
              Pending bank transfers <span className={styles.pendingCount}>{pendingManualPaymentGroups.length}</span>
            </h2>
            <p className={styles.pendingSub}>Clients have marked these sessions as paid by bank transfer.</p>
            <ul className={styles.pendingList}>
              {pendingManualPaymentGroups.map(({ sessions: groupSessions, totalPence }) => {
                const first = groupSessions[0];
                const isBlock = groupSessions.length > 1;
                return (
                  <li key={first.id} className={styles.pendingRow}>
                    <div className={styles.pendingInfo}>
                      <span className={styles.pendingClient}>
                        {clientNameById(first.client_id, null)}
                        {isBlock && ` — block of ${groupSessions.length} sessions`}
                      </span>
                      <span className={styles.pendingMeta}>
                        {isBlock
                          ? `${dayjs(first.scheduled_at).format("D MMM")} – ${dayjs(groupSessions[groupSessions.length - 1].scheduled_at).format("D MMM YYYY")}`
                          : dayjs(first.scheduled_at).format("D MMM YYYY")}{" "}
                        · {money(totalPence)}
                      </span>
                    </div>
                    <div className={styles.pendingActions}>
                      <Button size="sm" onClick={() => openRespondConfirm(groupSessions, true)}>
                        Confirm paid
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openRespondConfirm(groupSessions, false)}>
                        Decline
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {/* ── Summary ── */}
        <Card className={styles.sectionCard}>
          <CollapsibleSection title="Summary" storageKey="payments:summary">
            <div className={styles.statsGrid}>
              {[
                { label: "Collected", value: money(stats.collectedPence), tone: styles.toneGood },
                { label: "Outstanding", value: money(stats.outstandingPence), tone: styles.toneWarn },
                { label: "Paid sessions", value: stats.paidCount, tone: "" },
                { label: "Unpaid sessions", value: stats.unpaidCount, tone: "" },
              ].map((s) => (
                <Card key={s.label} className={styles.statCard}>
                  <p className={`${styles.statValue} ${s.tone}`}>{s.value}</p>
                  <p className={styles.statLabel}>{s.label}</p>
                </Card>
              ))}
            </div>
            <div className={styles.chartsGrid}>
              <TrendChart
                title="Revenue (last 6 months)"
                data={revenueData}
                type="bar"
                color="#2d7264"
                valueFormatter={(v) => `£${v.toFixed(2)}`}
              />
              <DonutChart
                title="Paid vs unpaid"
                slices={paymentSlices}
                centerValue={money(stats.collectedPence)}
                centerLabel="collected"
              />
            </div>
          </CollapsibleSection>
        </Card>

        <Card className={styles.tableCard}>
          <CollapsibleSection title="History" storageKey="payments:table">
            {/* ── Payments table ── */}
            <SortableTable<PaymentRow>
              columns={columns}
              rows={ledgerRows}
              rowKey={(r) => `${r.source}-${r.id}`}
              emptyText="No payments to show."
              page={ledgerPage}
              totalCount={ledgerTotal}
              pageSize={LEDGER_PAGE_SIZE}
              onPageChange={setLedgerPage}
              loading={ledgerLoading}
              toolbar={
                <div className={styles.tableToolbar}>
                  <div className={styles.statusFilters}>
                    {(["all", "paid", "unpaid"] as StatusFilter[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`${styles.filterPill} ${statusFilter === f ? styles.filterPillActive : ""}`}
                        onClick={() => setStatusFilter(f)}
                      >
                        {statusPillLabel(f, unpaidLedgerCount)}
                      </button>
                    ))}
                  </div>
                  <input
                    type="search"
                    className={styles.tableSearchInput}
                    placeholder="Search by client or description…"
                    value={ledgerSearchInput}
                    onChange={(e) => setLedgerSearchInput(e.target.value)}
                    aria-label="Search payments"
                  />
                </div>
              }
            />
          </CollapsibleSection>
        </Card>
      </div>

      {addPaymentOpen && (
        <AddPaymentModal
          clients={clients}
          stubs={allStubs}
          useCodenames={useCodenames}
          onClose={() => setAddPaymentOpen(false)}
          onSaved={() => {
            loadLedgerPage();
            loadManualPayments();
            setAddPaymentOpen(false);
          }}
        />
      )}

      {markStubPaid && (
        <Modal
          title="Record payment amount"
          size="sm"
          onClose={() => setMarkStubPaid(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setMarkStubPaid(null)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmMarkStubPaid} disabled={!markAmount}>
                Save
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-secondary)" }}>
              Amount paid (£)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="85.00"
              value={markAmount}
              onChange={(e) => setMarkAmount(e.target.value)}
              autoFocus
              style={{
                padding: "10px 14px",
                border: "1.5px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                fontFamily: "var(--font-sans)",
                outline: "none",
              }}
            />
            <label
              style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.85rem", cursor: "pointer" }}
            >
              <input type="checkbox" checked={markNotify} onChange={(e) => setMarkNotify(e.target.checked)} />
              Email the client that their payment was recorded
            </label>
          </div>
        </Modal>
      )}

      {respondTarget && (
        <ConfirmModal
          title={respondTarget.approved ? "Confirm this payment?" : "Decline this payment?"}
          onClose={() => setRespondTarget(null)}
          onConfirm={handleConfirmRespond}
          confirming={responding}
          danger={!respondTarget.approved}
          confirmLabel={respondTarget.approved ? "Yes, confirm paid" : "Yes, decline"}
          notifyOption={{
            label: respondTarget.approved
              ? "Email the client that their payment was confirmed"
              : "Email the client that their payment couldn't be verified",
            checked: respondNotify,
            onChange: setRespondNotify,
          }}
        >
          <p>{respondConfirmMessage(respondTarget)}</p>
        </ConfirmModal>
      )}

      {removeTarget && (
        <ConfirmModal
          title="Remove this payment?"
          onClose={() => setRemoveTarget(null)}
          onConfirm={handleConfirmRemove}
          confirming={removing}
          confirmLabel="Yes, remove"
        >
          <p>This permanently deletes the payment record. This can't be undone.</p>
        </ConfirmModal>
      )}
    </div>
  );
};

export default AdminPaymentsPage;
