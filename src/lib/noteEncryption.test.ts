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
// setup/unlock/rotatePassword/regenerateCode flows. Getting any of this wrong
// either silently corrupts real client session notes or locks an admin out
// of their own data — worth testing directly, not just through the UI.

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

  it("wraps and unwraps a data key with a password-derived KEK", async () => {
    const dataKey = await generateDataKey();
    const salt = generateSalt();
    const kek = await deriveKEK("correct horse battery staple", salt);
    const { iv, wrapped } = await wrapDataKey(dataKey, kek);

    const sameKek = await deriveKEK("correct horse battery staple", salt);
    const unwrapped = await unwrapDataKey(wrapped, iv, sameKek);

    // Prove it's really the same key, not just "didn't throw" — encrypt with
    // the original, decrypt with the unwrapped copy.
    const { iv: noteIv, ciphertext } = await encryptNote("client note", dataKey);
    expect(await decryptNote(ciphertext, noteIv, unwrapped)).toBe("client note");
  });

  it("rejects unwrapping with the wrong password", async () => {
    const dataKey = await generateDataKey();
    const salt = generateSalt();
    const kek = await deriveKEK("right-password", salt);
    const { iv, wrapped } = await wrapDataKey(dataKey, kek);

    const wrongKek = await deriveKEK("wrong-password", salt);
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

  // ── The two-layer envelope end to end, including regenerateCode's core
  // operation: re-wrapping the SAME data key under a NEW code, without
  // touching any already-encrypted note content. ────────────────────────
  it("setup → unlock → regenerate code → old notes still decrypt under the new code", async () => {
    const password = "hunter2-but-longer";

    // ── Setup (mirrors EncryptionContext.setupEncryption) ──
    const originalCode = generateEncryptionCode();
    const dataKey = await generateDataKey();

    const dataKeySalt1 = generateSalt();
    const codeKEK1 = await deriveKEK(originalCode, dataKeySalt1);
    const wrappedDataKey1 = await wrapDataKey(dataKey, codeKEK1);

    const codeSalt1 = generateSalt();
    const pwKEK1 = await deriveKEK(password, codeSalt1);
    const wrappedCode1 = await encryptNote(originalCode, pwKEK1);

    // A note written before the code is ever regenerated.
    const { iv: legacyNoteIv, ciphertext: legacyNoteCiphertext } = await encryptNote(
      "client disclosed a change in circumstances",
      dataKey,
    );

    // ── Unlock (mirrors EncryptionContext.unlockWithPassword) — sanity check
    // the setup above actually works before regenerating anything. ──
    const pwKEKForUnlock = await deriveKEK(password, codeSalt1);
    const recoveredCode = await decryptNote(wrappedCode1.ciphertext, wrappedCode1.iv, pwKEKForUnlock);
    expect(recoveredCode).toBe(originalCode);
    const codeKEKForUnlock = await deriveKEK(recoveredCode, dataKeySalt1);
    const unwrappedDataKey = await unwrapDataKey(wrappedDataKey1.wrapped, wrappedDataKey1.iv, codeKEKForUnlock);
    expect(await decryptNote(legacyNoteCiphertext, legacyNoteIv, unwrappedDataKey)).toBe(
      "client disclosed a change in circumstances",
    );

    // ── Regenerate code (mirrors EncryptionContext.regenerateCode) — the
    // SAME dataKey (not a fresh one) gets re-wrapped under a brand new code. ──
    const newCode = generateEncryptionCode();
    expect(newCode).not.toBe(originalCode);

    const dataKeySalt2 = generateSalt();
    const codeKEK2 = await deriveKEK(newCode, dataKeySalt2);
    const wrappedDataKey2 = await wrapDataKey(dataKey, codeKEK2); // same dataKey object

    const codeSalt2 = generateSalt();
    const pwKEK2 = await deriveKEK(password, codeSalt2);
    const wrappedCode2 = await encryptNote(newCode, pwKEK2);

    // ── Unlock again with the SAME password, after regeneration — must
    // reach the exact same dataKey, and the pre-existing note must still
    // decrypt correctly. This is the whole point: rotating the code must
    // never orphan previously-encrypted content. ──
    const pwKEKAfter = await deriveKEK(password, codeSalt2);
    const codeAfter = await decryptNote(wrappedCode2.ciphertext, wrappedCode2.iv, pwKEKAfter);
    expect(codeAfter).toBe(newCode);
    const codeKEKAfter = await deriveKEK(codeAfter, dataKeySalt2);
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

  it("rejects regenerateCode's password-verification step when the password is wrong", async () => {
    const password = "the-real-password";
    const code = generateEncryptionCode();
    const codeSalt = generateSalt();
    const pwKEK = await deriveKEK(password, codeSalt);
    const wrappedCode = await encryptNote(code, pwKEK);

    // This is exactly the first thing EncryptionContext.regenerateCode does
    // to verify the caller actually knows the current password — it must
    // throw (not silently return garbage) so regenerateCode can catch it
    // and return false rather than proceeding to wrap under a bogus KEK.
    const wrongPwKEK = await deriveKEK("guessed-password", codeSalt);
    await expect(decryptNote(wrappedCode.ciphertext, wrappedCode.iv, wrongPwKEK)).rejects.toThrow();
  });
});
