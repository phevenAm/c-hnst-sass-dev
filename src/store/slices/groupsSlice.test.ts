import { describe, expect, it } from "vitest";

import reducer, {
  addGroupMember,
  addGroupStaff,
  createGroup,
  deleteGroup,
  fetchGroups,
  type GroupWithRows,
  removeGroupMember,
  removeGroupStaff,
  selectGroupsForStub,
} from "./groupsSlice";

const initial = reducer(undefined, { type: "@@INIT" });

const baseGroup: GroupWithRows = {
  id: "g-1",
  agency_id: "agency-1",
  name: "Tuesday group",
  description: null,
  created_by: "manager-1",
  created_at: "2026-09-16T00:00:00Z",
  members: [],
  staff: [],
};

describe("groupsSlice reducer", () => {
  it("starts idle with an empty list", () => {
    expect(initial.status).toBe("idle");
    expect(initial.groups).toEqual([]);
  });

  it("sets loading on fetchGroups.pending and clears any prior error", () => {
    const seeded = { ...initial, error: "old error" };
    const next = reducer(seeded, { type: fetchGroups.pending.type });
    expect(next.status).toBe("loading");
    expect(next.error).toBeNull();
  });

  it("stores the groups (with members/staff attached) on fetchGroups.fulfilled", () => {
    const next = reducer(initial, { type: fetchGroups.fulfilled.type, payload: [baseGroup] });
    expect(next.status).toBe("succeeded");
    expect(next.groups).toEqual([baseGroup]);
  });

  it("extracts a real message on fetchGroups.rejected instead of always falling back (regression — .unwrap()/getErrorMessage)", () => {
    // Mirrors the createIntakeClient bug: rejectWithValue(str) means the
    // rejected action's payload is a bare string, not an Error.
    const next = reducer(initial, { type: fetchGroups.rejected.type, payload: "agency_id is required" });
    expect(next.status).toBe("failed");
    expect(next.error).toBe("agency_id is required");
  });

  it("falls back to a generic message when the rejection carries nothing usable", () => {
    const next = reducer(initial, { type: fetchGroups.rejected.type, payload: undefined });
    expect(next.error).toBe("Couldn't load groups");
  });

  it("prepends a newly created group (happy path)", () => {
    const seeded = { ...initial, groups: [baseGroup] };
    const created = { ...baseGroup, id: "g-2", name: "New group" };
    const next = reducer(seeded, { type: createGroup.fulfilled.type, payload: created });
    expect(next.groups.map((g) => g.id)).toEqual(["g-2", "g-1"]);
  });

  it("removes a group on deleteGroup.fulfilled", () => {
    const seeded = { ...initial, groups: [baseGroup] };
    const next = reducer(seeded, { type: deleteGroup.fulfilled.type, payload: baseGroup.id });
    expect(next.groups).toEqual([]);
  });

  it("appends a member to the matching group on addGroupMember.fulfilled", () => {
    const seeded = { ...initial, groups: [baseGroup] };
    const member = {
      id: "gm-1",
      group_id: "g-1",
      client_id: null,
      stub_id: "stub-1",
      added_at: "2026-09-16T00:00:00Z",
    };
    const next = reducer(seeded, { type: addGroupMember.fulfilled.type, payload: member });
    expect(next.groups[0].members).toEqual([member]);
  });

  it("removes a member by id, scoped to its group, on removeGroupMember.fulfilled", () => {
    const member = {
      id: "gm-1",
      group_id: "g-1",
      client_id: null,
      stub_id: "stub-1",
      added_at: "2026-09-16T00:00:00Z",
    };
    const seeded = { ...initial, groups: [{ ...baseGroup, members: [member] }] };
    const next = reducer(seeded, { type: removeGroupMember.fulfilled.type, payload: { id: "gm-1", group_id: "g-1" } });
    expect(next.groups[0].members).toEqual([]);
  });

  it("appends staff to the matching group on addGroupStaff.fulfilled", () => {
    const seeded = { ...initial, groups: [baseGroup] };
    const staff = { id: "gs-1", group_id: "g-1", user_id: "user-1", added_at: "2026-09-16T00:00:00Z" };
    const next = reducer(seeded, { type: addGroupStaff.fulfilled.type, payload: staff });
    expect(next.groups[0].staff).toEqual([staff]);
  });

  it("removes staff by id, scoped to its group, on removeGroupStaff.fulfilled", () => {
    const staff = { id: "gs-1", group_id: "g-1", user_id: "user-1", added_at: "2026-09-16T00:00:00Z" };
    const seeded = { ...initial, groups: [{ ...baseGroup, staff: [staff] }] };
    const next = reducer(seeded, { type: removeGroupStaff.fulfilled.type, payload: { id: "gs-1", group_id: "g-1" } });
    expect(next.groups[0].staff).toEqual([]);
  });

  it("doesn't touch other groups' members/staff when mutating one group (edge case)", () => {
    const other: GroupWithRows = { ...baseGroup, id: "g-2", name: "Other group" };
    const seeded = { ...initial, groups: [baseGroup, other] };
    const member = {
      id: "gm-1",
      group_id: "g-1",
      client_id: null,
      stub_id: "stub-1",
      added_at: "2026-09-16T00:00:00Z",
    };
    const next = reducer(seeded, { type: addGroupMember.fulfilled.type, payload: member });
    expect(next.groups.find((g) => g.id === "g-1")?.members).toEqual([member]);
    expect(next.groups.find((g) => g.id === "g-2")?.members).toEqual([]);
  });
});

describe("selectGroupsForStub", () => {
  it("returns only groups where the stub is a member (happy path)", () => {
    const memberOfG1 = { id: "gm-1", group_id: "g-1", client_id: null, stub_id: "stub-1", added_at: "" };
    const state = {
      groups: {
        groups: [
          { ...baseGroup, members: [memberOfG1] },
          { ...baseGroup, id: "g-2", members: [] },
        ],
        status: "succeeded" as const,
        error: null,
      },
    };
    expect(selectGroupsForStub("stub-1")(state).map((g) => g.id)).toEqual(["g-1"]);
  });

  it("returns an empty list for a stub in no groups (sad path)", () => {
    const state = { groups: { groups: [baseGroup], status: "succeeded" as const, error: null } };
    expect(selectGroupsForStub("stub-unknown")(state)).toEqual([]);
  });
});
