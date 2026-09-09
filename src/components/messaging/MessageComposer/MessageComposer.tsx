import { type KeyboardEvent, useState } from "react";

import Button from "@components/shared/Button/Button";

import styles from "./MessageComposer.module.scss";

type Props = {
  onSend: (body: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

/** Textarea + Send. Enter sends, Shift+Enter is a newline. Shared by the
 *  /messages page and the ChatWidget. */
export default function MessageComposer({ onSend, placeholder = "Write a message…", disabled = false }: Props) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  const submit = () => {
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.composer}>
      <textarea
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        maxLength={4000}
        disabled={disabled}
        aria-label="Message"
      />
      <Button size="sm" onClick={submit} disabled={!trimmed || disabled}>
        Send
      </Button>
    </div>
  );
}
