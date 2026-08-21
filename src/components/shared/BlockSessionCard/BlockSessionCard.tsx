import { useState } from "react";

import dayjs from "dayjs";

import { SessionCard } from "@components/shared/SessionCard/SessionCard";

import type { Session, SessionBlockMeta } from "@/models/globalTypes";

import styles from "./BlockSessionCard.module.scss";

type BlockSessionCardProps = {
  sessions: Session[];
  isAdmin?: boolean;
  isDemo?: boolean;
  clientLabel?: string;
  onNotesClick?: (sessionId: string) => void;
};

// A block booking used to render as N full-height SessionCards stacked in
// the list — a paid-together, scheduled-together block took up N times the
// space of a single session for no reason a client could act on
// differently. This collapses it into one card with a number per session
// (its stable block_pos, not array index, so a cancelled sibling elsewhere
// in the block doesn't renumber the rest) — click a number to see that
// session's own detail/actions via the same SessionCard used everywhere
// else, unmodified. Only sessions still "in play" belong here: the caller
// is responsible for excluding cancelled or already-past sessions, which
// render normally in their own list instead.
export function BlockSessionCard({ sessions, isAdmin, isDemo, clientLabel, onNotesClick }: BlockSessionCardProps) {
  const [activeId, setActiveId] = useState(sessions[0]?.id);
  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[0];

  if (!activeSession) return null;

  const paidCount = sessions.filter((s) => s.paid).length;
  const allPaid = paidCount === sessions.length;

  return (
    <div className={styles.blockCard}>
      <div className={styles.blockHeader}>
        <span className={styles.blockLabel}>
          Block booking · {sessions.length} sessions
          {!allPaid && (
            <span className={styles.blockPaidCount}>
              {" "}
              · {paidCount}/{sessions.length} paid
            </span>
          )}
        </span>
        <div className={styles.tabRow} role="tablist" aria-label="Sessions in this block">
          {sessions.map((s) => {
            const meta = s.metadata as SessionBlockMeta | null;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === activeSession.id}
                aria-label={dayjs(s.scheduled_at).format("dddd D MMM YYYY, h:mma")}
                title={dayjs(s.scheduled_at).format("dddd D MMM YYYY, h:mma")}
                className={[styles.tab, s.id === activeSession.id ? styles.tabActive : "", s.paid ? styles.tabPaid : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveId(s.id)}
              >
                {meta?.block_pos ?? sessions.indexOf(s) + 1}
              </button>
            );
          })}
        </div>
      </div>
      <SessionCard
        session={activeSession}
        isAdmin={isAdmin}
        isDemo={isDemo}
        clientLabel={clientLabel}
        onNotesClick={onNotesClick}
      />
    </div>
  );
}

export default BlockSessionCard;
