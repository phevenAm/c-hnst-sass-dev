import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import {
  decryptNote as cryptoDecrypt,
  encryptNote as cryptoEncrypt,
  deriveKEK,
  fromBase64,
  generateDataKey,
  generateRecoveryCode,
  generateSalt,
  toBase64,
  unwrapDataKey,
  wrapDataKey,
} from "../lib/noteEncryption";
import { supabase } from "../lib/supabase.js";

// "checking"       — haven't yet determined if encryption is configured
// "disabled"       — no encryption set up for this practice
// "locked"         — configured but data key not in memory (browser closed, session persisted)
// "unlocked"       — data key in memory, ready to encrypt / decrypt
// "needs_recovery" — password was reset via email; old KEK no longer matches
export type EncryptionStatus = "checking" | "disabled" | "locked" | "unlocked" | "needs_recovery";

export type UnlockResult = "unlocked" | "no_key" | "wrong_password";

interface EncryptionContextType {
  status: EncryptionStatus;
  /** Set up encryption for the first time using the admin's login password. */
  setupEncryption: (password: string) => Promise<string>;
  /** Unlock using the admin's login password. Returns result string so callers know which case occurred. */
  unlockEncryption: (password: string) => Promise<UnlockResult>;
  /** Re-derive keys from a recovery code + new password after an email password reset. */
  recoverWithCode: (recoveryCode: string, newPassword: string) => Promise<boolean>;
  /** Re-wrap data key under a new password KEK (called from change-password flow). */
  rotateKey: (oldPassword: string, newPassword: string) => Promise<void>;
  /** Set status without needing a password — for resolving "checking" state. */
  checkStatus: () => Promise<void>;
  /** One-time recovery code shown after first setup. Null after the user acknowledges it. */
  pendingRecoveryCode: string | null;
  clearPendingRecoveryCode: () => void;
  encryptNote: (content: string) => Promise<{ iv: string; ciphertext: string }>;
  decryptNote: (ciphertext: string, iv: string) => Promise<string>;
}

const EncryptionContext = createContext<EncryptionContextType | null>(null);

const SESSION_KEY = "enc_dk";

type EncSettings = {
  note_enc_key: string | null;
  note_enc_salt: string | null;
  note_enc_key_iv: string | null;
  note_enc_rec_key: string | null;
  note_enc_rec_iv: string | null;
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
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState<string | null>(null);

  const clearPendingRecoveryCode = useCallback(() => setPendingRecoveryCode(null), []);

  const fetchSettings = useCallback(async (): Promise<EncSettings | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("practice_settings")
      .select("note_enc_key, note_enc_salt, note_enc_key_iv, note_enc_rec_key, note_enc_rec_iv")
      .eq("admin_id", user.id)
      .maybeSingle();
    return data as EncSettings | null;
  }, []);

  const checkStatus = useCallback(async () => {
    const settings = await fetchSettings();
    setStatus(settings?.note_enc_key ? "locked" : "disabled");
  }, [fetchSettings]);

  // INITIAL_SESSION: page load with cached session — restore key from sessionStorage or set locked/disabled.
  // SIGNED_IN is intentionally NOT handled here — status is set by LoginPage after signIn resolves,
  // which avoids a race condition where this handler overwrites "unlocked" back to "disabled".
  // SIGNED_OUT: wipe everything.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        sessionStorage.removeItem(SESSION_KEY);
        dataKeyRef.current = null;
        setStatus("checking");
      } else if (event === "SIGNED_IN") {
        // Fresh login — restore from sessionStorage if handleSubmit already saved the key.
        // Do NOT fall back to locked/disabled here; that would race with setupEncryption.
        const sessionKey = await loadKeyFromSession();
        if (sessionKey) {
          dataKeyRef.current = sessionKey;
          setStatus("unlocked");
        }
      } else if (event === "INITIAL_SESSION") {
        const sessionKey = await loadKeyFromSession();
        if (sessionKey) {
          dataKeyRef.current = sessionKey;
          setStatus("unlocked");
        } else {
          const settings = await fetchSettings();
          setStatus(settings?.note_enc_key ? "locked" : "disabled");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchSettings]);

  const setupEncryption = useCallback(async (password: string): Promise<string> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const salt = generateSalt();
    const dataKey = await generateDataKey();

    const kek = await deriveKEK(password, salt);
    const { iv, wrapped } = await wrapDataKey(dataKey, kek);

    const recoveryCode = generateRecoveryCode();
    const recoveryKEK = await deriveKEK(recoveryCode.replace(/-/g, ""), salt);
    const { iv: recIv, wrapped: recWrapped } = await wrapDataKey(dataKey, recoveryKEK);

    const { error } = await supabase.from("practice_settings").upsert(
      {
        admin_id: user.id,
        note_enc_key: wrapped,
        note_enc_salt: toBase64(salt.buffer as ArrayBuffer),
        note_enc_key_iv: iv,
        note_enc_rec_key: recWrapped,
        note_enc_rec_iv: recIv,
      },
      { onConflict: "admin_id" },
    );
    if (error) throw new Error(error.message);

    // Verify the key actually landed in the DB — a silent upsert failure would
    // leave note_enc_key null, causing the "new recovery code every login" loop.
    const verify = await fetchSettings();
    if (!verify?.note_enc_key) throw new Error("Encryption key did not persist — check RLS on practice_settings.");

    dataKeyRef.current = dataKey;
    await saveKeyToSession(dataKey);
    setStatus("unlocked");
    setPendingRecoveryCode(recoveryCode);
    return recoveryCode;
  }, []);

  const unlockEncryption = useCallback(
    async (password: string): Promise<UnlockResult> => {
      const settings = await fetchSettings();
      if (!settings?.note_enc_key) {
        setStatus("disabled");
        return "no_key";
      }
      try {
        const salt = fromBase64(settings.note_enc_salt!);
        const kek = await deriveKEK(password, salt);
        const dataKey = await unwrapDataKey(settings.note_enc_key, settings.note_enc_key_iv!, kek);
        dataKeyRef.current = dataKey;
        await saveKeyToSession(dataKey);
        setStatus("unlocked");
        return "unlocked";
      } catch {
        setStatus("needs_recovery");
        return "wrong_password";
      }
    },
    [fetchSettings],
  );

  const recoverWithCode = useCallback(
    async (recoveryCode: string, newPassword: string): Promise<boolean> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;
      const settings = await fetchSettings();
      if (!settings?.note_enc_rec_key) return false;
      try {
        const salt = fromBase64(settings.note_enc_salt!);
        const rawCode = recoveryCode.replace(/-/g, "");
        const recoveryKEK = await deriveKEK(rawCode, salt);
        const dataKey = await unwrapDataKey(settings.note_enc_rec_key, settings.note_enc_rec_iv!, recoveryKEK);

        const newKEK = await deriveKEK(newPassword, salt);
        const { iv, wrapped } = await wrapDataKey(dataKey, newKEK);
        await supabase
          .from("practice_settings")
          .update({ note_enc_key: wrapped, note_enc_key_iv: iv })
          .eq("admin_id", user.id);

        dataKeyRef.current = dataKey;
        await saveKeyToSession(dataKey);
        setStatus("unlocked");
        return true;
      } catch {
        return false;
      }
    },
    [fetchSettings],
  );

  const rotateKey = useCallback(
    async (oldPassword: string, newPassword: string): Promise<void> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const settings = await fetchSettings();
      if (!settings?.note_enc_key) return;

      const salt = fromBase64(settings.note_enc_salt!);
      const oldKEK = await deriveKEK(oldPassword, salt);
      const dataKey = await unwrapDataKey(settings.note_enc_key, settings.note_enc_key_iv!, oldKEK);

      const newKEK = await deriveKEK(newPassword, salt);
      const { iv, wrapped } = await wrapDataKey(dataKey, newKEK);
      await supabase
        .from("practice_settings")
        .update({ note_enc_key: wrapped, note_enc_key_iv: iv })
        .eq("admin_id", user.id);

      dataKeyRef.current = dataKey;
      await saveKeyToSession(dataKey);
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

  return (
    <EncryptionContext.Provider
      value={{
        status,
        setupEncryption,
        unlockEncryption,
        recoverWithCode,
        rotateKey,
        checkStatus,
        pendingRecoveryCode,
        clearPendingRecoveryCode,
        encryptNote,
        decryptNote,
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
