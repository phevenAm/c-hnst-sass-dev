import type { Session, SessionBlockMeta } from "@/models/globalTypes";

export type SessionRenderItem = { kind: "single"; session: Session } | { kind: "block"; sessions: Session[] };

// A block booking (paid/scheduled together) used to render as N full-height
// SessionCards stacked in the list — a paid-together, scheduled-together
// block took up N times the space of a single session for no reason a
// client could act on differently. Collapses any block still "in play"
// (not cancelled) into one group so the caller can render it as a single
// BlockSessionCard instead. A session drops out of its group the moment
// it's cancelled — the caller is expected to have already excluded past
// sessions from `sessions` (this never groups on the "past" tab, since
// grouping is specifically about live blocks a client can still act on).
export function groupSessionsForDisplay(sessions: Session[]): SessionRenderItem[] {
  const blockOf = (s: Session) => (s.metadata as SessionBlockMeta | null)?.block_id;

  const blockCounts = new Map<string, number>();
  for (const s of sessions) {
    const blockId = blockOf(s);
    if (blockId && s.status !== "cancelled") blockCounts.set(blockId, (blockCounts.get(blockId) ?? 0) + 1);
  }

  const items: SessionRenderItem[] = [];
  const renderedBlocks = new Set<string>();
  for (const s of sessions) {
    const blockId = blockOf(s);
    if (blockId && s.status !== "cancelled" && (blockCounts.get(blockId) ?? 0) > 1) {
      if (renderedBlocks.has(blockId)) continue;
      renderedBlocks.add(blockId);
      items.push({
        kind: "block",
        sessions: sessions.filter((x) => blockOf(x) === blockId && x.status !== "cancelled"),
      });
    } else {
      items.push({ kind: "single", session: s });
    }
  }
  return items;
}
