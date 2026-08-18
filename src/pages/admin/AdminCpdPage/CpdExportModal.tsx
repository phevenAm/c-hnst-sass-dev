import { useState } from "react";

import dayjs, { type Dayjs } from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import Modal from "@components/shared/Modal/Modal";

import type { CpdActivityType, CpdLog } from "./AdminCpdPage";

import styles from "./CpdExportModal.module.scss";

type CategoryOption = {
  key: string;
  label: string;
  matches: (log: CpdLog) => boolean;
};

const STANDARD_TYPES: { value: CpdActivityType; label: string }[] = [
  { value: "supervision", label: "Supervision" },
  { value: "training", label: "Training" },
  { value: "reading", label: "Reading" },
  { value: "conference", label: "Conference" },
  { value: "peer_consultation", label: "Peer Consultation" },
  { value: "personal_therapy", label: "Personal Therapy" },
];

type Props = {
  logs: CpdLog[];
  onClose: () => void;
  onExportCsv: (logs: CpdLog[]) => void;
  onExportPdf: (logs: CpdLog[]) => void;
};

export default function CpdExportModal({ logs, onClose, onExportCsv, onExportPdf }: Props) {
  const customCategories = Array.from(
    new Set(logs.filter((l) => l.activity_type === "other" && l.custom_category).map((l) => l.custom_category!)),
  );
  const hasGenericOther = logs.some((l) => l.activity_type === "other" && !l.custom_category);

  const categoryOptions: CategoryOption[] = [
    ...STANDARD_TYPES.filter((t) => logs.some((l) => l.activity_type === t.value)).map((t) => ({
      key: t.value,
      label: t.label,
      matches: (l: CpdLog) => l.activity_type === t.value,
    })),
    ...(hasGenericOther
      ? [{ key: "other", label: "Other", matches: (l: CpdLog) => l.activity_type === "other" && !l.custom_category }]
      : []),
    ...customCategories.map((cat) => ({
      key: `custom:${cat}`,
      label: cat,
      matches: (l: CpdLog) => l.activity_type === "other" && l.custom_category === cat,
    })),
  ];

  const [selected, setSelected] = useState<Set<string>>(() => new Set(categoryOptions.map((c) => c.key)));
  const [from, setFrom] = useState<Dayjs | null>(null);
  const [to, setTo] = useState<Dayjs | null>(null);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allSelected = selected.size === categoryOptions.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(categoryOptions.map((c) => c.key)));

  const filteredLogs = () => {
    const activeCategories = categoryOptions.filter((c) => selected.has(c.key));
    return logs.filter((log) => {
      if (!activeCategories.some((c) => c.matches(log))) return false;
      if (from && dayjs(log.date).isBefore(from, "day")) return false;
      if (to && dayjs(log.date).isAfter(to, "day")) return false;
      return true;
    });
  };

  const noneSelected = selected.size === 0;

  return (
    <Modal
      title="Export CPD log"
      onClose={onClose}
      size="sm"
      actions={
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={noneSelected} onClick={() => onExportCsv(filteredLogs())}>
            Export CSV
          </Button>
          <Button variant="primary" disabled={noneSelected} onClick={() => onExportPdf(filteredLogs())}>
            Export PDF
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Categories</span>
            <button type="button" className={styles.selectAllBtn} onClick={toggleAll}>
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div className={styles.categoryGrid}>
            {categoryOptions.map((c) => (
              <label key={c.key} className={styles.categoryOption}>
                <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Date range</span>
          <div className={styles.dateRow}>
            <DateInput mode="date" label="From" value={from} onChange={setFrom} />
            <DateInput mode="date" label="To" value={to} onChange={setTo} />
          </div>
        </div>

        <p className={styles.count}>
          {noneSelected
            ? "Select at least one category."
            : `${filteredLogs().length} entr${filteredLogs().length === 1 ? "y" : "ies"} will be exported.`}
        </p>
      </div>
    </Modal>
  );
}
