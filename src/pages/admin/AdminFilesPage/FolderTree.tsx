import { useMemo, useState } from "react";

import { ChevronDownSmIcon, FolderIcon, FolderOpenIcon } from "@components/shared/Icons/Icons";
import type { FileFolder } from "@models/files";

import styles from "./AdminFilesPage.module.scss";

type Props = {
  folders: FileFolder[];
  currentFolderId: string | null;
  onSelect: (id: string | null) => void;
};

const INDENT = 14; // px per nesting level

// Recursive folder tree. "All files" (id null) is the root; a folder with
// children gets a twisty. Nested levels draw a continuous guide line down their
// left edge — the same treatment as the AdminSidebar submenu.
export default function FolderTree({ folders, currentFolderId, onSelect }: Props) {
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, FileFolder[]>();
    for (const f of folders) {
      const list = map.get(f.parent_id);
      if (list) list.push(f);
      else map.set(f.parent_id, [f]);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [folders]);

  const roots = childrenOf.get(null) ?? [];

  return (
    <nav className={styles.tree} aria-label="Folders" id="files-tree">
      <p className={styles.treeHeading}>Folders</p>
      <ul className={styles.treeList}>
        <li>
          <div className={`${styles.treeRow} ${currentFolderId === null ? styles.treeRowActive : ""}`}>
            <span className={styles.treeTwisty} aria-hidden="true" />
            <button type="button" className={styles.treeRowLabel} onClick={() => onSelect(null)}>
              <span className={styles.treeIcon}>{currentFolderId === null ? <FolderOpenIcon /> : <FolderIcon />}</span>
              <span className={styles.treeLabel}>All files</span>
            </button>
          </div>
        </li>
        {roots.map((folder) => (
          <TreeNode
            key={folder.id}
            folder={folder}
            depth={0}
            childrenOf={childrenOf}
            currentFolderId={currentFolderId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </nav>
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
  onSelect: (id: string | null) => void;
}) {
  const kids = childrenOf.get(folder.id) ?? [];
  const active = currentFolderId === folder.id;
  const [open, setOpen] = useState(active);

  return (
    <li>
      <div
        className={`${styles.treeRow} ${active ? styles.treeRowActive : ""}`}
        style={{ paddingLeft: depth * INDENT }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            className={styles.treeTwisty}
            aria-label={open ? "Collapse" : "Expand"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            style={{ transform: open ? "none" : "rotate(-90deg)" }}
          >
            <ChevronDownSmIcon />
          </button>
        ) : (
          <span className={styles.treeTwisty} aria-hidden="true" />
        )}
        <button type="button" className={styles.treeRowLabel} onClick={() => onSelect(folder.id)}>
          <span className={styles.treeIcon}>{open && kids.length ? <FolderOpenIcon /> : <FolderIcon />}</span>
          <span className={styles.treeLabel}>{folder.name}</span>
        </button>
      </div>

      {open && kids.length > 0 && (
        <ul className={styles.treeChildren} style={{ ["--guide-x" as string]: `${depth * INDENT + 13}px` }}>
          {kids.map((child) => (
            <TreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              childrenOf={childrenOf}
              currentFolderId={currentFolderId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
