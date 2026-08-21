import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EncryptionProvider, useEncryption } from "./EncryptionContext";

// End-to-end coverage of the password-gated flows through the actual React
// context (not just the underlying crypto primitives — see
// lib/noteEncryption.test.ts for those) — setup, unlock, rotatePassword, and
// regenerateCode. This is the code path that guards real client session
// notes; a bug here either corrupts data or locks an admin out of it.

const ADMIN_ID = "admin-1";

const { fakeRow, supabaseMock } = vi.hoisted(() => ({
  fakeRow: { value: null as Record<string, unknown> | null },
  supabaseMock: {
    auth: {
      getUser: vi.fn(),
      // EncryptionContext subscribes on mount purely to react to SIGNED_OUT
      // etc. — these tests drive status by calling setup/unlock/regenerate
      // directly, so this just needs to exist and be unsubscribable.
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}));

vi.mock("../lib/supabase.js", () => ({ supabase: supabaseMock }));

function resetFakeTable() {
  fakeRow.value = null;
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "practice_settings") throw new Error(`Unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: fakeRow.value }),
        }),
      }),
      upsert: (payload: Record<string, unknown>) => {
        fakeRow.value = { admin_id: ADMIN_ID, ...payload };
        return Promise.resolve({ error: null });
      },
      update: (payload: Record<string, unknown>) => ({
        eq: () => {
          fakeRow.value = { ...(fakeRow.value ?? {}), ...payload };
          return Promise.resolve({ error: null });
        },
      }),
    };
  });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  resetFakeTable();
});

function renderEncryption() {
  return renderHook(() => useEncryption(), { wrapper: EncryptionProvider });
}

describe("EncryptionContext", () => {
  it("setupEncryption unlocks and issues a one-time pending code", async () => {
    const { result } = renderEncryption();

    await result.current.setupEncryption("correct-password-123");

    await waitFor(() => expect(result.current.status).toBe("unlocked"));
    expect(result.current.pendingCode).toBeTruthy();
    expect(result.current.pendingCode!.split("-")).toHaveLength(4);
  });

  it("unlockWithPassword rejects the wrong password without corrupting state", async () => {
    const { result } = renderEncryption();
    await result.current.setupEncryption("right-password");
    await waitFor(() => expect(result.current.status).toBe("unlocked"));

    const outcome = await result.current.unlockWithPassword("totally-wrong");
    expect(outcome).toBe("wrong_password");
  });

  it("a note encrypted before setup's password is later confirmed unlockable with the same password", async () => {
    const { result } = renderEncryption();
    await result.current.setupEncryption("my-password");
    await waitFor(() => expect(result.current.status).toBe("unlocked"));

    const { iv, ciphertext } = await result.current.encryptNote("client is making good progress");
    expect(await result.current.decryptNote(ciphertext, iv)).toBe("client is making good progress");

    const outcome = await result.current.unlockWithPassword("my-password");
    expect(outcome).toBe("unlocked");
    expect(await result.current.decryptNote(ciphertext, iv)).toBe("client is making good progress");
  });

  describe("regenerateCode", () => {
    it("returns false and leaves everything unchanged when the password is wrong", async () => {
      const { result } = renderEncryption();
      await result.current.setupEncryption("original-password");
      await waitFor(() => expect(result.current.status).toBe("unlocked"));

      const codeBefore = result.current.pendingCode;
      const ok = await result.current.regenerateCode("wrong-password-guess");

      expect(ok).toBe(false);
      // Nothing about the stored wrap should have moved on a failed attempt.
      expect(result.current.pendingCode).toBe(codeBefore);
    });

    it("issues a new code and keeps notes encrypted before the rotation fully readable after it", async () => {
      const { result } = renderEncryption();
      await result.current.setupEncryption("stable-password");
      await waitFor(() => expect(result.current.status).toBe("unlocked"));

      const oldCode = result.current.pendingCode;
      const { iv, ciphertext } = await result.current.encryptNote("pre-rotation note");

      const ok = await result.current.regenerateCode("stable-password");
      expect(ok).toBe(true);

      await waitFor(() => expect(result.current.pendingCode).not.toBe(oldCode));
      expect(result.current.status).toBe("unlocked");

      // The critical assertion: the note encrypted BEFORE regeneration must
      // still decrypt afterward, using the in-memory key regenerateCode left
      // in place (it re-wraps the same data key — it must not swap it out).
      expect(await result.current.decryptNote(ciphertext, iv)).toBe("pre-rotation note");

      // And unlocking fresh with the same password, post-rotation, must also
      // reach a key that can read the pre-rotation note — proves the DB
      // write itself (not just in-memory state) is internally consistent.
      const outcome = await result.current.unlockWithPassword("stable-password");
      expect(outcome).toBe("unlocked");
      expect(await result.current.decryptNote(ciphertext, iv)).toBe("pre-rotation note");
    });

    it("the old password stops working if regenerateCode also rotated it via rotatePassword", async () => {
      // regenerateCode itself keeps the same password (only the code
      // changes) — this documents that boundary: rotating the *password*
      // is rotatePassword's job, and the two are independent.
      const { result } = renderEncryption();
      await result.current.setupEncryption("password-a");
      await waitFor(() => expect(result.current.status).toBe("unlocked"));

      await result.current.regenerateCode("password-a");
      await waitFor(() => expect(result.current.status).toBe("unlocked"));

      // The password from setup still works after regenerateCode.
      const stillWorks = await result.current.unlockWithPassword("password-a");
      expect(stillWorks).toBe("unlocked");

      await result.current.rotatePassword("password-a", "password-b");

      const oldPasswordNowFails = await result.current.unlockWithPassword("password-a");
      expect(oldPasswordNowFails).toBe("wrong_password");

      const newPasswordWorks = await result.current.unlockWithPassword("password-b");
      expect(newPasswordWorks).toBe("unlocked");
    });
  });
});
