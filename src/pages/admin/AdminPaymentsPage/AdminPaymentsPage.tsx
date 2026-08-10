import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import dayjs from "dayjs";

import DonutChart, { type DonutSlice } from "@components/shared/DonutChart/DonutChart";
import { Card, CollapsibleSection } from "@components/shared/index";
import SortableTable, { type SortableColumn } from "@components/shared/SortableTable/SortableTable";
import type { RootState } from "@/store";

import { Button } from "@/components/shared";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { clientDisplayName, isPageStatusLoading } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase";
import TrendChart from "@/pages/admin/AdminDashboard/Blocks/TrendChart/TrendChart";
import { revenueByMonth } from "@/pages/admin/AdminDashboard/dashboardUtils";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchClientStubs, selectAllStubs } from "@/store/slices/clientStubsSlice";
import { fetchAllSessions, updateSession } from "@/store/slices/sessionsSlice";
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

type PaymentRow = {
  id: string;
  clientId: string | null;
  stubId: string | null;
  clientName: string;
  date: string;
  amountPence: number;
  isPaid: boolean;
  source: "session" | "manual";
  description: string | null;
  viewPath: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

// ── Page ──────────────────────────────────────────────────────────────────────

const AdminPaymentsPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isDemo, practiceSettings, userProfile } = useAuth();
  const { showToast } = useToast();
  const useCodenames = practiceSettings?.use_client_codenames ?? false;

  const [selectedClientId, setSelectedClientId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [manualPayments, setManualPayments] = useState<ManualPayment[]>([]);

  useFetchOnIdle((s: RootState) => s.sessions.status, fetchAllSessions, "Failed to load sessions");
  useFetchOnIdle((s: RootState) => s.userDirectory.status, fetchAllUsers, "Failed to load users");
  useFetchOnIdle((s: RootState) => s.clientStubs.status, fetchClientStubs, "Failed to load offline clients");

  const sessions = useAppSelector((s) => s.sessions.sessions);
  const clients = useAppSelector(selectClientUsers);
  const allStubs = useAppSelector(selectAllStubs);
  const sessionsStatus = useAppSelector((s: RootState) => s.sessions.status);

  const loadManualPayments = useCallback(async () => {
    if (!userProfile?.id) return;
    const { data } = await supabase
      .from("payments")
      .select("id, client_id, stub_id, amount_pence, description, paid_at")
      .order("paid_at", { ascending: false });
    if (data) setManualPayments(data as ManualPayment[]);
  }, [userProfile?.id]);

  useEffect(() => {
    loadManualPayments();
  }, [loadManualPayments]);

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

  const stats = useMemo(
    () =>
      scopedSessions.reduce(
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
      ),
    [scopedSessions],
  );

  const revenueData = useMemo(() => revenueByMonth(scopedSessions, 6), [scopedSessions]);

  const paymentSlices: DonutSlice[] = [
    { name: "Paid", value: stats.paidCount, color: "#2d7264" },
    { name: "Unpaid", value: stats.unpaidCount, color: "#c98a2b" },
  ];

  // ── Unified rows ──────────────────────────────────────────────────────────

  const allRows = useMemo<PaymentRow[]>(() => {
    const sessionRows: PaymentRow[] = scopedSessions
      .filter((s) => s.status !== "cancelled")
      .map((s) => ({
        id: s.id,
        clientId: s.client_id,
        stubId: null,
        clientName: clientNameById(s.client_id, null),
        date: s.scheduled_at,
        amountPence: s.price_pence ?? 0,
        isPaid: s.paid,
        source: "session",
        description: null,
        viewPath: s.client_id ? `/admin/clients/${s.client_id}` : null,
      }));

    const scopedManual =
      selectedClientId === "all"
        ? manualPayments
        : manualPayments.filter((p) => p.client_id === selectedClientId || p.stub_id === selectedClientId);

    const manualRows: PaymentRow[] = scopedManual.map((p) => ({
      id: p.id,
      clientId: p.client_id,
      stubId: p.stub_id,
      clientName: clientNameById(p.client_id, p.stub_id),
      date: p.paid_at,
      amountPence: p.amount_pence,
      isPaid: true,
      source: "manual",
      description: p.description,
      viewPath: p.client_id ? `/admin/clients/${p.client_id}` : p.stub_id ? `/admin/clients/stub/${p.stub_id}` : null,
    }));

    return [...sessionRows, ...manualRows];
  }, [scopedSessions, manualPayments, selectedClientId, clientNameById]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "paid") return allRows.filter((r) => r.isPaid);
    if (statusFilter === "unpaid") return allRows.filter((r) => !r.isPaid);
    return allRows;
  }, [allRows, statusFilter]);

  const unpaidCount = allRows.filter((r) => !r.isPaid).length;

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleMarkPaid = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    await dispatch(updateSession({ id: sessionId, paid: true })).unwrap();
    showToast("Session marked as paid.");
  };

  const handleDeleteManual = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    await supabase.from("payments").delete().eq("id", id);
    setManualPayments((prev) => prev.filter((p) => p.id !== id));
    showToast("Payment removed.");
  };

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns: SortableColumn<PaymentRow>[] = [
    {
      key: "client",
      label: "Client",
      sortable: true,
      sortValue: (r) => r.clientName,
      render: (r) => <span className={styles.clientCell}>{r.clientName}</span>,
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (r) => new Date(r.date).getTime(),
      render: (r) => <span className={styles.dateCell}>{dayjs(r.date).format("D MMM YYYY")}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      sortValue: (r) => r.amountPence,
      render: (r) => <span className={styles.amountCell}>{r.amountPence > 0 ? money(r.amountPence) : "—"}</span>,
    },
    {
      key: "description",
      label: "Description",
      mobileHide: true,
      render: (r) => (
        <span className={styles.descCell}>{r.description || (r.source === "session" ? "Session" : "—")}</span>
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
          {r.source === "manual" && (
            <Button size="sm" variant="ghost" onClick={(e) => handleDeleteManual(e, r.id)}>
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
                {allStubs.length > 0 && (
                  <optgroup label="Offline clients">
                    {allStubs.map((s) => (
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

        {/* ── Summary ── */}
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

        {/* ── Payments table ── */}
        <Card className={styles.tableCard}>
          <SortableTable<PaymentRow>
            columns={columns}
            rows={filteredRows}
            rowKey={(r) => `${r.source}-${r.id}`}
            searchable
            searchValue={(r) => `${r.clientName} ${r.description ?? ""}`}
            searchPlaceholder="Search by client or description…"
            defaultSortKey="date"
            defaultSortDir="desc"
            emptyText="No payments to show."
            toolbar={
              <div className={styles.statusFilters}>
                {(["all", "paid", "unpaid"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`${styles.filterPill} ${statusFilter === f ? styles.filterPillActive : ""}`}
                    onClick={() => setStatusFilter(f)}
                  >
                    {f === "all"
                      ? "All"
                      : f === "paid"
                        ? "Paid"
                        : `Outstanding${unpaidCount > 0 ? ` (${unpaidCount})` : ""}`}
                  </button>
                ))}
              </div>
            }
          />
        </Card>
      </div>

      {addPaymentOpen && (
        <AddPaymentModal
          clients={clients}
          stubs={allStubs}
          useCodenames={useCodenames}
          onClose={() => setAddPaymentOpen(false)}
          onSaved={(payment) => {
            setManualPayments((prev) => [payment, ...prev]);
            setAddPaymentOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default AdminPaymentsPage;
