import { useRef, useState } from "react";

import { supabase } from "@lib/supabase";

import styles from "./UploadAndDisplayImage.module.scss";

interface Props {
  userId: string;
  onUpload: (url: string) => void;
  bucket?: string;
}

// Guards against the browser hanging trying to decode a pathologically large
// file into an <img>/canvas before compression even gets a chance to shrink
// it — compression only runs after this check passes.
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", 0.8);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function UploadAndDisplayImage({ userId, onUpload, bucket = "avatars" }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Image is too large — please choose one under 2MB.");
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${userId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      // path is fixed per user, so getPublicUrl returns the exact same string
      // on every re-upload — without a cache-busting param, callers' <img
      // src> never changes and the browser (or React's DOM diff) never
      // re-fetches, so the old photo just keeps showing.
      onUpload(`${data.publicUrl}?t=${Date.now()}`);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <button type="button" className={styles.btn} disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? "Uploading…" : "Upload photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.hidden}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
