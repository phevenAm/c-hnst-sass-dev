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
// "disabled"  — never set up (no enc_code_wrapped in DB)
// "locked"    — configured but data key not in memory (browser closed / session expired)
// "unlocked"  — data key in memory, ready to encrypt / decrypt
export type EncryptionStatus = "checking" | "disabled" | "locked" | "unlocked";

export type UnlockResult = "unlocked" | "no_key" | "wrong_password";

interface EncryptionContextType {
  status: EncryptionStatus;
  /** The 4-word code shown once after first setup. Cleared when user acknowledges. */
  pendingCode: string | null;
  clearPendingCode: () => void;
  checkStatus: () => Promise<void>;
  /** First-time setup. Generates code + data key, wraps both, saves to DB. */
  setupEncryption: (password: string) => Promise<void>;
  /** Daily unlock: password → decrypt code → decrypt data key. */
  unlockWithPassword: (password: string) => Promise<UnlockResult>;
  /** Unlock via code (e.g. after email password reset). Re-wraps code under currentPassword. */
  relinkWithCode: (code: string, currentPassword: string) => Promise<boolean>;
  /** Change password: re-wraps code under new password. Data key untouched. */
  rotatePassword: (oldPassword: string, newPassword: string) => Promise<void>;
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
  enc_code_wrapped: string | null;
  enc_code_salt: string | null;
  enc_code_iv: string | null;
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

  const fetchSettings = useCallback(async (): Promise<EncSettings | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("practice_settings")
      .select("enc_code_wrapped, enc_code_salt, enc_code_iv, enc_data_key, enc_data_key_salt, enc_data_key_iv")
      .eq("admin_id", user.id)
      .maybeSingle();
    return data as EncSettings | null;
  }, []);

  const checkStatus = useCallback(async () => {
    const settings = await fetchSettings();
    setStatus(settings?.enc_code_wrapped ? "locked" : "disabled");
  }, [fetchSettings]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        sessionStorage.removeItem(SESSION_KEY);
        dataKeyRef.current = null;
        setStatus("checking");
      } else if (event === "SIGNED_IN") {
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
          setStatus(settings?.enc_code_wrapped ? "locked" : "disabled");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchSettings]);

  const setupEncryption = useCallback(
    async (password: string): Promise<void> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const code = generateEncryptionCode();
      const dataKey = await generateDataKey();

      // Layer 1: wrap data key with code-derived KEK
      const dataKeySalt = generateSalt();
      const codeKEK = await deriveKEK(code, dataKeySalt);
      const { iv: dataKeyIv, wrapped: dataKeyWrapped } = await wrapDataKey(dataKey, codeKEK);

      // Layer 2: encrypt the code with password-derived KEK
      const codeSalt = generateSalt();
      const pwKEK = await deriveKEK(password, codeSalt);
      const { iv: codeIv, ciphertext: codeWrapped } = await cryptoEncrypt(code, pwKEK);

      const { error } = await supabase.from("practice_settings").upsert(
        {
          admin_id: user.id,
          enc_code_wrapped: codeWrapped,
          enc_code_salt: toBase64(codeSalt.buffer as ArrayBuffer),
          enc_code_iv: codeIv,
          enc_data_key: dataKeyWrapped,
          enc_data_key_salt: toBase64(dataKeySalt.buffer as ArrayBuffer),
          enc_data_key_iv: dataKeyIv,
        },
        { onConflict: "admin_id" },
      );
      if (error) throw new Error(error.message);

      const verify = await fetchSettings();
      if (!verify?.enc_code_wrapped) {
        throw new Error("Encryption setup did not persist — check RLS on practice_settings.");
      }

      dataKeyRef.current = dataKey;
      await saveKeyToSession(dataKey);
      setStatus("unlocked");
      setPendingCode(code);
    },
    [fetchSettings],
  );

  const unlockWithPassword = useCallback(
    async (password: string): Promise<UnlockResult> => {
      const settings = await fetchSettings();
      if (!settings?.enc_code_wrapped) {
        setStatus("disabled");
        return "no_key";
      }
      try {
        const pwKEK = await deriveKEK(password, fromBase64(settings.enc_code_salt!));
        const code = await cryptoDecrypt(settings.enc_code_wrapped, settings.enc_code_iv!, pwKEK);
        const codeKEK = await deriveKEK(code, fromBase64(settings.enc_data_key_salt!));
        const dataKey = await unwrapDataKey(settings.enc_data_key!, settings.enc_data_key_iv!, codeKEK);
        dataKeyRef.current = dataKey;
        await saveKeyToSession(dataKey);
        setStatus("unlocked");
        return "unlocked";
      } catch {
        return "wrong_password";
      }
    },
    [fetchSettings],
  );

  const relinkWithCode = useCallback(
    async (code: string, currentPassword: string): Promise<boolean> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;
      const settings = await fetchSettings();
      if (!settings?.enc_data_key) return false;
      try {
        // Use the code to unlock the data key
        const codeKEK = await deriveKEK(code.trim(), fromBase64(settings.enc_data_key_salt!));
        const dataKey = await unwrapDataKey(settings.enc_data_key, settings.enc_data_key_iv!, codeKEK);

        // Re-wrap the code under the current password so future password unlocks work
        const newCodeSalt = generateSalt();
        const newPwKEK = await deriveKEK(currentPassword, newCodeSalt);
        const { iv: newCodeIv, ciphertext: newCodeWrapped } = await cryptoEncrypt(code.trim(), newPwKEK);

        await supabase
          .from("practice_settings")
          .update({
            enc_code_wrapped: newCodeWrapped,
            enc_code_salt: toBase64(newCodeSalt.buffer as ArrayBuffer),
            enc_code_iv: newCodeIv,
          })
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

  const rotatePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<void> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const settings = await fetchSettings();
      if (!settings?.enc_code_wrapped) return;

      // Decrypt the code with the old password, re-wrap with the new password
      const oldPwKEK = await deriveKEK(oldPassword, fromBase64(settings.enc_code_salt!));
      const code = await cryptoDecrypt(settings.enc_code_wrapped, settings.enc_code_iv!, oldPwKEK);

      const newSalt = generateSalt();
      const newPwKEK = await deriveKEK(newPassword, newSalt);
      const { iv: newIv, ciphertext: newWrapped } = await cryptoEncrypt(code, newPwKEK);

      await supabase
        .from("practice_settings")
        .update({
          enc_code_wrapped: newWrapped,
          enc_code_salt: toBase64(newSalt.buffer as ArrayBuffer),
          enc_code_iv: newIv,
        })
        .eq("admin_id", user.id);
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
        unlockWithPassword,
        relinkWithCode,
        rotatePassword,
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
