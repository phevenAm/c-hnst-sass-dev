import { describe, expect, it } from "vitest";

import type { Session } from "@/models/globalTypes";
import { groupSessionsForDisplay } from "./sessionGrouping";

const makeSession = (overrides: Partial<Session> & { id: string; scheduled_at: string }): Session => ({
  address: null,
  attended: null,
  client_id: "client-1",
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: "admin-1",
  duration_minutes: 50,
  google_event_id: null,
  imported_from_stub_id: null,
  is_supervision: false,
  location: null,
  manual_payment_status: "none",
  metadata: null,
  notes: null,
  paid: false,
  paid_at: null,
  price_pence: 5000,
  reference_code: null,
  send_reminders: true,
  status: "scheduled",
  stripe_payment_intent_id: null,
  supervision_cost_pence: null,
  ...overrides,
});

const blockMeta = (blockId: string, pos: number, total: number) => ({
  block_id: blockId,
  block_pos: pos,
  block_total: total,
  block_start: "2026-06-01T09:00:00.000Z",
});

describe("groupSessionsForDisplay", () => {
  it("groups sessions sharing a block_id into one block item", () => {
    const sessions = [
      makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", metadata: blockMeta("blk1", 1, 3) }),
      makeSession({ id: "b", scheduled_at: "2026-06-02T09:00:00.000Z", metadata: blockMeta("blk1", 2, 3) }),
      makeSession({ id: "c", scheduled_at: "2026-06-03T09:00:00.000Z", metadata: blockMeta("blk1", 3, 3) }),
    ];

    const result = groupSessionsForDisplay(sessions);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("block");
    expect(result[0].kind === "block" && result[0].sessions.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves a single-session 'block' (only one sibling left) as a standalone item", () => {
    const sessions = [
      makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", metadata: blockMeta("blk1", 1, 1) }),
    ];

    const result = groupSessionsForDisplay(sessions);

    expect(result).toEqual([{ kind: "single", session: sessions[0] }]);
  });

  it("keeps a session's normal rendering position but only emits the block group once", () => {
    const sessions = [
      makeSession({ id: "standalone-early", scheduled_at: "2026-06-01T00:00:00.000Z" }),
      makeSession({ id: "a", scheduled_at: "2026-06-02T09:00:00.000Z", metadata: blockMeta("blk1", 1, 2) }),
      makeSession({ id: "b", scheduled_at: "2026-06-03T09:00:00.000Z", metadata: blockMeta("blk1", 2, 2) }),
      makeSession({ id: "standalone-late", scheduled_at: "2026-06-04T00:00:00.000Z" }),
    ];

    const result = groupSessionsForDisplay(sessions);

    expect(result.map((r) => r.kind)).toEqual(["single", "block", "single"]);
  });

  it("excludes a cancelled sibling from the block group and renders it standalone", () => {
    const sessions = [
      makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", metadata: blockMeta("blk1", 1, 3) }),
      makeSession({
        id: "b",
        scheduled_at: "2026-06-02T09:00:00.000Z",
        status: "cancelled",
        metadata: blockMeta("blk1", 2, 3),
      }),
      makeSession({ id: "c", scheduled_at: "2026-06-03T09:00:00.000Z", metadata: blockMeta("blk1", 3, 3) }),
    ];

    const result = groupSessionsForDisplay(sessions);

    // "a" and "c" are still a 2-session block; "b" (cancelled) stands alone.
    expect(result).toHaveLength(2);
    const block = result.find((r) => r.kind === "block");
    expect(block?.kind === "block" && block.sessions.map((s) => s.id)).toEqual(["a", "c"]);
    const single = result.find((r) => r.kind === "single" && r.session.id === "b");
    expect(single).toBeTruthy();
  });

  it("does not group sessions from different blocks together", () => {
    const sessions = [
      makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", metadata: blockMeta("blk1", 1, 2) }),
      makeSession({ id: "b", scheduled_at: "2026-06-02T09:00:00.000Z", metadata: blockMeta("blk1", 2, 2) }),
      makeSession({ id: "c", scheduled_at: "2026-06-03T09:00:00.000Z", metadata: blockMeta("blk2", 1, 2) }),
      makeSession({ id: "d", scheduled_at: "2026-06-04T09:00:00.000Z", metadata: blockMeta("blk2", 2, 2) }),
    ];

    const result = groupSessionsForDisplay(sessions);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.kind === "block")).toBe(true);
  });

  // Offline (stub) clients got block grouping 2026-08-24, reusing this same
  // function against StubSession instead of Session — confirm the generic
  // works for a differently-shaped type, not just Session.
  describe("with a StubSession-shaped type", () => {
    type FakeStubSession = { id: string; status: string; metadata: Record<string, unknown> | null };

    const makeStub = (overrides: Partial<FakeStubSession> & { id: string }): FakeStubSession => ({
      status: "scheduled",
      metadata: null,
      ...overrides,
    });

    it("groups a stub block same as a real-session block (happy path)", () => {
      const stubs = [
        makeStub({ id: "s1", metadata: blockMeta("stub-blk", 1, 2) }),
        makeStub({ id: "s2", metadata: blockMeta("stub-blk", 2, 2) }),
      ];

      const result = groupSessionsForDisplay(stubs);

      expect(result).toEqual([{ kind: "block", sessions: stubs }]);
    });

    it("a cancelled stub session never belongs in a block (sad path)", () => {
      const stubs = [
        makeStub({ id: "s1", status: "cancelled", metadata: blockMeta("stub-blk", 1, 2) }),
        makeStub({ id: "s2", metadata: blockMeta("stub-blk", 2, 2) }),
      ];

      const result = groupSessionsForDisplay(stubs);

      // Only one live sibling left — falls back to single, same rule as Session.
      expect(result).toEqual([
        { kind: "single", session: stubs[0] },
        { kind: "single", session: stubs[1] },
      ]);
    });

    it("a stub with no metadata renders standalone (sad path)", () => {
      const stubs = [makeStub({ id: "s1" })];

      const result = groupSessionsForDisplay(stubs);

      expect(result).toEqual([{ kind: "single", session: stubs[0] }]);
    });
  });
});
