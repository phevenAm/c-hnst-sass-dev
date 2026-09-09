import { useEffect, useRef } from "react";

import styles from "./MessageThread.module.scss";

type ThreadMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_auto?: boolean;
  kind?: "chat" | "availability";
};

type Props = {
  messages: ThreadMessage[];
  myId: string;
  loading?: boolean;
  emptyText?: string;
};

/** The scrolling list of message bubbles. Auto-scrolls to the newest. Shared by
 *  the full /messages page and the floating ChatWidget. */
export default function MessageThread({ messages, myId, loading = false, emptyText }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to newest whenever the count changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (loading && messages.length === 0) return <div className={styles.thread}>Loading…</div>;
  if (messages.length === 0) return <div className={styles.thread}>{emptyText ?? "No messages yet — say hello."}</div>;

  return (
    <div className={styles.thread}>
      {messages.map((m) => {
        const mine = m.sender_id === myId;
        const isNotice = m.kind === "availability";
        return (
          <div key={m.id} className={`${styles.row} ${mine ? styles.rowMine : ""}`}>
            <div
              className={`${styles.bubble} ${m.is_auto ? styles.bubbleAuto : ""} ${
                isNotice ? styles.bubbleNotice : ""
              }`}
            >
              {isNotice && <span className={styles.noticeTag}>Availability update</span>}
              {m.is_auto && <span className={styles.autoTag}>Automatic reply</span>}
              <p className={styles.bubbleBody}>{m.body}</p>
              <span className={styles.bubbleTime}>
                {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
