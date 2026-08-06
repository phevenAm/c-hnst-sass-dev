// Web Crypto API utilities for client-side AES-256-GCM note encryption.
//
// Architecture (envelope encryption):
//   - A random 256-bit "data key" encrypts all notes for a practice.
//   - The data key is itself wrapped (encrypted) with a "key-encryption-key" (KEK).
//   - The KEK is derived from the admin's password via PBKDF2 — it is never stored.
//   - A second wrapped copy of the data key exists, derived from a recovery code,
//     so notes survive a password reset if the admin has their recovery code.
//   - The DB stores only ciphertext; the data key only ever lives in browser memory.

const PBKDF2_ITERATIONS = 310_000; // OWASP-recommended minimum for SHA-256

export function toBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(s: string): Uint8Array {
  return new Uint8Array(
    atob(s)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Format as 8 groups of 8 chars: xxxx-xxxx-xxxx-…
  return hex.match(/.{8}/g)!.join("-");
}

// Derives a key-encryption-key from a password (or recovery code) and a salt.
export async function deriveKEK(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Generates a fresh random AES-256-GCM data key.
export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

// Wraps (encrypts) a data key with a KEK. Returns base64-encoded iv + ciphertext.
export async function wrapDataKey(dataKey: CryptoKey, kek: CryptoKey): Promise<{ iv: string; wrapped: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await crypto.subtle.exportKey("raw", dataKey);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw);
  return { iv: toBase64(iv), wrapped: toBase64(wrapped) };
}

// Unwraps a data key. Throws DOMException if the KEK is wrong (wrong password).
export async function unwrapDataKey(wrapped: string, iv: string, kek: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, kek, fromBase64(wrapped));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

// Encrypts a note string. Each call generates a fresh random IV.
export async function encryptNote(content: string, dataKey: CryptoKey): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dataKey, new TextEncoder().encode(content));
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

// Decrypts a note given its ciphertext and per-note IV.
export async function decryptNote(ciphertext: string, iv: string, dataKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, dataKey, fromBase64(ciphertext));
  return new TextDecoder().decode(raw);
}
