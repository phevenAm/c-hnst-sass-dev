import { useMemo } from "react";

import { breadcrumbFor, formatBytes } from "@Helpers/fileTypes";
import { FileGenericIcon, FolderIcon, ImageFileIcon } from "@components/shared/Icons/Icons";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import type { FileFolder, FileObject } from "@models/files";

import styles from "./AdminFilesPage.module.scss";

type Props = {
  folders: FileFolder[];
  objects: FileObject[];
  currentFolderId: string | null;
  onNavigate: (id: string | null) => void;
  onOpenFile: (file: FileObject) => void;
  onDownloadFile: (file: FileObject) => void;
  onRenameFolder: (folder: FileFolder) => void;
  onMoveFolder: (folder: FileFolder) => void;
  onDeleteFolder: (folder: FileFolder) => void;
  onRenameFile: (file: FileObject) => void;
  onMoveFile: (file: FileObject) => void;
  onDeleteFile: (file: FileObject) => void;
};

export default function FileBrowser({
  folders,
  objects,
  currentFolderId,
  onNavigate,
  onOpenFile,
  onDownloadFile,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onRenameFile,
  onMoveFile,
  onDeleteFile,
}: Props) {
  const crumbs = useMemo(() => breadcrumbFor(currentFolderId, folders), [currentFolderId, folders]);
  const childFolders = useMemo(
    () => folders.filter((f) => f.parent_id === currentFolderId).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId],
  );
  const files = useMemo(
    () => objects.filter((o) => o.folder_id === currentFolderId).sort((a, b) => a.name.localeCompare(b.name)),
    [objects, currentFolderId],
  );

  const empty = childFolders.length === 0 && files.length === 0;

  return (
    <>
      <nav className={styles.crumbs} aria-label="Folder path">
        <button
          type="button"
          className={styles.crumb}
          disabled={currentFolderId === null}
          onClick={() => onNavigate(null)}
        >
          All files
        </button>
        {crumbs.map((c, i) => (
          <span key={c.id} style={{ display: "contents" }}>
            <span className={styles.crumbSep}>/</span>
            <button
              type="button"
              className={styles.crumb}
              disabled={i === crumbs.length - 1}
              onClick={() => onNavigate(c.id)}
            >
              {c.name}
            </button>
          </span>
        ))}
      </nav>

      {empty && (
        <div className={styles.empty}>
          <p>This folder is empty. Drop files or a folder here, or use the buttons above.</p>
          <p className={styles.emptyHint}>
            Accepts PDFs, images (PNG, JPEG, WebP, GIF) and Word documents (.doc, .docx), up to 25&nbsp;MB each. A .zip
            is unpacked into folders automatically. No video or other file types.
          </p>
        </div>
      )}

      <ul className={styles.list}>
        {childFolders.map((folder) => (
          <li key={folder.id} className={styles.item}>
            <button type="button" className={styles.itemMain} onClick={() => onNavigate(folder.id)}>
              <span className={styles.itemIcon}>
                <FolderIcon />
              </span>
              <span className={styles.itemName}>{folder.name}</span>
            </button>
            <SplitButton
              size="sm"
              variant="ghost"
              primaryLabel="Open"
              primaryAction={() => onNavigate(folder.id)}
              options={[
                { label: "Rename", onClick: () => onRenameFolder(folder) },
                { label: "Move", onClick: () => onMoveFolder(folder) },
                { label: "Delete", onClick: () => onDeleteFolder(folder) },
              ]}
            />
          </li>
        ))}

        {files.map((file) => (
          <li key={file.id} className={styles.item}>
            <button type="button" className={styles.itemMain} onClick={() => onOpenFile(file)}>
              <span className={styles.itemIcon}>
                {file.mime_type.startsWith("image/") ? <ImageFileIcon /> : <FileGenericIcon />}
              </span>
              <span className={styles.itemName}>{file.name}</span>
            </button>
            <span className={styles.itemMeta}>{formatBytes(file.size_bytes)}</span>
            <SplitButton
              size="sm"
              variant="ghost"
              primaryLabel="Preview"
              primaryAction={() => onOpenFile(file)}
              options={[
                { label: "Download", onClick: () => onDownloadFile(file) },
                { label: "Rename", onClick: () => onRenameFile(file) },
                { label: "Move", onClick: () => onMoveFile(file) },
                { label: "Delete", onClick: () => onDeleteFile(file) },
              ]}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
