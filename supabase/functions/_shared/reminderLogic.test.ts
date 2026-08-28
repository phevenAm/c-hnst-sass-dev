import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOURS_BEFORE,
  isWithinReminderWindow,
  REMINDER_TYPE,
  selectSessionsToRemind,
  WINDOW_HALF_HOURS,
} from "./reminderLogic";

const NOW = Date.parse("2026-03-10T08:00:00.000Z");
const hoursFromNow = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

describe("isWithinReminderWindow", () => {
  it("is true for a session exactly hoursBefore away", () => {
    expect(isWithinReminderWindow(hoursFromNow(120), NOW, 120)).toBe(true);
  });

  it("is true at the edges of the +/- window", () => {
    expect(isWithinReminderWindow(hoursFromNow(120 - WINDOW_HALF_HOURS), NOW, 120)).toBe(true);
    expect(isWithinReminderWindow(hoursFromNow(120 + WINDOW_HALF_HOURS), NOW, 120)).toBe(true);
  });

  it("is false just outside the window", () => {
    expect(isWithinReminderWindow(hoursFromNow(120 + WINDOW_HALF_HOURS + 0.5), NOW, 120)).toBe(false);
    expect(isWithinReminderWindow(hoursFromNow(48), NOW, 120)).toBe(false);
  });

  it("is false for an unparseable date", () => {
    expect(isWithinReminderWindow("not-a-date", NOW, 120)).toBe(false);
  });

  it("respects a caller-supplied window width", () => {
    expect(isWithinReminderWindow(hoursFromNow(96), NOW, 120, 24)).toBe(true);
    expect(isWithinReminderWindow(hoursFromNow(96), NOW, 120, 12)).toBe(false);
  });
});

describe("selectSessionsToRemind", () => {
  const session = (id: string, hoursAway: number, clientId = "c1") => ({
    id,
    scheduled_at: hoursFromNow(hoursAway),
    client_id: clientId,
  });

  const baseArgs = {
    now: NOW,
    adminIdForClient: (clientId: string) => (clientId === "c1" ? "admin-1" : undefined),
    configForAdmin: (_adminId: string) => undefined,
  };

  it("keeps sessions in the default window and drops those outside it", () => {
    const inWindow = session("s1", DEFAULT_HOURS_BEFORE);
    const tooSoon = session("s2", 24);
    const tooFar = session("s3", 240);

    const picked = selectSessionsToRemind({ ...baseArgs, sessions: [inWindow, tooSoon, tooFar] });

    expect(picked.map((s) => s.id)).toEqual(["s1"]);
  });

  it("honours a practice's custom reminder_hours_before", () => {
    const args = {
      ...baseArgs,
      configForAdmin: () => ({ hoursBefore: 24 }),
      sessions: [session("s1", 24), session("s2", DEFAULT_HOURS_BEFORE)],
    };

    expect(selectSessionsToRemind(args).map((s) => s.id)).toEqual(["s1"]);
  });

  it("skips a session whose practice has reminders disabled", () => {
    const args = {
      ...baseArgs,
      configForAdmin: () => ({ disabledTypes: [REMINDER_TYPE] }),
      sessions: [session("s1", DEFAULT_HOURS_BEFORE)],
    };

    expect(selectSessionsToRemind(args)).toEqual([]);
  });

  it("does not re-remind a session already sent a reminder (dedupe)", () => {
    const sessions = [session("s1", DEFAULT_HOURS_BEFORE), session("s2", DEFAULT_HOURS_BEFORE)];

    const picked = selectSessionsToRemind({
      ...baseArgs,
      sessions,
      alreadyRemindedSessionIds: ["s1"],
    });

    expect(picked.map((s) => s.id)).toEqual(["s2"]);
  });

  it("skips sessions excluded for this run (e.g. just auto-cancelled)", () => {
    const sessions = [session("s1", DEFAULT_HOURS_BEFORE), session("s2", DEFAULT_HOURS_BEFORE)];

    const picked = selectSessionsToRemind({
      ...baseArgs,
      sessions,
      excludeSessionIds: ["s2"],
    });

    expect(picked.map((s) => s.id)).toEqual(["s1"]);
  });

  it("drops sessions whose client maps to no practice", () => {
    const orphan = session("s1", DEFAULT_HOURS_BEFORE, "unknown-client");

    expect(selectSessionsToRemind({ ...baseArgs, sessions: [orphan] })).toEqual([]);
  });

  it("never returns the same session id twice", () => {
    const dup = session("s1", DEFAULT_HOURS_BEFORE);

    const picked = selectSessionsToRemind({ ...baseArgs, sessions: [dup, { ...dup }] });

    expect(picked).toHaveLength(1);
  });

  it("routes each session by its own practice's config", () => {
    const args = {
      now: NOW,
      adminIdForClient: (clientId: string) => (clientId === "c1" ? "admin-1" : "admin-2"),
      configForAdmin: (adminId: string) => (adminId === "admin-1" ? { hoursBefore: 24 } : { hoursBefore: 168 }),
      sessions: [session("s1", 24, "c1"), session("s2", 168, "c2"), session("s3", 24, "c2")],
    };

    expect(selectSessionsToRemind(args).map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});
