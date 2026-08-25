import { useState } from "react";

import dayjs from "dayjs";

// Reuse the exact same CSS module as BlockSessionCard so blocks look
// identical whether the client is real or offline.
import styles from "@components/shared/BlockSessionCard/BlockSessionCard.module.scss";
import type { StubSession } from "@models/globalTypes";

import StubSessionCard from "./StubSessionCard";

type Props = {
  sessions: StubSession[];
  sessionNumberMap: Map<string, number>;
  stubId: string;
  adminId: string;
  isDemo?: boolean;
  onUpdated: (updated: StubSession[]) => void;
  onDeleted: (id: string) => void;
  initialActiveId?: string;
  id?: string;
  className?: string;
};

// Offline-client equivalent of BlockSessionCard: collapses a live (not
// cancelled, not past) batch of stub sessions into one card with a tab per
// session, same UX as the real-client version. A session drops out of the
// block the moment it's cancelled or its date passes — the caller
// (AdminStubDetailPage) is responsible for only handing this "live" blocks.
export default function StubBlockSessionCard({
  sessions,
  sessionNumberMap,
  stubId,
  adminId,
  isDemo,
  onUpdated,
  onDeleted,
  initialActiveId,
  id,
  className,
}: Props) {
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

  const blockTotal =
    (sortedSessions[0]?.metadata as { block_total?: number } | null)?.block_total ?? sortedSessions.length;
  // paid and amount_paid are independent signals (see StubSessionCard) —
  // either one alone means paid.
  const allPaid = sortedSessions.every((s) => s.paid || (s.amount_paid != null && s.amount_paid > 0));

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
      <StubSessionCard
        session={activeSession}
        sessionNumber={sessionNumberMap.get(activeSession.id) ?? 1}
        stubId={stubId}
        adminId={adminId}
        isDemo={isDemo}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
      />
    </div>
  );
}
