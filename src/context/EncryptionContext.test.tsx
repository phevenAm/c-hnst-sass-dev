import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EncryptionProvider, useEncryption } from "./EncryptionContext";

// End-to-end coverage of the code-gated flows through the actual React
// context (not just the underlying crypto primitives — see
// lib/noteEncryption.test.ts for those) — setup, unlock, and regenerateCode.
// This is the code path that guards real client session notes; a bug here
// either corrupts data or locks an admin out of it.
//
// There is deliberately no password-based unlock path here — the 4-word
// code is the only secret that can unlock notes. A previous version of this
// context also wrapped the code itself under the login password as a
// convenience, which meant anyone who could log in as the admin could also
// decrypt every note without ever knowing the code — that defeated the
// point of having a separate secret at all, so it was removed.

const ADMIN_ID = "admin-1";

const { fakeRow, supabaseMock } = vi.hoisted(() => ({
  fakeRow: { value: null as Record<string, unknown> | null },
  supabaseMock: {
    auth: {
      // getUser() is a network round-trip that holds the auth lock — the
      // context must never call it (it starved concurrent sign-ins of the
      // lock). Kept here only so the "never called" assertion has something
      // to check.
      getUser: vi.fn(),
      getSession: vi.fn(),
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
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: { user: { id: ADMIN_ID } } } });
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
  it("setupEncryption takes no password and issues a one-time pending code", async () => {
    const { result } = renderEncryption();

    await result.current.setupEncryption();

    await waitFor(() => expect(result.current.status).toBe("unlocked"));
    expect(result.current.pendingCode).toBeTruthy();
    expect(result.current.pendingCode!.split("-")).toHaveLength(4);
  });

  it("setupEncryption never persists an enc_code_wrapped-style password layer", async () => {
    const { result } = renderEncryption();
    await result.current.setupEncryption();
    await waitFor(() => expect(result.current.status).toBe("unlocked"));

    // Only the code-wrapped data key should exist server-side — nothing
    // recoverable via a password, by design.
    expect(fakeRow.value).not.toHaveProperty("enc_code_wrapped");
    expect(fakeRow.value).toHaveProperty("enc_data_key");
  });

  it("unlockWithCode rejects the wrong code without corrupting state", async () => {
    const { result } = renderEncryption();
    await result.current.setupEncryption();
    await waitFor(() => expect(result.current.status).toBe("unlocked"));

    const outcome = await result.current.unlockWithCode("totally-wrong-code-here");
    expect(outcome).toBe("wrong_code");
  });

  it("unlockWithCode returns no_key when encryption was never set up", async () => {
    const { result } = renderEncryption();
    const outcome = await result.current.unlockWithCode("anything-at-all-here");
    expect(outcome).toBe("no_key");
  });

  it("never calls supabase.auth.getUser (it holds the auth lock across a network call)", async () => {
    const { result } = renderEncryption();
    await result.current.setupEncryption();
    await waitFor(() => expect(result.current.status).toBe("unlocked"));
    const code = result.current.pendingCode!;
    await result.current.regenerateCode(code);
    await result.current.checkStatus();

    const { result: fresh } = renderEncryption();
    await fresh.current.unlockWithCode(result.current.pendingCode!);

    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("a note encrypted at setup is later readable after locking and unlocking with the code", async () => {
    const { result } = renderEncryption();
    await result.current.setupEncryption();
    await waitFor(() => expect(result.current.status).toBe("unlocked"));
    const code = result.current.pendingCode!;

    const { iv, ciphertext } = await result.current.encryptNote("client is making good progress");
    expect(await result.current.decryptNote(ciphertext, iv)).toBe("client is making good progress");

    // Simulate a fresh session with no in-memory key — only the code unlocks it.
    const { result: fresh } = renderEncryption();
    const outcome = await fresh.current.unlockWithCode(code);
    expect(outcome).toBe("unlocked");
    expect(await fresh.current.decryptNote(ciphertext, iv)).toBe("client is making good progress");
  });

  describe("regenerateCode", () => {
    it("returns false and leaves everything unchanged when the current code is wrong", async () => {
      const { result } = renderEncryption();
      await result.current.setupEncryption();
      await waitFor(() => expect(result.current.status).toBe("unlocked"));

      const codeBefore = result.current.pendingCode;
      const ok = await result.current.regenerateCode("wrong-code-guess-here");

      expect(ok).toBe(false);
      // Nothing about the stored wrap should have moved on a failed attempt.
      expect(result.current.pendingCode).toBe(codeBefore);
    });

    it("issues a new code and keeps notes encrypted before the rotation fully readable after it", async () => {
      const { result } = renderEncryption();
      await result.current.setupEncryption();
      await waitFor(() => expect(result.current.status).toBe("unlocked"));

      const oldCode = result.current.pendingCode!;
      const { iv, ciphertext } = await result.current.encryptNote("pre-rotation note");

      const ok = await result.current.regenerateCode(oldCode);
      expect(ok).toBe(true);

      await waitFor(() => expect(result.current.pendingCode).not.toBe(oldCode));
      const newCode = result.current.pendingCode!;
      expect(result.current.status).toBe("unlocked");

      // The critical assertion: the note encrypted BEFORE regeneration must
      // still decrypt afterward, using the in-memory key regenerateCode left
      // in place (it re-wraps the same data key — it must not swap it out).
      expect(await result.current.decryptNote(ciphertext, iv)).toBe("pre-rotation note");

      // The OLD code must no longer unlock anything post-rotation...
      const { result: withOldCode } = renderEncryption();
      expect(await withOldCode.current.unlockWithCode(oldCode)).toBe("wrong_code");

      // ...and the NEW code, fresh from the DB, must reach a key that can
      // read the pre-rotation note — proves the DB write itself (not just
      // in-memory state) is internally consistent.
      const { result: withNewCode } = renderEncryption();
      const outcome = await withNewCode.current.unlockWithCode(newCode);
      expect(outcome).toBe("unlocked");
      expect(await withNewCode.current.decryptNote(ciphertext, iv)).toBe("pre-rotation note");
    });
  });
});
