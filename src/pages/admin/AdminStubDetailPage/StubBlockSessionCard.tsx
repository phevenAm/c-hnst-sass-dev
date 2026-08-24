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
  onUpdated: (updated: StubSession) => void;
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
  const [activeId, setActiveId] = useState(
    (initialActiveId && sessions.some((s) => s.id === initialActiveId) ? initialActiveId : undefined) ??
      sessions[0]?.id,
  );
  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[0];

  if (!activeSession) return null;

  const blockTotal = (sessions[0]?.metadata as { block_total?: number } | null)?.block_total ?? sessions.length;
  const allPaid = sessions.every((s) => s.paid);

  return (
    <div id={id} className={[styles.blockCard, className].filter(Boolean).join(" ")}>
      <div className={styles.blockHeader}>
        <span className={styles.blockLabel}>
          {blockTotal} session block
          {sessions.length < blockTotal && ` · ${sessions.length} remaining`}
          {allPaid && <span className={styles.blockPaidBadge}> · Paid</span>}
        </span>
        <div className={styles.tabRow} role="tablist" aria-label="Sessions in this block">
          {sessions.map((s) => {
            const meta = s.metadata as { block_pos?: number } | null;
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
                {meta?.block_pos ?? sessions.indexOf(s) + 1}
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
