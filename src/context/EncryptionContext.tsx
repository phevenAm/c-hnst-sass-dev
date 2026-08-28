import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import {
  decryptNote as cryptoDecrypt,
  encryptNote as cryptoEncrypt,
  deriveKEK,
  fromBase64,
  generateDataKey,
  generateEncryptionCode,
  generateSalt,
  isEncryptedValue,
  toBase64,
  unwrapDataKey,
  wrapDataKey,
} from "../lib/noteEncryption";
import { supabase } from "../lib/supabase.js";

// "checking"  — haven't yet determined if encryption is configured
// "disabled"  — never set up (no enc_data_key in DB)
// "locked"    — configured but data key not in memory (browser closed / session expired)
// "unlocked"  — data key in memory, ready to encrypt / decrypt
export type EncryptionStatus = "checking" | "disabled" | "locked" | "unlocked";

export type UnlockResult = "unlocked" | "no_key" | "wrong_code";

interface EncryptionContextType {
  status: EncryptionStatus;
  /** The 4-word code shown once after first setup / regeneration. Cleared when user acknowledges. */
  pendingCode: string | null;
  clearPendingCode: () => void;
  checkStatus: () => Promise<void>;
  /** First-time setup. Generates a code + data key, wraps the data key under the code, saves to DB. */
  setupEncryption: () => Promise<void>;
  /** The only way to unlock: the 4-word code. There is deliberately no
   *  password-based path — the login password authenticates the account,
   *  the code is what actually protects the notes, and those two secrets
   *  must stay independent or the code adds nothing. */
  unlockWithCode: (code: string) => Promise<UnlockResult>;
  /** Issues a brand new 4-word code (e.g. the old one was lost). Requires the
   *  *current* code to prove ownership, then re-wraps the existing data key
   *  under the new code — every note encrypted under the old code stays
   *  readable, only the code itself changes. Returns false if the current
   *  code is wrong. */
  regenerateCode: (currentCode: string) => Promise<boolean>;
  encryptNote: (content: string) => Promise<{ iv: string; ciphertext: string }>;
  decryptNote: (ciphertext: string, iv: string) => Promise<string>;
  /** Encrypts a PII string to JSON {c, iv} — idempotent if already encrypted. */
  encryptPII: (value: string) => Promise<string>;
  /** Decrypts a PII JSON {c, iv} string back to plaintext. Pass-through if plaintext. */
  decryptPII: (value: string) => Promise<string>;
}

const EncryptionContext = createContext<EncryptionContextType | null>(null);

const SESSION_KEY = "enc_dk";

type EncSettings = {
  enc_data_key: string | null;
  enc_data_key_salt: string | null;
  enc_data_key_iv: string | null;
};

async function saveKeyToSession(dataKey: CryptoKey) {
  const raw = await crypto.subtle.exportKey("raw", dataKey);
  sessionStorage.setItem(SESSION_KEY, toBase64(raw));
}

async function loadKeyFromSession(): Promise<CryptoKey | null> {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    const raw = fromBase64(stored);
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const dataKeyRef = useRef<CryptoKey | null>(null);
  const [status, setStatus] = useState<EncryptionStatus>("checking");
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const clearPendingCode = useCallback(() => setPendingCode(null), []);

  // Never calls supabase.auth.getUser(): that's a network round-trip to
  // /auth/v1/user, and supabase-js holds the sb-<ref>-auth-token lock across
  // it. Behind a slow auth server that starved concurrent signInWithPassword
  // calls of the same lock — sign-in appeared to hang with no request ever
  // leaving the browser. The onAuthStateChange handler already has the
  // session, so it passes the id straight in; everything else reads the
  // stored session (getSession — local, no network).
  const fetchSettings = useCallback(async (userId?: string): Promise<EncSettings | null> => {
    let uid = userId;
    if (!uid) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      uid = session?.user?.id;
    }
    if (!uid) return null;
    const { data } = await supabase
      .from("practice_settings")
      .select("enc_data_key, enc_data_key_salt, enc_data_key_iv")
      .eq("admin_id", uid)
      .maybeSingle();
    return data as EncSettings | null;
  }, []);

  const checkStatus = useCallback(async () => {
    const settings = await fetchSettings();
    setStatus(settings?.enc_data_key ? "locked" : "disabled");
  }, [fetchSettings]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Deferred via setTimeout AND never calls a supabase.auth.* method
      // in here (fetchSettings is passed session.user.id so it doesn't):
      // onAuthStateChange fires while supabase-js's internal session lock is
      // still held for the event being processed, and that lock isn't
      // released until this callback returns. A nested auth call that needs
      // the same lock then waits on a release that can't happen until it
      // itself returns — a real deadlock (seen as `status` stuck on
      // "checking" forever, nothing rejecting), and, when the nested call
      // was getUser() against a slow server, it held the lock long enough to
      // starve a concurrent signInWithPassword so sign-in hung with no
      // request sent. setTimeout(…, 0) escapes the lock for the practice_settings
      // read; using the handed-in id keeps auth entirely out of the path.
      setTimeout(async () => {
        try {
          if (event === "SIGNED_OUT") {
            sessionStorage.removeItem(SESSION_KEY);
            dataKeyRef.current = null;
            setStatus("checking");
          } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
            // INITIAL_SESSION fires once for every new listener, including
            // with session === null on a fresh page load before any login
            // has happened yet — that's not "encryption is disabled", it's
            // "there's no user to have a status yet". Treating it as
            // "disabled" produced a real, reproducible flash of "Not
            // encrypted" in the UI on login before the real SIGNED_IN event
            // (moments later, with the actual session) corrected it.
            if (!session?.user) return;
            const sessionKey = await loadKeyFromSession();
            if (sessionKey) {
              dataKeyRef.current = sessionKey;
              setStatus("unlocked");
            } else {
              const settings = await fetchSettings(session.user.id);
              setStatus(settings?.enc_data_key ? "locked" : "disabled");
            }
          }
        } catch (err) {
          // Multiple tabs open can cause supabase-js's cross-tab auth lock to
          // get stolen from this one (AbortError) — without this catch, the
          // rejection was never handled and status stayed stuck on
          // "checking" forever.
          console.error("Encryption status update failed:", err);
          setStatus("checking");
        }
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, [fetchSettings]);

  const setupEncryption = useCallback(async (): Promise<void> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) throw new Error("Not authenticated");

    const code = generateEncryptionCode();
    const dataKey = await generateDataKey();

    const dataKeySalt = generateSalt();
    const codeKEK = await deriveKEK(code, dataKeySalt);
    const { iv: dataKeyIv, wrapped: dataKeyWrapped } = await wrapDataKey(dataKey, codeKEK);

    const { error } = await supabase.from("practice_settings").upsert(
      {
        admin_id: user.id,
        enc_data_key: dataKeyWrapped,
        enc_data_key_salt: toBase64(dataKeySalt.buffer as ArrayBuffer),
        enc_data_key_iv: dataKeyIv,
      },
      { onConflict: "admin_id" },
    );
    if (error) throw new Error(error.message);

    const verify = await fetchSettings();
    if (!verify?.enc_data_key) {
      throw new Error("Encryption setup did not persist — check RLS on practice_settings.");
    }

    dataKeyRef.current = dataKey;
    await saveKeyToSession(dataKey);
    setStatus("unlocked");
    setPendingCode(code);
  }, [fetchSettings]);

  const unlockWithCode = useCallback(
    async (code: string): Promise<UnlockResult> => {
      const settings = await fetchSettings();
      if (!settings?.enc_data_key) {
        setStatus("disabled");
        return "no_key";
      }
      try {
        // biome-ignore lint/style/noNonNullAssertion: enc_data_key_salt/iv are always set together with enc_data_key (checked above) — same encryption-setup write
        const codeKEK = await deriveKEK(code.trim(), fromBase64(settings.enc_data_key_salt!));
        // biome-ignore lint/style/noNonNullAssertion: enc_data_key_salt/iv are always set together with enc_data_key (checked above) — same encryption-setup write
        const dataKey = await unwrapDataKey(settings.enc_data_key, settings.enc_data_key_iv!, codeKEK);
        dataKeyRef.current = dataKey;
        await saveKeyToSession(dataKey);
        setStatus("unlocked");
        return "unlocked";
      } catch {
        return "wrong_code";
      }
    },
    [fetchSettings],
  );

  const regenerateCode = useCallback(
    async (currentCode: string): Promise<boolean> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return false;
      const settings = await fetchSettings(user.id);
      if (!settings?.enc_data_key) return false;

      let dataKey: CryptoKey;
      try {
        // Unwrapping with the current code both verifies it and recovers the
        // data key so it can be re-wrapped under the new code, not
        // regenerated (that would orphan every note already encrypted
        // under the old one).
        // biome-ignore lint/style/noNonNullAssertion: enc_data_key_salt/iv are always set together with enc_data_key (checked above) — same encryption-setup write
        const currentCodeKEK = await deriveKEK(currentCode.trim(), fromBase64(settings.enc_data_key_salt!));
        // biome-ignore lint/style/noNonNullAssertion: enc_data_key_salt/iv are always set together with enc_data_key (checked above) — same encryption-setup write
        dataKey = await unwrapDataKey(settings.enc_data_key, settings.enc_data_key_iv!, currentCodeKEK);
      } catch {
        return false;
      }

      const newCode = generateEncryptionCode();
      const dataKeySalt = generateSalt();
      const newCodeKEK = await deriveKEK(newCode, dataKeySalt);
      const { iv: dataKeyIv, wrapped: dataKeyWrapped } = await wrapDataKey(dataKey, newCodeKEK);

      const { error } = await supabase
        .from("practice_settings")
        .update({
          enc_data_key: dataKeyWrapped,
          enc_data_key_salt: toBase64(dataKeySalt.buffer as ArrayBuffer),
          enc_data_key_iv: dataKeyIv,
        })
        .eq("admin_id", user.id);
      if (error) return false;

      dataKeyRef.current = dataKey;
      await saveKeyToSession(dataKey);
      setStatus("unlocked");
      setPendingCode(newCode);
      return true;
    },
    [fetchSettings],
  );

  const encryptNote = useCallback(async (content: string) => {
    if (!dataKeyRef.current) throw new Error("Notes are locked.");
    return cryptoEncrypt(content, dataKeyRef.current);
  }, []);

  const decryptNote = useCallback(async (ciphertext: string, iv: string) => {
    if (!dataKeyRef.current) throw new Error("Notes are locked.");
    return cryptoDecrypt(ciphertext, iv, dataKeyRef.current);
  }, []);

  const encryptPII = useCallback(async (value: string): Promise<string> => {
    if (!dataKeyRef.current || !value) return value;
    if (isEncryptedValue(value)) return value;
    const { iv, ciphertext } = await cryptoEncrypt(value, dataKeyRef.current);
    return JSON.stringify({ c: ciphertext, iv });
  }, []);

  const decryptPII = useCallback(async (value: string): Promise<string> => {
    if (!dataKeyRef.current || !value) return value;
    if (!isEncryptedValue(value)) return value;
    try {
      const { c, iv } = JSON.parse(value);
      return await cryptoDecrypt(c, iv, dataKeyRef.current);
    } catch {
      return value;
    }
  }, []);

  return (
    <EncryptionContext.Provider
      value={{
        status,
        pendingCode,
        clearPendingCode,
        checkStatus,
        setupEncryption,
        unlockWithCode,
        regenerateCode,
        encryptNote,
        decryptNote,
        encryptPII,
        decryptPII,
      }}
    >
      {children}
    </EncryptionContext.Provider>
  );
}

export function useEncryption() {
  const ctx = useContext(EncryptionContext);
  if (!ctx) throw new Error("useEncryption must be used within EncryptionProvider");
  return ctx;
}
