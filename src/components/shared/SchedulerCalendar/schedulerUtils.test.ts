import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import type { AvailabilityOverride, AvailabilityRule, ClientStub, Session, StubSession } from "@/models/globalTypes";
import { bookableWindowsForDate, clientSessionEvents, sessionEvents, stubSessionEvents } from "./schedulerUtils";

// A concrete Friday to anchor the tests; day_of_week is derived so the test
// doesn't depend on knowing the weekday index by hand.
const DATE = new Date("2026-08-07T00:00:00");
const DOW = dayjs(DATE).day();
const DATE_STR = dayjs(DATE).format("YYYY-MM-DD");

const rule = (start: string, end: string): AvailabilityRule => ({
  id: `rule-${start}`,
  admin_id: "a",
  day_of_week: DOW,
  start_time: start,
  end_time: end,
  label: null,
  created_at: "",
});

const override = (o: Partial<AvailabilityOverride>): AvailabilityOverride => ({
  id: `ovr-${Math.random()}`,
  admin_id: "a",
  override_date: DATE_STR,
  start_time: null,
  end_time: null,
  is_blocked: true,
  label: null,
  created_at: "",
  ...o,
});

const asTimes = (windows: { start: Date; end: Date }[]) =>
  windows.map((w) => `${dayjs(w.start).format("HH:mm")}-${dayjs(w.end).format("HH:mm")}`);

describe("bookableWindowsForDate", () => {
  it("returns the rule window for a matching weekday", () => {
    expect(asTimes(bookableWindowsForDate(DATE, [rule("12:00", "16:00")], []))).toEqual(["12:00-16:00"]);
  });

  it("returns nothing when the weekday has no rule", () => {
    const otherRule = { ...rule("12:00", "16:00"), day_of_week: (DOW + 1) % 7 };
    expect(bookableWindowsForDate(DATE, [otherRule], [])).toEqual([]);
  });

  it("drops all windows on a full-day block override", () => {
    const block = override({ is_blocked: true, start_time: null, end_time: null });
    expect(bookableWindowsForDate(DATE, [rule("12:00", "16:00")], [block])).toEqual([]);
  });

  it("adds an extra one-off window override", () => {
    const extra = override({ is_blocked: false, start_time: "18:00", end_time: "19:00" });
    expect(asTimes(bookableWindowsForDate(DATE, [rule("12:00", "16:00")], [extra]))).toEqual([
      "12:00-16:00",
      "18:00-19:00",
    ]);
  });

  it("splits a window around a partial block override", () => {
    const partial = override({ is_blocked: true, start_time: "13:00", end_time: "14:00" });
    expect(asTimes(bookableWindowsForDate(DATE, [rule("12:00", "16:00")], [partial]))).toEqual([
      "12:00-13:00",
      "14:00-16:00",
    ]);
  });
});

// ── session → calendar events, incl. the configurable buffer strip ──────────

const session = (o: Partial<Session> = {}): Session =>
  ({
    id: "s-1",
    client_id: "c-1",
    scheduled_at: "2026-08-07T10:00:00.000Z",
    duration_minutes: 50,
    status: "scheduled",
    ...o,
  }) as Session;

// The buffer strip's length in minutes, or null when there is no buffer event.
const bufferMinutesOf = (events: { id: string; start: Date; end: Date }[]): number | null => {
  const buffer = events.find((e) => e.id.startsWith("buffer-"));
  return buffer ? dayjs(buffer.end).diff(buffer.start, "minute") : null;
};

describe("sessionEvents — buffer strip", () => {
  it("adds a default 10-minute buffer after an active session (happy path)", () => {
    const events = sessionEvents([session()], []);
    expect(bufferMinutesOf(events)).toBe(10);

    // buffer starts exactly when the session ends
    const buffer = events.find((e) => e.id === "buffer-s-1");
    const sessionEvent = events.find((e) => e.id === "session-s-1");
    expect(buffer?.start.getTime()).toBe(sessionEvent?.end.getTime());
  });

  it("uses the practice's buffer length when one is given", () => {
    expect(bufferMinutesOf(sessionEvents([session()], [], false, 20))).toBe(20);
  });

  it("emits no buffer event when the buffer is turned off (bufferMinutes = 0)", () => {
    const events = sessionEvents([session()], [], false, 0);
    expect(bufferMinutesOf(events)).toBeNull();
    expect(events).toHaveLength(1);
  });

  it("never buffers a cancelled session, regardless of the setting (sad path)", () => {
    const events = sessionEvents([session({ status: "cancelled" })], [], false, 10);
    expect(events).toHaveLength(1);
    expect(events[0].resource.type).toBe("cancelled-session");
  });
});

describe("clientSessionEvents — buffer strip", () => {
  it("mirrors the counsellor's buffer setting", () => {
    expect(bufferMinutesOf(clientSessionEvents([session()], 15))).toBe(15);
  });

  it("emits no buffer when off", () => {
    expect(bufferMinutesOf(clientSessionEvents([session()], 0))).toBeNull();
  });
});

describe("stubSessionEvents", () => {
  const stub = (o: Partial<ClientStub> = {}): ClientStub =>
    ({ id: "st-1", first_name: "Grace", last_name: "Hopper", codename: null, ...o }) as ClientStub;
  const stubSession = (o: Partial<StubSession> = {}): StubSession =>
    ({
      id: "ss-1",
      stub_id: "st-1",
      scheduled_at: "2026-08-07T10:00:00.000Z",
      duration_minutes: 50,
      status: "scheduled",
      ...o,
    }) as StubSession;

  it("honours the buffer setting for offline-client sessions", () => {
    expect(bufferMinutesOf(stubSessionEvents([stubSession()], [stub()], false, 0))).toBeNull();
    expect(bufferMinutesOf(stubSessionEvents([stubSession()], [stub()], false, 10))).toBe(10);
  });

  it("drops a stub session whose stub is missing (sad path)", () => {
    expect(stubSessionEvents([stubSession({ stub_id: "gone" })], [stub()])).toEqual([]);
  });
});
