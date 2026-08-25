import { useRef, useState } from "react";

import { supabase } from "@lib/supabase";

import styles from "./PdfUpload.module.scss";

interface Props {
  adminId: string;
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
}

// Storage costs for PDFs are negligible at this scale — the cap here is
// about keeping uploads snappy and avoiding a stray 80MB scan landing in
// the bucket, not cost control.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(-80);
}

export default function PdfUpload({ adminId, value, onChange, bucket = "documents" }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const path = `${adminId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
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
            <button type="button" className={styles.removeBtn} onClick={() => onChange("")}>
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
