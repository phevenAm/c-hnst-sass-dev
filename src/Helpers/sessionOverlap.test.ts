import { describe, expect, it } from "vitest";

import { findSlotConflict, hasSlotConflict } from "./sessionOverlap";

// Anchor everything to one hour so the maths is easy to read.
const AT = (hhmm: string) => `2026-09-01T${hhmm}:00.000Z`;

const session = (id: string, start: string, opts: Partial<{ duration: number | null; status: string }> = {}) => ({
  id,
  scheduled_at: AT(start),
  duration_minutes: opts.duration === undefined ? 50 : opts.duration,
  status: opts.status ?? "scheduled",
});

describe("findSlotConflict — real sessions", () => {
  it("flags a real session that overlaps the proposed slot", () => {
    const conflict = findSlotConflict({
      start: AT("10:30"),
      durationMinutes: 50,
      sessions: [session("s1", "10:00")],
    });
    expect(conflict).toEqual({ kind: "real", id: "s1" });
  });

  it("ignores cancelled real sessions", () => {
    expect(
      hasSlotConflict({
        start: AT("10:00"),
        durationMinutes: 50,
        sessions: [session("s1", "10:00", { status: "cancelled" })],
      }),
    ).toBe(false);
  });

  it("treats back-to-back sessions as free (half-open)", () => {
    expect(
      hasSlotConflict({
        start: AT("10:50"),
        durationMinutes: 50,
        sessions: [session("s1", "10:00", { duration: 50 })],
      }),
    ).toBe(false);
  });

  it("skips the real session being rescheduled", () => {
    expect(
      hasSlotConflict({
        start: AT("10:00"),
        durationMinutes: 50,
        sessions: [session("s1", "10:00")],
        excludeSessionId: "s1",
      }),
    ).toBe(false);
  });

  it("treats a null duration as 50 minutes on both sides", () => {
    // existing 10:00 (null → 50 → ends 10:50); proposed 10:40 → overlaps
    expect(
      hasSlotConflict({
        start: AT("10:40"),
        durationMinutes: 0,
        sessions: [session("s1", "10:00", { duration: null })],
      }),
    ).toBe(true);
  });
});

describe("findSlotConflict — offline-client (stub) sessions", () => {
  it("flags a scheduled stub session overlapping a real booking (the reported bug)", () => {
    const conflict = findSlotConflict({
      start: AT("14:00"),
      durationMinutes: 50,
      stubSessions: [session("stub1", "14:15", { status: "scheduled" })],
    });
    expect(conflict).toEqual({ kind: "stub", id: "stub1" });
  });

  it("catches stub-vs-stub overlaps", () => {
    expect(
      hasSlotConflict({
        start: AT("09:00"),
        durationMinutes: 60,
        stubSessions: [session("stub1", "09:30", { status: "scheduled" })],
      }),
    ).toBe(true);
  });

  it("ignores back-dated attended / no_show stub logs", () => {
    expect(
      hasSlotConflict({
        start: AT("10:00"),
        durationMinutes: 50,
        stubSessions: [
          session("stub1", "10:00", { status: "attended" }),
          session("stub2", "10:00", { status: "no_show" }),
          session("stub3", "10:00", { status: "cancelled" }),
        ],
      }),
    ).toBe(false);
  });

  it("skips the stub session being rescheduled", () => {
    expect(
      hasSlotConflict({
        start: AT("10:00"),
        durationMinutes: 50,
        stubSessions: [session("stub1", "10:00", { status: "scheduled" })],
        excludeStubSessionId: "stub1",
      }),
    ).toBe(false);
  });
});

describe("findSlotConflict — mixed / edge", () => {
  it("returns the real session first when both a real and stub session clash", () => {
    const conflict = findSlotConflict({
      start: AT("10:00"),
      durationMinutes: 50,
      sessions: [session("s1", "10:00")],
      stubSessions: [session("stub1", "10:00", { status: "scheduled" })],
    });
    expect(conflict).toEqual({ kind: "real", id: "s1" });
  });

  it("returns null when nothing is provided", () => {
    expect(findSlotConflict({ start: AT("10:00"), durationMinutes: 50 })).toBeNull();
  });

  it("returns null for an unparseable start", () => {
    expect(
      findSlotConflict({ start: "not-a-date", durationMinutes: 50, sessions: [session("s1", "10:00")] }),
    ).toBeNull();
  });
});
