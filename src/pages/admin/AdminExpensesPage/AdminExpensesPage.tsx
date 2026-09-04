import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Card from "@components/shared/Card/Card";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import StatTile from "@components/shared/StatTile/StatTile";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import ExpenseModal from "./ExpenseModal";

import styles from "./AdminExpensesPage.module.scss";

export type Expense = {
  id: string;
  admin_id: string;
  incurred_on: string;
  category: string;
  amount_pence: number;
  description: string | null;
  receipt_url: string | null;
  created_at: string;
};

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

type Props = {
  /** Rendered inside the Finances page rather than as its own route. */
  embedded?: boolean;
  /** Open the "add expense" modal on mount (Finances overview action button). */
  openNew?: boolean;
};

export default function AdminExpensesPage({ embedded = false, openNew = false }: Props) {
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const currentYear = new Date().getFullYear();

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setEditing(null);
      setModalOpen(true);
      setSearchParams(
        (p) => {
          p.delete("new");
          return p;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (openNew) {
      setEditing(null);
      setModalOpen(true);
    }
  }, [openNew]);

  const fetchExpenses = useCallback(async () => {
    if (!userProfile?.id) return;
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("admin_id", userProfile.id)
      .order("incurred_on", { ascending: false });
    if (error) showToast("Failed to load expenses", "error");
    else setExpenses((data as Expense[]) ?? []);
    setLoading(false);
  }, [userProfile?.id, showToast]);

  useEffect(() => {
    void fetchExpenses();
  }, [fetchExpenses]);

  const handleDelete = async (expense: Expense) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) showToast("Failed to delete expense", "error");
    else {
      showToast("Expense deleted.");
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    }
  };

  const categories = Array.from(new Set(expenses.map((e) => e.category))).sort();
  const visible = filter === "all" ? expenses : expenses.filter((e) => e.category === filter);

  const thisYear = expenses.filter((e) => new Date(e.incurred_on).getFullYear() === currentYear);
  const thisYearTotal = thisYear.reduce((sum, e) => sum + e.amount_pence, 0);

  const exportCsv = async () => {
    const { downloadBrandedCsv } = await import("../../../Helpers/csvExport");
    downloadBrandedCsv({
      filename: `expenses-${currentYear}`,
      title: "Expenses export",
      meta: [
        ["Practice", userProfile?.display_name ?? "Practice"],
        ["Year", currentYear],
        ["Total shown", money(visible.reduce((s, e) => s + e.amount_pence, 0))],
      ],
      headers: ["Date", "Category", "Description", "Amount", "Receipt"],
      rows: visible.map((e) => [
        e.incurred_on,
        e.category,
        e.description ?? "",
        (e.amount_pence / 100).toFixed(2),
        e.receipt_url ?? "",
      ]),
    });
  };

  const exportPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const { addCoverPage, runningHeader, stampChrome, tableBlock } = await import("../../../Helpers/pdfBranding");
    const doc = new jsPDF();
    const name = userProfile?.display_name ?? "Practice";

    addCoverPage(doc, { title: "Expenses", subtitle: `${name} · ${currentYear}` });
    doc.addPage();

    const y = runningHeader(doc, `Expenses · ${currentYear}`);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total shown: ${money(visible.reduce((s, e) => s + e.amount_pence, 0))}`, 14, y + 8);

    autoTable(doc, {
      startY: y + 16,
      head: [["Date", "Category", "Description", "Amount"]],
      body: visible.map((e) => [e.incurred_on, e.category, e.description ?? "", money(e.amount_pence)]),
      styles: { fontSize: 8, cellPadding: 2 },
      ...tableBlock(),
    });

    stampChrome(doc, { title: `Expenses · ${currentYear}`, footer: `Expenses ${currentYear}` });
    doc.save(`expenses-${currentYear}.pdf`);
  };

  if (loading) return null;

  return (
    <div className={embedded ? styles.contents : "page"}>
      <div className={embedded ? styles.contents : `inner ${styles.page}`}>
        <div className={styles.header}>
          {!embedded && (
            <div>
              <h1 className={styles.title}>Expenses</h1>
              <p className={styles.sub}>Track practice outgoings and keep receipts in one place</p>
            </div>
          )}
          <SplitButton
            variant="primary"
            primaryLabel="Add expense"
            primaryAction={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            options={[
              { label: "Export CSV", onClick: () => void exportCsv() },
              { label: "Export PDF", onClick: () => void exportPdf() },
            ]}
          />
        </div>

        <div className={styles.tiles}>
          <StatTile label={`${currentYear} total`} value={money(thisYearTotal)} />
          <StatTile label="Entries this year" value={thisYear.length} />
        </div>

        {categories.length > 0 && (
          <div className={styles.filters}>
            {["all", ...categories].map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.filterBtn} ${filter === c ? styles.filterBtnActive : ""}`}
                onClick={() => setFilter(c)}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <p className={styles.empty}>No expenses yet. Add your first one to get started.</p>
        ) : (
          <Card className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id}>
                    <td className={styles.dateCell}>{e.incurred_on}</td>
                    <td>
                      <span className={styles.badge}>{e.category}</span>
                    </td>
                    <td className={styles.textCell}>{e.description}</td>
                    <td className={styles.amountCell}>{money(e.amount_pence)}</td>
                    <td>
                      {e.receipt_url ? (
                        <a href={e.receipt_url} target="_blank" rel="noreferrer" className={styles.link}>
                          View
                        </a>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => {
                            setEditing(e);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(e)}>
                          Delete
                        </button>
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
        <ExpenseModal
          initial={editing}
          adminId={userProfile?.id ?? ""}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void fetchExpenses();
          }}
        />
      )}
    </div>
  );
}
