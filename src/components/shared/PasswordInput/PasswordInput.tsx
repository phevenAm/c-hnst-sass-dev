import React, { useState } from "react";

import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

import styles from "./PasswordInput.module.scss";

// Drop-in replacement for `<input type="password" />`. Spreads every native
// input prop straight through, so callers keep passing their own `className`
// (e.g. the page's `styles.input`), `id`, `value`, `onChange`, `autoComplete`,
// `required`, `placeholder`. Adds a show/hide toggle with the MUI eye icon.
type PasswordInputProps = Omit<React.ComponentPropsWithoutRef<"input">, "type">;

export default function PasswordInput({ className, style, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className={styles.wrap}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={className}
        // Inline so it always wins over the caller's stylesheet padding and
        // leaves room for the toggle regardless of which page's `.input` is used.
        style={{ ...style, paddingRight: "2.75rem" }}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
      </button>
    </span>
  );
}
