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

// "checking"      — haven't yet determined if encryption is configured
// "disabled"      — no encryption set up for this practice
// "locked"        — configured but data key not in memory (page refresh, etc.)
// "unlocked"      — data key in memory, ready to encrypt / decrypt
// "needs_recovery" — password was reset via email; old KEK no longer matches
export type EncryptionStatus = "checking" | "disabled" | "locked" | "unlocked" | "needs_recovery";

interface EncryptionContextType {
  status: EncryptionStatus;
  /** First-time setup. Returns the formatted recovery code to show the user once. */
  setupEncryption: (password: string) => Promise<string>;
  /** Called from LoginPage after signIn succeeds. Derives KEK, unwraps data key. */
  unlockEncryption: (password: string) => Promise<boolean>;
  /** Called when the user has a recovery code and a new password (after email reset). */
  recoverWithCode: (recoveryCode: string, newPassword: string) => Promise<boolean>;
  /** Called from ChangePasswordModal. Re-wraps data key under new password KEK. */
  rotateKey: (oldPassword: string, newPassword: string) => Promise<void>;
  encryptNote: (content: string) => Promise<{ iv: string; ciphertext: string }>;
  decryptNote: (ciphertext: string, iv: string) => Promise<string>;
}

const EncryptionContext = createContext<EncryptionContextType | null>(null);

type EncSettings = {
  note_enc_key: string | null;
  note_enc_salt: string | null;
  note_enc_key_iv: string | null;
  note_enc_rec_key: string | null;
  note_enc_rec_iv: string | null;
};

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const dataKeyRef = useRef<CryptoKey | null>(null);
  const [status, setStatus] = useState<EncryptionStatus>("checking");

  // Wipe the in-memory key on sign-out.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        dataKeyRef.current = null;
        setStatus("checking");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchSettings = useCallback(async (): Promise<EncSettings | null> => {
    const { data } = await supabase
      .from("practice_settings")
      .select("note_enc_key, note_enc_salt, note_enc_key_iv, note_enc_rec_key, note_enc_rec_iv")
      .single();
    return data as EncSettings | null;
  }, []);

  const setupEncryption = useCallback(async (password: string): Promise<string> => {
    const salt = generateSalt();
    const dataKey = await generateDataKey();

    const kek = await deriveKEK(password, salt);
    const { iv, wrapped } = await wrapDataKey(dataKey, kek);

    const recoveryCode = generateRecoveryCode();
    const recoveryKEK = await deriveKEK(recoveryCode.replace(/-/g, ""), salt);
    const { iv: recIv, wrapped: recWrapped } = await wrapDataKey(dataKey, recoveryKEK);

    const { error } = await supabase.from("practice_settings").update({
      note_enc_key: wrapped,
      note_enc_salt: toBase64(salt.buffer as ArrayBuffer),
      note_enc_key_iv: iv,
      note_enc_rec_key: recWrapped,
      note_enc_rec_iv: recIv,
    });
    if (error) throw new Error(error.message);

    dataKeyRef.current = dataKey;
    setStatus("unlocked");
    return recoveryCode;
  }, []);

  const unlockEncryption = useCallback(
    async (password: string): Promise<boolean> => {
      const settings = await fetchSettings();
      if (!settings?.note_enc_key) {
        setStatus("disabled");
        return false;
      }
      try {
        const salt = fromBase64(settings.note_enc_salt!);
        const kek = await deriveKEK(password, salt);
        const dataKey = await unwrapDataKey(settings.note_enc_key, settings.note_enc_key_iv!, kek);
        dataKeyRef.current = dataKey;
        setStatus("unlocked");
        return true;
      } catch {
        // Decryption failed — password doesn't match stored KEK (e.g. after email reset)
        setStatus("needs_recovery");
        return false;
      }
    },
    [fetchSettings],
  );

  const recoverWithCode = useCallback(
    async (recoveryCode: string, newPassword: string): Promise<boolean> => {
      const settings = await fetchSettings();
      if (!settings?.note_enc_rec_key) return false;
      try {
        const salt = fromBase64(settings.note_enc_salt!);
        const rawCode = recoveryCode.replace(/-/g, "");
        const recoveryKEK = await deriveKEK(rawCode, salt);
        const dataKey = await unwrapDataKey(settings.note_enc_rec_key, settings.note_enc_rec_iv!, recoveryKEK);

        // Re-wrap with the new password so normal unlock works going forward
        const newKEK = await deriveKEK(newPassword, salt);
        const { iv, wrapped } = await wrapDataKey(dataKey, newKEK);
        await supabase.from("practice_settings").update({ note_enc_key: wrapped, note_enc_key_iv: iv });

        dataKeyRef.current = dataKey;
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
      const settings = await fetchSettings();
      if (!settings?.note_enc_key) return;

      const salt = fromBase64(settings.note_enc_salt!);
      const oldKEK = await deriveKEK(oldPassword, salt);
      const dataKey = await unwrapDataKey(settings.note_enc_key, settings.note_enc_key_iv!, oldKEK);

      const newKEK = await deriveKEK(newPassword, salt);
      const { iv, wrapped } = await wrapDataKey(dataKey, newKEK);
      await supabase.from("practice_settings").update({ note_enc_key: wrapped, note_enc_key_iv: iv });

      // Recovery copy stays valid — it's keyed to the recovery code, not the password
      dataKeyRef.current = dataKey;
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
