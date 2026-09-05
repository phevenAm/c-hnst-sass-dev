import { describe, expect, it } from "vitest";

import { isActiveManager, isActiveMember, isAgencyOwner } from "./agencyPermissions";

describe("isAgencyOwner", () => {
  it("identifies the owner", () => {
    expect(isAgencyOwner("u1", { owner_id: "u1" })).toBe(true);
  });

  it("denies a non-owner member", () => {
    expect(isAgencyOwner("u2", { owner_id: "u1" })).toBe(false);
  });

  it("denies when there's no agency loaded yet", () => {
    expect(isAgencyOwner("u1", null)).toBe(false);
  });

  it("denies a missing user id", () => {
    expect(isAgencyOwner(null, { owner_id: "u1" })).toBe(false);
    expect(isAgencyOwner(undefined, { owner_id: "u1" })).toBe(false);
  });
});

describe("isActiveManager (agency 'admin' resolution)", () => {
  it("true for an active manager", () => {
    expect(isActiveManager({ role: "manager", status: "active" })).toBe(true);
  });

  it("false for a disabled manager — paused users are denied", () => {
    expect(isActiveManager({ role: "manager", status: "disabled" })).toBe(false);
  });

  it("false for an active counsellor (staff, not a manager)", () => {
    expect(isActiveManager({ role: "counsellor", status: "active" })).toBe(false);
  });

  it("false with no membership — a user with no agency membership is denied", () => {
    expect(isActiveManager(null)).toBe(false);
  });
});

describe("isActiveMember", () => {
  it("true for any active role", () => {
    expect(isActiveMember({ status: "active" })).toBe(true);
  });

  it("false once disabled", () => {
    expect(isActiveMember({ status: "disabled" })).toBe(false);
  });

  it("false with no membership at all", () => {
    expect(isActiveMember(null)).toBe(false);
  });
});
