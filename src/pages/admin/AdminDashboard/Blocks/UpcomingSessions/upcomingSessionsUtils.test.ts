import { describe, expect, it } from "vitest";

import type { ClientStub, Session, UserProfile } from "@/models/globalTypes";
import { buildUpcomingRows, type UpcomingStubSession } from "./upcomingSessionsUtils";

const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();
const iso = (offsetDays: number) => new Date(NOW + offsetDays * 86_400_000).toISOString();

const session = (over: Partial<Session> = {}): Session =>
  ({
    id: `s-${Math.random()}`,
    client_id: "c-1",
    scheduled_at: iso(1),
    duration_minutes: 50,
    location: null,
    paid: false,
    status: "scheduled",
    ...over,
  }) as unknown as Session;

const stubSession = (over: Partial<UpcomingStubSession> = {}): UpcomingStubSession => ({
  id: `st-${Math.random()}`,
  stub_id: "stub-1",
  scheduled_at: iso(1),
  duration_minutes: 50,
  status: "scheduled",
  paid: false,
  location: null,
  ...over,
});

const client = (over: Partial<UserProfile> = {}): UserProfile =>
  ({
    id: "c-1",
    first_name: "Dana",
    last_name: "Scully",
    display_name: null,
    admin_codename: null,
    ...over,
  }) as unknown as UserProfile;

const stub = (over: Partial<ClientStub> = {}): ClientStub =>
  ({
    id: "stub-1",
    created_by: "a-1",
    linked_user_id: null,
    first_name: "Fox",
    last_name: "Mulder",
    email: null,
    codename: null,
    created_at: iso(-30),
    ...over,
  }) as ClientStub;

describe("buildUpcomingRows", () => {
  it("merges real and stub sessions into one soonest-first list", () => {
    const rows = buildUpcomingRows({
      sessions: [session({ id: "s-late", scheduled_at: iso(4) })],
      clients: [client()],
      stubSessions: [stubSession({ id: "st-early", scheduled_at: iso(2) })],
      stubs: [stub()],
      now: NOW,
    });

    expect(rows.map((r) => r.key)).toEqual(["stub-st-early", "session-s-late"]);
    expect(rows[0]).toMatchObject({ isOffline: true, name: "Fox Mulder", to: "/admin/clients/stub/stub-1" });
    expect(rows[1]).toMatchObject({ isOffline: false, name: "Dana Scully", to: "/admin/clients/c-1" });
  });

  it("falls back to a generic name when the client or stub is not found", () => {
    const rows = buildUpcomingRows({
      sessions: [session({ client_id: "missing" })],
      clients: [],
      stubSessions: [stubSession({ stub_id: "gone" })],
      stubs: [],
      now: NOW,
    });
    expect(rows.find((r) => !r.isOffline)?.name).toBe("Client");
    expect(rows.find((r) => r.isOffline)?.name).toBe("Offline client");
  });

  it("uses the stub codename when useCodenames is on and a codename exists", () => {
    const [row] = buildUpcomingRows({
      sessions: [],
      clients: [],
      stubSessions: [stubSession()],
      stubs: [stub({ codename: "Agent M" })],
      useCodenames: true,
      now: NOW,
    });
    expect(row.name).toBe("Agent M");
  });

  it("points a session with no client_id at the scheduler", () => {
    const [row] = buildUpcomingRows({
      sessions: [session({ client_id: null })],
      clients: [],
      now: NOW,
    });
    expect(row.to).toBe("/admin/scheduler");
  });

  it("excludes cancelled sessions from both sources", () => {
    const rows = buildUpcomingRows({
      sessions: [session({ status: "cancelled" })],
      clients: [client()],
      stubSessions: [stubSession({ status: "cancelled" })],
      stubs: [stub()],
      now: NOW,
    });
    expect(rows).toEqual([]);
  });

  it("excludes sessions in the past and beyond the 7-day window", () => {
    const rows = buildUpcomingRows({
      sessions: [
        session({ id: "s-past", scheduled_at: iso(-1) }),
        session({ id: "s-far", scheduled_at: iso(8) }),
        session({ id: "s-ok", scheduled_at: iso(3) }),
      ],
      clients: [client()],
      now: NOW,
    });
    expect(rows.map((r) => r.key)).toEqual(["session-s-ok"]);
  });

  it("respects the limit after merging and sorting", () => {
    const rows = buildUpcomingRows({
      sessions: [
        session({ id: "a", scheduled_at: iso(1) }),
        session({ id: "b", scheduled_at: iso(2) }),
        session({ id: "c", scheduled_at: iso(3) }),
      ],
      clients: [client()],
      limit: 2,
      now: NOW,
    });
    expect(rows.map((r) => r.key)).toEqual(["session-a", "session-b"]);
  });

  it("works when stubSessions and stubs are omitted entirely", () => {
    const rows = buildUpcomingRows({ sessions: [session()], clients: [client()], now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0].isOffline).toBe(false);
  });

  it("returns an empty array when there is nothing upcoming", () => {
    expect(buildUpcomingRows({ sessions: [], clients: [], now: NOW })).toEqual([]);
  });
});
