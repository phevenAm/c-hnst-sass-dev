import { useRef, useState } from "react";

import { supabase } from "@lib/supabase";

import styles from "./PdfUpload.module.scss";

interface Props {
  adminId: string;
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  /**
   * When set, the PDF lives at a fixed path (`<adminId>/<pathKey>.pdf`) and
   * every upload overwrites it in place — use this for a PDF that belongs to
   * one specific thing (a practice's consent document, an agency's working
   * agreement) so replaced versions don't pile up in the bucket.
   *
   * Without it, each upload gets a unique name (fine for per-row files like an
   * expense receipt), but the previously-referenced file is still deleted on
   * replace / remove so nothing is orphaned.
   */
  pathKey?: string;
}

// Storage costs for PDFs are negligible at this scale — the cap here is
// about keeping uploads snappy and avoiding a stray 80MB scan landing in
// the bucket, not cost control.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(-80);
}

/** The storage object path inside `bucket` for a public URL it produced, or
 *  null if the URL doesn't point at this bucket (e.g. an externally-hosted PDF
 *  someone pasted in before uploads existed). */
function storagePathForBucket(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

export default function PdfUpload({ adminId, value, onChange, bucket = "documents", pathKey }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const removeFromStorage = async (url: string) => {
    const path = storagePathForBucket(url, bucket);
    if (path)
      await supabase.storage
        .from(bucket)
        .remove([path])
        .then(undefined, () => {});
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("PDF is too large — please choose one under 5MB.");
      return;
    }
    setUploading(true);
    try {
      const prevUrl = value;
      const path = pathKey
        ? `${adminId}/${sanitizeFilename(pathKey)}.pdf`
        : `${adminId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: "application/pdf", upsert: !!pathKey });
      if (uploadError) throw uploadError;

      // Drop the file this one replaces, unless we just overwrote it in place.
      const prevPath = prevUrl ? storagePathForBucket(prevUrl, bucket) : null;
      if (prevPath && prevPath !== path) await removeFromStorage(prevUrl);

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      // A fixed pathKey means getPublicUrl returns the identical string every
      // time — callers' <a href>/PdfViewer would keep showing the old file
      // until the CDN/browser cache expired. Bust it.
      onChange(pathKey ? `${data.publicUrl}?v=${Date.now()}` : data.publicUrl);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (value) await removeFromStorage(value);
    onChange("");
  };

  let buttonLabel = "Upload a PDF";
  if (uploading) buttonLabel = "Uploading…";
  else if (value) buttonLabel = "Replace PDF";

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <button type="button" className={styles.btn} disabled={uploading} onClick={() => inputRef.current?.click()}>
          {buttonLabel}
        </button>
        {value && (
          <>
            <a href={value} target="_blank" rel="noreferrer" className={styles.viewLink}>
              View current file
            </a>
            <button type="button" className={styles.removeBtn} onClick={() => void handleRemove()}>
              Remove
            </button>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className={styles.hidden}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <p className={styles.error}>{error}</p>}
      <p className={styles.hint}>PDF, up to 5MB.</p>
    </div>
  );
}

export { storagePathForBucket };
