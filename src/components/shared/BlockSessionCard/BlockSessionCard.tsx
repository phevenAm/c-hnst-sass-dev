import { useState } from "react";

import dayjs from "dayjs";

import { SessionCard } from "@components/shared/SessionCard/SessionCard";

import type { Session, SessionBlockMeta } from "@/models/globalTypes";
import { deriveBlockPaymentState } from "./blockPaymentState";

import styles from "./BlockSessionCard.module.scss";

type BlockSessionCardProps = {
  sessions: Session[];
  isAdmin?: boolean;
  isDemo?: boolean;
  clientLabel?: string;
  onNotesClick?: (sessionId: string) => void;
  /** Opens on this session's tab instead of the first one — for deep-linking
   *  to a specific session inside the block (e.g. AdminClientsPageDetailed's
   *  ?session= highlight-and-scroll). Falls back to the first session if the
   *  id isn't actually in this group. */
  initialActiveId?: string;
  /** Applied to the card's root — lets a caller give it a stable DOM id
   *  (e.g. `session-<id>`) for scroll-into-view / highlight targeting. */
  id?: string;
  className?: string;
};

// A block booking used to render as N full-height SessionCards stacked in
// the list — a paid-together, scheduled-together block took up N times the
// space of a single session for no reason a client could act on
// differently. This collapses it into one card with a number per session,
// numbered by chronological order (soonest = 1) rather than the stored
// block_pos — a cancelled sibling dropping out of the group should still
// leave the rest numbered contiguously, not with a gap — click a number to
// see that session's own detail/actions via the same SessionCard used
// everywhere else, unmodified. Only sessions still "in play" belong here:
// the caller is responsible for excluding cancelled or already-past
// sessions, which render normally in their own list instead.
export function BlockSessionCard({
  sessions,
  isAdmin,
  isDemo,
  clientLabel,
  onNotesClick,
  initialActiveId,
  id,
  className,
}: BlockSessionCardProps) {
  // Tabs are numbered by chronological position, soonest first — the caller's
  // array order isn't guaranteed to match that, so sort here rather than trust it.
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  const [activeId, setActiveId] = useState(
    (initialActiveId && sortedSessions.some((s) => s.id === initialActiveId) ? initialActiveId : undefined) ??
      sortedSessions[0]?.id,
  );
  const activeSession = sortedSessions.find((s) => s.id === activeId) ?? sortedSessions[0];

  if (!activeSession) return null;

  // block_total (the block's original size) vs sessions.length (how many
  // are still live in this card, i.e. haven't been cancelled or passed)
  // can differ once some have dropped out — that's worth surfacing so the
  // card doesn't look like it's silently missing sessions.
  const blockTotal = (sortedSessions[0]?.metadata as SessionBlockMeta | null)?.block_total ?? sortedSessions.length;

  // See blockPaymentState.ts for why this is derived rather than trusting
  // activeSession's own fields — every tab needs to show the same button
  // state, not whichever sibling's realtime update has landed first.
  const { allPaid, manualStatus } = deriveBlockPaymentState(sortedSessions);
  const displaySession: Session = { ...activeSession, paid: allPaid, manual_payment_status: manualStatus };

  return (
    <div id={id} className={[styles.blockCard, className].filter(Boolean).join(" ")}>
      <div className={styles.blockHeader}>
        <span className={styles.blockLabel}>
          {blockTotal} session block
          {sortedSessions.length < blockTotal && ` · ${sortedSessions.length} remaining`}
          {allPaid && <span className={styles.blockPaidBadge}> · Paid</span>}
        </span>
        <div className={styles.tabRow} role="tablist" aria-label="Sessions in this block">
          {sortedSessions.map((s, index) => {
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === activeSession.id}
                aria-label={dayjs(s.scheduled_at).format("dddd D MMM YYYY, h:mma")}
                title={dayjs(s.scheduled_at).format("dddd D MMM YYYY, h:mma")}
                className={[
                  styles.tab,
                  s.id === activeSession.id ? styles.tabActive : "",
                  allPaid ? styles.tabPaid : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveId(s.id)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>
      <SessionCard
        session={displaySession}
        isAdmin={isAdmin}
        isDemo={isDemo}
        clientLabel={clientLabel}
        onNotesClick={onNotesClick}
      />
    </div>
  );
}

export default BlockSessionCard;
