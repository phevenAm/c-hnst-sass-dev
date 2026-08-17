import { useMemo, useState } from "react";

import type { RootState } from "@/store";

import { Button, Card } from "@/components/shared";
import { useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchAllTodos } from "@/store/slices/TodoSlice";
import TodoList from "./TodoList";
import TodoListModal from "./TodoListModal/TodoListModal";

import styles from "./TodoListCard.module.scss";

type SortKey = "created_at" | "priority" | "deadline";

const PAGE_SIZE = 10;

const SORT_LABELS: Record<SortKey, string> = {
  created_at: "Date",
  priority: "Priority",
  deadline: "Deadline",
};

const TodoListCard = ({ embedded = false }: { embedded?: boolean }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  useFetchOnIdle(
    (state: RootState) => state.todos.status,
    () => fetchAllTodos(),
    "Failed to fetch todo items",
  );

  const allTodos = useAppSelector((state: RootState) => state.todos.todos);

  const base = useMemo(() => allTodos.filter((t) => t.completed === showCompleted), [allTodos, showCompleted]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? base.filter((t) => t.text.toLowerCase().includes(q)) : base;
  }, [base, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number | null;
      let bv: string | number | null;
      if (sortBy === "priority") {
        av = a.priority;
        bv = b.priority;
      } else if (sortBy === "deadline") {
        av = a.deadline ?? null;
        bv = b.deadline ?? null;
      } else {
        av = a.created_at;
        bv = b.created_at;
      }
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const dir = sortDir === "asc" ? 1 : -1;
      return av < bv ? -dir : dir;
    });
  }, [filtered, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const hasCompleted = allTodos.some((t) => t.completed);

  const handleSortClick = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  return (
    <>
      <Card>
        <div className={styles.cardPad}>
          <div className={styles.cardHeader} style={embedded ? { justifyContent: "flex-end" } : undefined}>
            {!embedded && <h2>Todo list</h2>}
            <div className={styles.todoButtons}>
              {hasCompleted && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCompleted((v) => !v);
                    setPage(0);
                    setSearch("");
                  }}
                >
                  {showCompleted ? "Outstanding" : "Completed"}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
                + Todo
              </Button>
            </div>
          </div>

          <div className={styles.controls}>
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search todos…"
              value={search}
              aria-label="Search todos"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            <div className={styles.sortRow}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.sortBtn} ${sortBy === key ? styles.sortBtnActive : ""}`}
                  onClick={() => handleSortClick(key)}
                >
                  {SORT_LABELS[key]}
                  {sortBy === key && <span>{sortDir === "asc" ? " ↑" : " ↓"}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.actionList}>
            <TodoList todos={paginated} />
            {filtered.length === 0 && search && <p className={styles.noResults}>No todos match your search.</p>}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
              >
                ‹ Prev
              </button>
              <span className={styles.pageInfo}>
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      </Card>

      {modalOpen && <TodoListModal onClose={() => setModalOpen(false)} />}
    </>
  );
};

export default TodoListCard;
