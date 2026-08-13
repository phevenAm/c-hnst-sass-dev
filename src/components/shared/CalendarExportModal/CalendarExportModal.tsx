import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

import { downloadClientSessionIcs } from "@/Helpers/calendarExport";
import type { Session } from "@/models/globalTypes";

import styles from "./CalendarExportModal.module.scss";

interface Props {
  session: Session;
  onClose: () => void;
}

const PRESETS = [
  { label: "Personal appointment", value: "Personal appointment" },
  { label: "Therapy session", value: "Therapy Session" },
];

export default function CalendarExportModal({ session, onClose }: Props) {
  const [selected, setSelected] = useState<string>(PRESETS[0].value);
  const [customText, setCustomText] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);

  const hasLocation = Boolean(session.address);

  const handlePresetChange = (value: string) => {
    setSelected(value);
    setIsCustom(false);
  };

  const handleCustomSelect = () => {
    setIsCustom(true);
    setSelected("");
  };

  const effectiveTitle = isCustom ? customText.trim() || "My appointment" : selected;

  const handleDownload = () => {
    downloadClientSessionIcs(session, { title: effectiveTitle, includeLocation });
    onClose();
  };

  return (
    <Modal
      title="Add to calendar"
      onClose={onClose}
      size="sm"
      actions={
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button variant="primary" onClick={handleDownload}>
            Download
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.hint}>Choose what the event shows in your calendar:</p>

        <div className={styles.options}>
          {PRESETS.map((p) => (
            <label key={p.value} className={styles.option}>
              <input
                type="radio"
                name="cal-title"
                checked={!isCustom && selected === p.value}
                onChange={() => handlePresetChange(p.value)}
              />
              <span>{p.label}</span>
            </label>
          ))}

          <label className={styles.option}>
            <input type="radio" name="cal-title" checked={isCustom} onChange={handleCustomSelect} />
            <span>Custom…</span>
          </label>

          {isCustom && (
            <input
              className={styles.customInput}
              type="text"
              placeholder="My appointment"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              autoFocus
              maxLength={80}
            />
          )}
        </div>

        {hasLocation && (
          <label className={styles.locationToggle}>
            <input type="checkbox" checked={includeLocation} onChange={(e) => setIncludeLocation(e.target.checked)} />
            <span>Include location</span>
          </label>
        )}
      </div>
    </Modal>
  );
}
