import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOURS_BEFORE,
  isWithinReminderWindow,
  REMINDER_TYPE,
  reminderNotification,
  selectSessionsToRemind,
  shouldAutoCancelUnpaidSession,
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

describe("shouldAutoCancelUnpaidSession", () => {
  // Only cancels an unpaid session once it has ENDED, and only when the
  // practice has opted in. A session that hasn't started, or is still running,
  // or belongs to a practice that never enabled the toggle, is left alone.
  const base = { now: NOW, paid: false };
  const endedLongAgo = hoursFromNow(-4); // started 4h ago, 50m default → long over

  it("does not cancel when the practice has not enabled auto-cancel", () => {
    expect(
      shouldAutoCancelUnpaidSession({ ...base, scheduledAt: endedLongAgo, config: { autoCancelEnabled: false } }),
    ).toBe(false);
  });

  it("does not cancel when there is no config for the practice", () => {
    expect(shouldAutoCancelUnpaidSession({ ...base, scheduledAt: endedLongAgo, config: undefined })).toBe(false);
  });

  it("cancels an unpaid session that has ended, once opted in", () => {
    expect(
      shouldAutoCancelUnpaidSession({ ...base, scheduledAt: endedLongAgo, config: { autoCancelEnabled: true } }),
    ).toBe(true);
  });

  it("does not cancel a session that has not started yet", () => {
    expect(
      shouldAutoCancelUnpaidSession({ ...base, scheduledAt: hoursFromNow(2), config: { autoCancelEnabled: true } }),
    ).toBe(false);
  });

  it("does not cancel a session that has started but not finished", () => {
    // Started 20 min ago, default 50 min duration → still running.
    expect(
      shouldAutoCancelUnpaidSession({
        ...base,
        scheduledAt: new Date(NOW - 20 * 60_000).toISOString(),
        config: { autoCancelEnabled: true },
      }),
    ).toBe(false);
  });

  it("uses the session's own duration to decide whether it has ended", () => {
    const startedAt = new Date(NOW - 40 * 60_000).toISOString(); // 40 min ago
    expect(
      shouldAutoCancelUnpaidSession({
        ...base,
        scheduledAt: startedAt,
        durationMinutes: 30,
        config: { autoCancelEnabled: true },
      }),
    ).toBe(true); // 30-min session ended 10 min ago
    expect(
      shouldAutoCancelUnpaidSession({
        ...base,
        scheduledAt: startedAt,
        durationMinutes: 60,
        config: { autoCancelEnabled: true },
      }),
    ).toBe(false); // 60-min session still running
  });

  it("never cancels a paid session", () => {
    expect(
      shouldAutoCancelUnpaidSession({
        ...base,
        paid: true,
        scheduledAt: endedLongAgo,
        config: { autoCancelEnabled: true },
      }),
    ).toBe(false);
  });

  it("does not cancel on an unparseable date", () => {
    expect(
      shouldAutoCancelUnpaidSession({ ...base, scheduledAt: "not-a-date", config: { autoCancelEnabled: true } }),
    ).toBe(false);
  });
});

describe("reminderNotification", () => {
  it("a paid session gets a plain upcoming-session notice", () => {
    expect(reminderNotification({ paid: true, dateStr: "12 Mar 2026", timeLabel: "5 days" })).toEqual({
      type: REMINDER_TYPE,
      message: "Session on 12 Mar 2026, coming up in 5 days.",
    });
  });

  it("an unpaid session gets a distinct type and a 'not paid yet' message", () => {
    const n = reminderNotification({ paid: false, dateStr: "12 Mar 2026", timeLabel: "5 days" });
    expect(n.type).toBe("session_payment_due");
    expect(n.type).not.toBe(REMINDER_TYPE);
    expect(n.message).toMatch(/not paid yet/i);
    expect(n.message).toContain("12 Mar 2026");
  });
});
