import { useMemo, useState } from "react";

import { isSelfOrDescendant } from "@Helpers/fileTypes";
import Button from "@components/shared/Button/Button";
import { FolderIcon } from "@components/shared/Icons/Icons";
import Modal from "@components/shared/Modal/Modal";
import type { FileFolder } from "@models/files";

import styles from "./AdminFilesPage.module.scss";

type Props = {
  title: string;
  folders: FileFolder[];
  /** When moving a FOLDER, its id — so it and its subtree are not offered. */
  movingFolderId?: string;
  /** Where the item is now, to disable the no-op choice. */
  currentParentId: string | null;
  busy?: boolean;
  onConfirm: (destinationId: string | null) => void;
  onClose: () => void;
};

export default function MoveDialog({
  title,
  folders,
  movingFolderId,
  currentParentId,
  busy,
  onConfirm,
  onClose,
}: Props) {
  const [dest, setDest] = useState<string | null>(null);

  // Flatten to a depth-ordered list (folders already carry a materialised path).
  const options = useMemo(() => {
    const byPath = [...folders].sort((a, b) => a.path.localeCompare(b.path));
    return byPath.filter((f) => !movingFolderId || !isSelfOrDescendant(movingFolderId, f.id, folders));
  }, [folders, movingFolderId]);

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(dest)} disabled={busy || dest === currentParentId}>
            {busy ? "Moving…" : "Move here"}
          </Button>
        </>
      }
    >
      <div className={styles.moveTree}>
        <label className={styles.treeRow}>
          <input type="radio" name="move-dest" checked={dest === null} onChange={() => setDest(null)} />
          <span className={styles.treeIcon}>
            <FolderIcon />
          </span>
          <span className={styles.treeLabel}>All files (top level)</span>
        </label>
        {options.map((f) => (
          <label key={f.id} className={styles.treeRow} style={{ paddingLeft: 8 + f.depth * 16 }}>
            <input type="radio" name="move-dest" checked={dest === f.id} onChange={() => setDest(f.id)} />
            <span className={styles.treeIcon}>
              <FolderIcon />
            </span>
            <span className={styles.treeLabel}>{f.name}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
