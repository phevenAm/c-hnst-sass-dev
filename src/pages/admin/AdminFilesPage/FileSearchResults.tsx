import { useMemo } from "react";

import { breadcrumbFor, formatBytes } from "@Helpers/fileTypes";
import { FileGenericIcon, FolderIcon, ImageFileIcon } from "@components/shared/Icons/Icons";
import type { FileFolder, FileObject } from "@models/files";

import styles from "./AdminFilesPage.module.scss";

type Props = {
  query: string;
  folders: FileFolder[];
  objects: FileObject[];
  onOpenFolder: (id: string) => void;
  onOpenFile: (file: FileObject) => void;
};

const LIMIT = 60;

export default function FileSearchResults({ query, folders, objects, onOpenFolder, onOpenFile }: Props) {
  const q = query.trim().toLowerCase();

  const { folderHits, fileHits } = useMemo(() => {
    const fh = folders.filter((f) => f.name.toLowerCase().includes(q)).slice(0, LIMIT);
    const oh = objects.filter((o) => o.name.toLowerCase().includes(q)).slice(0, LIMIT);
    return { folderHits: fh, fileHits: oh };
  }, [q, folders, objects]);

  const pathOf = (folderId: string | null) => {
    const chain = breadcrumbFor(folderId, folders);
    return chain.length ? `All files / ${chain.map((f) => f.name).join(" / ")}` : "All files";
  };

  const total = folderHits.length + fileHits.length;

  return (
    <>
      <p className={styles.searchSummary}>
        {total === 0
          ? `No matches for “${query.trim()}”`
          : `${total} match${total === 1 ? "" : "es"} for “${query.trim()}”`}
      </p>

      <ul className={styles.list}>
        {folderHits.map((folder) => (
          <li key={`f-${folder.id}`} className={styles.item}>
            <button type="button" className={styles.itemMain} onClick={() => onOpenFolder(folder.id)}>
              <span className={styles.itemIcon}>
                <FolderIcon />
              </span>
              <span className={styles.itemNameCol}>
                <span className={styles.itemName}>{folder.name}</span>
                <span className={styles.itemPath}>{folder.parent_id ? pathOf(folder.parent_id) : "All files"}</span>
              </span>
            </button>
          </li>
        ))}

        {fileHits.map((file) => (
          <li key={`o-${file.id}`} className={styles.item}>
            <button type="button" className={styles.itemMain} onClick={() => onOpenFile(file)}>
              <span className={styles.itemIcon}>
                {file.mime_type.startsWith("image/") ? <ImageFileIcon /> : <FileGenericIcon />}
              </span>
              <span className={styles.itemNameCol}>
                <span className={styles.itemName}>{file.name}</span>
                <span className={styles.itemPath}>{pathOf(file.folder_id)}</span>
              </span>
            </button>
            <span className={styles.itemMeta}>{formatBytes(file.size_bytes)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
