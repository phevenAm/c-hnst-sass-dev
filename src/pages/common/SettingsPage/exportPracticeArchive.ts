import { supabase } from "@lib/supabase";

export async function exportPracticeArchive(
  adminId: string,
  encryptionStatus: string,
  decryptNote: (content: string, iv: string) => Promise<string>,
): Promise<string> {
  const decrypted_notes: Record<string, string> = {};

  if (encryptionStatus === "unlocked") {
    try {
      const { data: rows } = await supabase
        .from("session_notes")
        .select("id, content, note_iv, is_encrypted")
        .eq("admin_id", adminId);
      for (const note of rows ?? []) {
        if (!note.is_encrypted || !note.note_iv) continue;
        try {
          decrypted_notes[note.id] = await decryptNote(note.content, note.note_iv);
        } catch {
          // Leave notes that cannot be decrypted as placeholders.
        }
      }
    } catch {
      // The export still contains all other data if notes cannot be loaded.
    }
  }

  const { data, error } = await supabase.functions.invoke("export-practice-archive", {
    body: { decrypted_notes },
  });
  if (error || !data?.data_base64) throw error ?? new Error("No export data returned");

  const filename = data.filename ?? "clarity-export.zip";
  const bin = atob(data.data_base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}
