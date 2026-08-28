import { useRef, useState } from "react";

import styles from "./Lookup.module.scss";

type LookupProps = {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  onSave?: () => void;
  onRemove?: (opt: string) => void;
  saving?: boolean;
  saveLabel?: string;
  placeholder?: string;
};

const Lookup = ({
  value,
  onChange,
  options,
  onSave,
  onRemove,
  saving,
  saveLabel = "+ Save",
  placeholder,
}: LookupProps) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const suggestions = options.filter((opt) => opt.toLowerCase().includes(value.toLowerCase()));
  const showSave = onSave && value.trim() && !options.includes(value.trim());
  const showDropdown = open && (suggestions.length > 0 || !!showSave);

  const handleBlur = (e: React.FocusEvent) => {
    // Keep open if focus is moving to another element inside the wrapper
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
  };

  const pick = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };

  const remove = (e: React.MouseEvent, opt: string) => {
    e.stopPropagation();
    onRemove?.(opt);
  };

  const save = () => {
    onSave?.();
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={styles.wrapper} onBlur={handleBlur}>
      <input
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && (
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: combobox pattern
        <ul className={styles.dropdown} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {suggestions.map((opt) => (
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: combobox pattern — pairs with the listbox role above
            <li key={opt} className={styles.item} role="option" tabIndex={-1} aria-selected={value === opt}>
              <button type="button" className={styles.itemBtn} onClick={() => pick(opt)}>
                {opt}
              </button>
              {onRemove && (
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={(e) => remove(e, opt)}
                  aria-label={`Remove ${opt}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {showSave && (
            <li className={styles.saveItem}>
              <button type="button" className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? "Saving…" : saveLabel}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default Lookup;
