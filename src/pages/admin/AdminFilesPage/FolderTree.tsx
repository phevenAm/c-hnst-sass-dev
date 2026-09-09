import { useMemo, useState } from "react";

import { ChevronDownSmIcon, FolderIcon, FolderOpenIcon } from "@components/shared/Icons/Icons";
import type { FileFolder } from "@models/files";

import styles from "./AdminFilesPage.module.scss";

type Props = {
  folders: FileFolder[];
  currentFolderId: string | null;
  onSelect: (id: string | null) => void;
};

// Recursive folder sidebar. "All files" (id null) is the root; every folder
// with children gets a twisty. Expansion state is local — the tree is small.
export default function FolderTree({ folders, currentFolderId, onSelect }: Props) {
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, FileFolder[]>();
    for (const f of folders) {
      const key = f.parent_id;
      const list = map.get(key);
      if (list) list.push(f);
      else map.set(key, [f]);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [folders]);

  return (
    <nav className={styles.tree} aria-label="Folders">
      <ul className={styles.treeList}>
        <li>
          <button
            type="button"
            className={`${styles.treeRow} ${currentFolderId === null ? styles.treeRowActive : ""}`}
            onClick={() => onSelect(null)}
          >
            <span className={styles.treeTwisty} />
            <span className={styles.treeIcon}>{currentFolderId === null ? <FolderOpenIcon /> : <FolderIcon />}</span>
            <span className={styles.treeLabel}>All files</span>
          </button>
        </li>
        <TreeLevel
          parentId={null}
          depth={0}
          childrenOf={childrenOf}
          currentFolderId={currentFolderId}
          onSelect={onSelect}
        />
      </ul>
    </nav>
  );
}

function TreeLevel({
  parentId,
  depth,
  childrenOf,
  currentFolderId,
  onSelect,
}: {
  parentId: string | null;
  depth: number;
  childrenOf: Map<string | null, FileFolder[]>;
  currentFolderId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {(childrenOf.get(parentId) ?? []).map((folder) => (
        <TreeNode
          key={folder.id}
          folder={folder}
          depth={depth}
          childrenOf={childrenOf}
          currentFolderId={currentFolderId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function TreeNode({
  folder,
  depth,
  childrenOf,
  currentFolderId,
  onSelect,
}: {
  folder: FileFolder;
  depth: number;
  childrenOf: Map<string | null, FileFolder[]>;
  currentFolderId: string | null;
  onSelect: (id: string) => void;
}) {
  const kids = childrenOf.get(folder.id) ?? [];
  const onPath = currentFolderId === folder.id;
  const [open, setOpen] = useState(onPath);
  const active = currentFolderId === folder.id;

  return (
    <li>
      <div style={{ paddingLeft: depth * 14 }}>
        <button
          type="button"
          className={`${styles.treeRow} ${active ? styles.treeRowActive : ""}`}
          onClick={() => onSelect(folder.id)}
        >
          <span
            className={styles.treeTwisty}
            onClick={(e) => {
              if (!kids.length) return;
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            style={{ transform: open ? "none" : "rotate(-90deg)", visibility: kids.length ? "visible" : "hidden" }}
          >
            <ChevronDownSmIcon />
          </span>
          <span className={styles.treeIcon}>{open && kids.length ? <FolderOpenIcon /> : <FolderIcon />}</span>
          <span className={styles.treeLabel}>{folder.name}</span>
        </button>
      </div>
      {open && kids.length > 0 && (
        <ul className={styles.treeList}>
          <TreeLevel
            parentId={folder.id}
            depth={depth + 1}
            childrenOf={childrenOf}
            currentFolderId={currentFolderId}
            onSelect={onSelect}
          />
        </ul>
      )}
    </li>
  );
}
