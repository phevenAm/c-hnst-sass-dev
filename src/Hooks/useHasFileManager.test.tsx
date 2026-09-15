import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHasFileManager } from "./useHasFileManager";

// A manager always got Files; staff got it unconditionally too, showing an
// always-empty folder on agencies that never share anything (the actual
// complaint). Staff should only see it once file_folders/file_objects has a
// shared=true row for their agency — RLS already scopes that read correctly
// (20260909000400_file_manager.sql), this hook just has to ask.

vi.mock("@/lib/featureFlags", () => ({ isFeatureEnabled: () => true }));

const { limitMock, eqMock, selectMock, fromMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const eqMock = vi.fn(() => ({ limit: limitMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { limitMock, eqMock, selectMock, fromMock };
});
vi.mock("@/lib/supabase", () => ({ supabase: { from: fromMock } }));

let membership: { role: string; status: string } | null = null;
vi.mock("@store/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ agency: { membership } }),
}));

afterEach(() => {
  vi.clearAllMocks();
  membership = null;
});

describe("useHasFileManager — not in an agency", () => {
  it("returns false without ever querying file_folders/file_objects", () => {
    membership = null;
    const { result } = renderHook(() => useHasFileManager());
    expect(result.current).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("useHasFileManager — agency manager", () => {
  it("returns true immediately, without querying for shared content", () => {
    membership = { role: "manager", status: "active" };
    const { result } = renderHook(() => useHasFileManager());
    expect(result.current).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("useHasFileManager — agency staff (not manager)", () => {
  it("starts false, then becomes true once a shared folder exists (happy path)", async () => {
    membership = { role: "counsellor", status: "active" };
    limitMock.mockImplementation(() =>
      Promise.resolve(fromMock.mock.calls.length <= 1 ? { data: [{ id: "folder-1" }] } : { data: [] }),
    );

    const { result } = renderHook(() => useHasFileManager());
    expect(result.current).toBe(false);

    await waitFor(() => expect(result.current).toBe(true));
    expect(fromMock).toHaveBeenCalledWith("file_folders");
    expect(fromMock).toHaveBeenCalledWith("file_objects");
    expect(eqMock).toHaveBeenCalledWith("shared", true);
  });

  it("stays false when the agency has no shared folders or files (sad path)", async () => {
    membership = { role: "counsellor", status: "active" };
    limitMock.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useHasFileManager());
    await waitFor(() => expect(fromMock).toHaveBeenCalledTimes(2));

    expect(result.current).toBe(false);
  });
});
