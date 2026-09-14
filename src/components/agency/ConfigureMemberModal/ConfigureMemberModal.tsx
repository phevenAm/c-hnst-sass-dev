import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import type { AgencyMemberWithUser } from "@models/agency";
import styles from "@pages/agency/agency.module.scss";
import { useAppDispatch } from "@store/hooks";
import { setAgencyMember } from "@store/slices/agencySlice";

const DEFAULT_MEMBER_COLOR = "#2d7264";

// Fixed swatches, not a free picker — every tone here is dark enough that
// the white event-chip text on the sessions calendar clears WCAG AA 4.5:1
// contrast (same bar CLIENT_PALETTE in SchedulerCalendar/schedulerUtils.ts
// is held to). A free colour input would let someone pick something the
// text fails against.
const STAFF_PALETTE = [
  "#2d7264", // teal (brand default)
  "#3a5568", // slate blue
  "#8f3f3f", // brick red
  "#3f5a3a", // forest
  "#4c4478", // indigo
  "#6f4a24", // brown
  "#4d5730", // moss
  "#6b3f54", // plum
];

const name = (m: AgencyMemberWithUser) =>
  m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "this member";

export default function ConfigureMemberModal({
  member,
  onClose,
}: {
  member: AgencyMemberWithUser;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const [role, setRole] = useState(member.role);
  const [counsellingEnabled, setCounsellingEnabled] = useState(member.counselling_enabled);
  const [status, setStatus] = useState(member.status);
  const [color, setColor] = useState(member.color || DEFAULT_MEMBER_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await dispatch(
        setAgencyMember({
          member_user_id: member.user_id,
          role,
          counselling_enabled: counsellingEnabled,
          status,
          color,
        }),
      ).unwrap();
      showToast(`${name(member)}'s settings saved.`, "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save these settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Configure ${name(member)}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="cfg-role">
          Role
        </label>
        <select
          id="cfg-role"
          className={styles.select}
          value={role}
          onChange={(e) => setRole(e.target.value as "manager" | "counsellor")}
        >
          <option value="counsellor">Counsellor</option>
          <option value="manager">Manager</option>
        </select>
      </div>

      <label className={styles.toggleRow}>
        <div className={styles.toggleText}>
          <strong>Counselling enabled</strong>
          <span>Off = manage-only, no clients assigned to them.</span>
        </div>
        <input type="checkbox" checked={counsellingEnabled} onChange={(e) => setCounsellingEnabled(e.target.checked)} />
      </label>

      <label className={styles.toggleRow}>
        <div className={styles.toggleText}>
          <strong>Active</strong>
          <span>Off disables their sign-in entirely.</span>
        </div>
        <input
          type="checkbox"
          checked={status === "active"}
          onChange={(e) => setStatus(e.target.checked ? "active" : "disabled")}
        />
      </label>

      <div className={styles.field}>
        <span className={styles.label}>Calendar colour</span>
        <p className={styles.cardBlurb} style={{ marginTop: 0 }}>
          Used for this member's sessions on the agency sessions calendar.
        </p>
        <div role="radiogroup" aria-label="Calendar colour" style={{ display: "flex", gap: "var(--sp-2)" }}>
          {STAFF_PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={color === swatch}
              aria-label={swatch}
              onClick={() => setColor(swatch)}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: swatch,
                cursor: "pointer",
                border: color === swatch ? "2.5px solid var(--text-primary)" : "2.5px solid transparent",
                outlineOffset: 2,
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
