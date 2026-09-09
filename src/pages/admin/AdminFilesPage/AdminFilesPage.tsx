import { useRef, useState } from "react";

import Button from "@components/shared/Button/Button";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import { NewFolderIcon } from "@components/shared/Icons/Icons";
import Spinner from "@components/shared/Spinner/Spinner";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useToast } from "@context/ToastContext";
import type { FileFolder, FileObject } from "@models/files";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import {
  clearRejected,
  createFolder,
  deleteFile,
  deleteFolder,
  fetchFileTree,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  selectCurrentFolderId,
  selectFileFolders,
  selectFileObjects,
  selectFilesStatus,
  selectFilesUploadStatus,
  selectLastRejected,
  selectStorageReport,
  setCurrentFolder,
  uploadItems,
} from "@store/slices/filesSlice";

import { isFeatureEnabled } from "@/lib/featureFlags";
import { supabase } from "@/lib/supabase";
import FileBrowser from "./FileBrowser";
import FilePreviewModal from "./FilePreviewModal";
import FolderTree from "./FolderTree";
import MoveDialog from "./MoveDialog";
import NameDialog from "./NameDialog";
import StorageMeter from "./StorageMeter";
import UploadZone, { type UploadZoneHandle } from "./UploadZone";

import styles from "./AdminFilesPage.module.scss";

const FEATURE_ON = isFeatureEnabled("fileManager");

const NAME_DIALOG_TITLE = {
  newFolder: "New folder",
  renameFolder: "Rename folder",
  renameFile: "Rename file",
} as const;

type NameDialogState =
  | { mode: "newFolder" }
  | { mode: "renameFolder"; folder: FileFolder }
  | { mode: "renameFile"; file: FileObject }
  | null;

type MoveState = { kind: "folder"; folder: FileFolder } | { kind: "file"; file: FileObject } | null;
type DeleteState = { kind: "folder"; folder: FileFolder } | { kind: "file"; file: FileObject } | null;

export default function AdminFilesPage() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  useFetchOnIdle(selectFilesStatus, FEATURE_ON ? fetchFileTree : null, "Couldn't load your files");

  const folders = useAppSelector(selectFileFolders);
  const objects = useAppSelector(selectFileObjects);
  const status = useAppSelector(selectFilesStatus);
  const uploadStatus = useAppSelector(selectFilesUploadStatus);
  const report = useAppSelector(selectStorageReport);
  const rejected = useAppSelector(selectLastRejected);
  const currentFolderId = useAppSelector(selectCurrentFolderId);

  const zoneRef = useRef<UploadZoneHandle>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [move, setMove] = useState<MoveState>(null);
  const [del, setDel] = useState<DeleteState>(null);
  const [preview, setPreview] = useState<FileObject | null>(null);
  const [busy, setBusy] = useState(false);

  if (!FEATURE_ON) return null;

  const navigate = (id: string | null) => dispatch(setCurrentFolder(id));

  // Dispatch a thunk, unwrap it, toast the error. Returns whether it succeeded.
  const run = async (action: { unwrap: () => Promise<unknown> }, okMsg?: string): Promise<boolean> => {
    setBusy(true);
    try {
      await action.unwrap();
      if (okMsg) showToast(okMsg, "success");
      return true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "danger");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleName = async (name: string) => {
    if (!nameDialog) return;
    if (nameDialog.mode === "newFolder") {
      setBusy(true);
      try {
        const created = (await dispatch(createFolder({ parentId: currentFolderId, name })).unwrap()) as FileFolder;
        setNameDialog(null);
        navigate(created.id);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), "danger");
      } finally {
        setBusy(false);
      }
      return;
    }
    const ok =
      nameDialog.mode === "renameFolder"
        ? await run(dispatch(renameFolder({ id: nameDialog.folder.id, name })))
        : await run(dispatch(renameFile({ id: nameDialog.file.id, name })));
    if (ok) setNameDialog(null);
  };

  const handleMove = async (destinationId: string | null) => {
    if (!move) return;
    const ok =
      move.kind === "folder"
        ? await run(dispatch(moveFolder({ id: move.folder.id, parentId: destinationId })))
        : await run(dispatch(moveFile({ id: move.file.id, folderId: destinationId })));
    if (ok) setMove(null);
  };

  const handleDelete = async () => {
    if (!del) return;
    const ok =
      del.kind === "folder"
        ? await run(dispatch(deleteFolder(del.folder.id)), "Folder deleted")
        : await run(dispatch(deleteFile(del.file.id)), "File deleted");
    if (ok) setDel(null);
  };

  const download = async (file: FileObject) => {
    const { data, error } = await supabase.storage
      .from("practice-files")
      .createSignedUrl(file.storage_path, 120, { download: file.name });
    if (error || !data?.signedUrl) {
      showToast("Couldn't prepare that download", "danger");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.rel = "noreferrer";
    a.click();
  };

  const onFiles = (files: File[]) => {
    dispatch(uploadItems({ folderId: currentFolderId, files }))
      .unwrap()
      .then((s) => {
        const created = (s as { created: number }).created;
        const made = (s as { foldersCreated: number }).foldersCreated;
        showToast(
          `Uploaded ${created} file${created === 1 ? "" : "s"}` +
            (made ? ` into ${made} new folder${made === 1 ? "" : "s"}` : ""),
          "success",
        );
      })
      .catch(() => {
        /* the slice stores the message + rejected list; the modal below shows them */
      });
  };

  const uploading = uploadStatus === "loading";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Files</h1>
          <p className={styles.subtitle}>
            Documents, images and PDFs for your practice. Folders and zips are unpacked on upload.
          </p>
        </div>
        <div className={styles.toolbar}>
          <Button variant="secondary" onClick={() => setNameDialog({ mode: "newFolder" })} disabled={uploading}>
            <NewFolderIcon /> New folder
          </Button>
          <SplitButton
            primaryLabel={uploading ? "Uploading…" : "Upload files"}
            primaryAction={() => zoneRef.current?.openFiles()}
            options={[
              { label: "Upload a folder", onClick: () => zoneRef.current?.openFolder() },
              { label: "Upload a .zip", onClick: () => zoneRef.current?.openZip() },
            ]}
          />
        </div>
      </header>

      <StorageMeter report={report} />

      {status === "loading" && (
        <div className={styles.empty}>
          <Spinner />
        </div>
      )}

      {status === "failed" && (
        <div className={styles.empty}>
          <p>Couldn&apos;t load your files.</p>
          <Button variant="secondary" onClick={() => dispatch(fetchFileTree())}>
            Try again
          </Button>
        </div>
      )}

      {status !== "loading" && status !== "failed" && (
        <div className={styles.body}>
          <FolderTree folders={folders} currentFolderId={currentFolderId} onSelect={navigate} />
          <UploadZone ref={zoneRef} disabled={uploading} onFiles={onFiles}>
            {uploading && (
              <p className={styles.subtitle}>
                <Spinner size={16} /> Uploading…
              </p>
            )}
            <FileBrowser
              folders={folders}
              objects={objects}
              currentFolderId={currentFolderId}
              onNavigate={navigate}
              onOpenFile={setPreview}
              onDownloadFile={download}
              onRenameFolder={(folder) => setNameDialog({ mode: "renameFolder", folder })}
              onMoveFolder={(folder) => setMove({ kind: "folder", folder })}
              onDeleteFolder={(folder) => setDel({ kind: "folder", folder })}
              onRenameFile={(file) => setNameDialog({ mode: "renameFile", file })}
              onMoveFile={(file) => setMove({ kind: "file", file })}
              onDeleteFile={(file) => setDel({ kind: "file", file })}
            />
          </UploadZone>
        </div>
      )}

      {nameDialog && (
        <NameDialog
          title={NAME_DIALOG_TITLE[nameDialog.mode]}
          label={nameDialog.mode === "renameFile" ? "File name" : "Folder name"}
          initial={
            nameDialog.mode === "renameFolder"
              ? nameDialog.folder.name
              : nameDialog.mode === "renameFile"
                ? nameDialog.file.name
                : ""
          }
          confirmLabel={nameDialog.mode === "newFolder" ? "Create" : "Rename"}
          busy={busy}
          onConfirm={handleName}
          onClose={() => setNameDialog(null)}
        />
      )}

      {move && (
        <MoveDialog
          title={move.kind === "folder" ? `Move "${move.folder.name}"` : `Move "${move.file.name}"`}
          folders={folders}
          movingFolderId={move.kind === "folder" ? move.folder.id : undefined}
          currentParentId={move.kind === "folder" ? move.folder.parent_id : move.file.folder_id}
          busy={busy}
          onConfirm={handleMove}
          onClose={() => setMove(null)}
        />
      )}

      {del && (
        <ConfirmModal
          title={del.kind === "folder" ? `Delete "${del.folder.name}"?` : `Delete "${del.file.name}"?`}
          confirmLabel="Delete"
          confirming={busy}
          onConfirm={handleDelete}
          onClose={() => setDel(null)}
        >
          {del.kind === "folder"
            ? "Everything inside this folder — subfolders and files — will be permanently removed."
            : "This file will be permanently removed."}
        </ConfirmModal>
      )}

      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}

      {rejected && rejected.length > 0 && (
        <ConfirmModal
          title="Upload cancelled"
          confirmLabel="OK"
          cancelLabel="Close"
          danger={false}
          onConfirm={() => dispatch(clearRejected())}
          onClose={() => dispatch(clearRejected())}
        >
          Nothing was imported — some items can't be stored here:
          <ul className={styles.rejectList}>
            {rejected.slice(0, 12).map((r) => (
              <li key={r.path}>
                {r.path} — {r.reason}
              </li>
            ))}
            {rejected.length > 12 && <li>…and {rejected.length - 12} more</li>}
          </ul>
        </ConfirmModal>
      )}
    </div>
  );
}
