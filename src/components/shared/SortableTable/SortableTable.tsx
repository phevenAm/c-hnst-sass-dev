import { useMemo, useState } from "react";

import styles from "./SortableTable.module.scss";

export type SortableColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  sortValue?: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
  className?: string;
  mobileHide?: boolean;
};

interface SortableTableProps<T> {
  columns: SortableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  searchable?: boolean;
  searchValue?: (row: T) => string;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  toolbar?: React.ReactNode;
}

export default function SortableTable<T>({
  columns,
  rows,
  rowKey,
  searchable,
  searchValue,
  searchPlaceholder = "Search…",
  onRowClick,
  emptyText = "No results.",
  defaultSortKey,
  defaultSortDir = "desc",
  toolbar,
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);
  const [query, setQuery] = useState("");

  const visibleRows = useMemo(() => {
    let result = [...rows];

    if (query.trim() && searchValue) {
      const q = query.toLowerCase();
      result = result.filter((r) => searchValue(r).toLowerCase().includes(q));
    }

    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortable && col.sortValue) {
        result.sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          const mul = sortDir === "asc" ? 1 : -1;
          if (typeof av === "number" && typeof bv === "number") return mul * (av - bv);
          return mul * String(av).localeCompare(String(bv));
        });
      }
    }

    return result;
  }, [rows, sortKey, sortDir, query, columns, searchValue]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIcon = (key: string) => {
    if (sortKey !== key) return <span className={styles.sortIcon}>↕</span>;
    return <span className={`${styles.sortIcon} ${styles.sortIconActive}`}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className={styles.root}>
      {(searchable || toolbar) && (
        <div className={styles.topBar}>
          {toolbar && <div className={styles.toolbarSlot}>{toolbar}</div>}
          {searchable && (
            <input
              type="search"
              className={styles.searchInput}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={searchPlaceholder}
            />
          )}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <p className={styles.empty}>{query ? "No results match your search." : emptyText}</p>
      ) : (
        <div className={styles.wrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={col.mobileHide ? styles.mobileHide : undefined}>
                    {col.sortable ? (
                      <button type="button" className={styles.sortBtn} onClick={() => toggleSort(col.key)}>
                        {col.label} {sortIcon(col.key)}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? styles.clickable : undefined}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        [col.className, col.mobileHide ? styles.mobileHide : ""].filter(Boolean).join(" ") || undefined
                      }
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
