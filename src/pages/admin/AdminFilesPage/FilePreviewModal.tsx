import { useEffect, useState } from "react";

import { formatBytes, isPreviewable } from "@Helpers/fileTypes";
import Modal from "@components/shared/Modal/Modal";
import PdfViewer from "@components/shared/PdfViewer/PdfViewer";
import Spinner from "@components/shared/Spinner/Spinner";
import type { FileObject } from "@models/files";

import { supabase } from "@/lib/supabase";

import styles from "./AdminFilesPage.module.scss";

// Private bucket — every view needs a short-lived signed URL.
export default function FilePreviewModal({ file, onClose }: { file: FileObject; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const kind = isPreviewable(file.mime_type);

  useEffect(() => {
    let alive = true;
    supabase.storage
      .from("practice-files")
      .createSignedUrl(file.storage_path, 300)
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e || !data?.signedUrl) setError(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [file.storage_path]);

  return (
    <Modal title={file.name} onClose={onClose} size={kind === "pdf" ? "full" : "lg"}>
      {error && <p className={styles.previewFallback}>Couldn't load this file. Try again in a moment.</p>}
      {!error && !url && (
        <div className={styles.previewFallback}>
          <Spinner />
        </div>
      )}
      {url && kind === "pdf" && <PdfViewer url={url} title={file.name} />}
      {url && kind === "image" && <img src={url} alt={file.name} className={styles.previewImg} />}
      {url && kind === null && (
        <p className={styles.previewFallback}>
          This file type can't be previewed here.
          <br />
          <a href={url} target="_blank" rel="noreferrer">
            Download {file.name}
          </a>{" "}
          ({formatBytes(file.size_bytes)})
        </p>
      )}
    </Modal>
  );
}
