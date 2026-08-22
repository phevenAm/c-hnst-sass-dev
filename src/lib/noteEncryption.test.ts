import { describe, expect, it } from "vitest";

import {
  decryptNote,
  deriveKEK,
  encryptNote,
  fromBase64,
  generateDataKey,
  generateEncryptionCode,
  generateSalt,
  toBase64,
  unwrapDataKey,
  wrapDataKey,
} from "./noteEncryption";

// These cover the actual cryptographic primitives behind EncryptionContext's
// setup/unlock/regenerateCode flows. Getting any of this wrong either
// silently corrupts real client session notes or locks an admin out of
// their own data — worth testing directly, not just through the UI.

describe("noteEncryption", () => {
  it("encrypts and decrypts a note round-trip", async () => {
    const dataKey = await generateDataKey();
    const { iv, ciphertext } = await encryptNote("hello world", dataKey);
    expect(await decryptNote(ciphertext, iv, dataKey)).toBe("hello world");
  });

  it("fails to decrypt with the wrong data key", async () => {
    const dataKey = await generateDataKey();
    const wrongKey = await generateDataKey();
    const { iv, ciphertext } = await encryptNote("secret", dataKey);
    await expect(decryptNote(ciphertext, iv, wrongKey)).rejects.toThrow();
  });

  it("wraps and unwraps a data key with a code-derived KEK", async () => {
    const dataKey = await generateDataKey();
    const salt = generateSalt();
    const kek = await deriveKEK("calm-reef-gold-pine", salt);
    const { iv, wrapped } = await wrapDataKey(dataKey, kek);

    const sameKek = await deriveKEK("calm-reef-gold-pine", salt);
    const unwrapped = await unwrapDataKey(wrapped, iv, sameKek);

    // Prove it's really the same key, not just "didn't throw" — encrypt with
    // the original, decrypt with the unwrapped copy.
    const { iv: noteIv, ciphertext } = await encryptNote("client note", dataKey);
    expect(await decryptNote(ciphertext, noteIv, unwrapped)).toBe("client note");
  });

  it("rejects unwrapping with the wrong code", async () => {
    const dataKey = await generateDataKey();
    const salt = generateSalt();
    const kek = await deriveKEK("right-code-here", salt);
    const { iv, wrapped } = await wrapDataKey(dataKey, kek);

    const wrongKek = await deriveKEK("wrong-code-here", salt);
    await expect(unwrapDataKey(wrapped, iv, wrongKek)).rejects.toThrow();
  });

  it("generates distinct 4-word codes", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateEncryptionCode()));
    // Not a strict uniqueness guarantee (it's random), but 20 draws all
    // colliding would indicate the RNG or word-picking is broken.
    expect(codes.size).toBeGreaterThan(1);
    for (const code of codes) {
      expect(code.split("-")).toHaveLength(4);
    }
  });

  it("base64 round-trips arbitrary bytes", () => {
    const original = crypto.getRandomValues(new Uint8Array(32));
    const roundTripped = fromBase64(toBase64(original.buffer as ArrayBuffer));
    expect(Array.from(roundTripped)).toEqual(Array.from(original));
  });

  // ── The single-layer envelope end to end, including regenerateCode's core
  // operation: re-wrapping the SAME data key under a NEW code, without
  // touching any already-encrypted note content. There is deliberately no
  // password layer here — the code is the only secret that can ever unwrap
  // the data key, so a compromised login password alone can't read notes. ──
  it("setup → unlock → regenerate code → old notes still decrypt under the new code", async () => {
    // ── Setup (mirrors EncryptionContext.setupEncryption) ──
    const originalCode = generateEncryptionCode();
    const dataKey = await generateDataKey();

    const dataKeySalt1 = generateSalt();
    const codeKEK1 = await deriveKEK(originalCode, dataKeySalt1);
    const wrappedDataKey1 = await wrapDataKey(dataKey, codeKEK1);

    // A note written before the code is ever regenerated.
    const { iv: legacyNoteIv, ciphertext: legacyNoteCiphertext } = await encryptNote(
      "client disclosed a change in circumstances",
      dataKey,
    );

    // ── Unlock (mirrors EncryptionContext.unlockWithCode) — sanity check
    // the setup above actually works before regenerating anything. ──
    const codeKEKForUnlock = await deriveKEK(originalCode, dataKeySalt1);
    const unwrappedDataKey = await unwrapDataKey(wrappedDataKey1.wrapped, wrappedDataKey1.iv, codeKEKForUnlock);
    expect(await decryptNote(legacyNoteCiphertext, legacyNoteIv, unwrappedDataKey)).toBe(
      "client disclosed a change in circumstances",
    );

    // ── Regenerate code (mirrors EncryptionContext.regenerateCode) — the
    // SAME dataKey (not a fresh one) gets re-wrapped under a brand new code.
    // regenerateCode first unwraps with the CURRENT code to both verify it
    // and recover the data key, exactly like the unlock step above. ──
    const newCode = generateEncryptionCode();
    expect(newCode).not.toBe(originalCode);

    const dataKeySalt2 = generateSalt();
    const codeKEK2 = await deriveKEK(newCode, dataKeySalt2);
    const wrappedDataKey2 = await wrapDataKey(unwrappedDataKey, codeKEK2); // same dataKey object

    // ── Unlock again with the NEW code, after regeneration — must reach the
    // exact same dataKey, and the pre-existing note must still decrypt
    // correctly. This is the whole point: rotating the code must never
    // orphan previously-encrypted content. ──
    const codeKEKAfter = await deriveKEK(newCode, dataKeySalt2);
    const dataKeyAfter = await unwrapDataKey(wrappedDataKey2.wrapped, wrappedDataKey2.iv, codeKEKAfter);

    expect(await decryptNote(legacyNoteCiphertext, legacyNoteIv, dataKeyAfter)).toBe(
      "client disclosed a change in circumstances",
    );

    // A note written after regeneration, decrypted with the same recovered
    // key, round-trips too — the key is fully usable going forward.
    const { iv: newNoteIv, ciphertext: newNoteCiphertext } = await encryptNote("post-regeneration note", dataKeyAfter);
    expect(await decryptNote(newNoteCiphertext, newNoteIv, dataKeyAfter)).toBe("post-regeneration note");

    // ── The OLD code must no longer unwrap anything — the DB row's wrapped
    // fields were fully replaced, so a leaked/lost old code is worthless
    // after regeneration. ──
    const oldCodeKEK = await deriveKEK(originalCode, dataKeySalt2);
    await expect(unwrapDataKey(wrappedDataKey2.wrapped, wrappedDataKey2.iv, oldCodeKEK)).rejects.toThrow();
  });

  it("rejects regenerateCode's code-verification step when the current code is wrong", async () => {
    const dataKey = await generateDataKey();
    const dataKeySalt = generateSalt();
    const codeKEK = await deriveKEK("the-real-code-here", dataKeySalt);
    const wrappedDataKey = await wrapDataKey(dataKey, codeKEK);

    // This is exactly the first thing EncryptionContext.regenerateCode does
    // to verify the caller actually knows the current code — it must throw
    // (not silently return garbage) so regenerateCode can catch it and
    // return false rather than proceeding to wrap under a bogus KEK.
    const wrongCodeKEK = await deriveKEK("guessed-code-here", dataKeySalt);
    await expect(unwrapDataKey(wrappedDataKey.wrapped, wrappedDataKey.iv, wrongCodeKEK)).rejects.toThrow();
  });
});
