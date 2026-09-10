import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import { FILE_INPUT_ACCEPT } from "@Helpers/fileTypes";

import styles from "./AdminFilesPage.module.scss";

export type UploadZoneHandle = {
  openFiles: () => void;
  openFolder: () => void;
  openZip: () => void;
};

type Props = {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
};

// Recurse a dropped directory entry into a flat File[] whose webkitRelativePath
// carries the folder path (matches what <input webkitdirectory> produces).
async function readEntry(entry: FileSystemEntry, prefix: string): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    // File.webkitRelativePath is read-only; stash the path on a wrapper.
    Object.defineProperty(file, "webkitRelativePath", { value: prefix + file.name, configurable: true });
    return [file];
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries: FileSystemEntry[] = [];
    // readEntries returns at most 100 per call — loop until empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      entries.push(...batch);
    }
    const nested = await Promise.all(entries.map((e) => readEntry(e, `${prefix}${entry.name}/`)));
    return nested.flat();
  }
  return [];
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items).filter((i) => i.kind === "file");
  const canRecurse = items.some((i) => typeof i.webkitGetAsEntry === "function");
  if (!canRecurse) return Array.from(dt.files);

  const out: File[][] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) out.push(await readEntry(entry, ""));
    else {
      const f = item.getAsFile();
      if (f) out.push([f]);
    }
  }
  return out.flat();
}

const UploadZone = forwardRef<UploadZoneHandle, Props>(({ disabled, onFiles, children }, ref) => {
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useImperativeHandle(ref, () => ({
    openFiles: () => filesRef.current?.click(),
    openFolder: () => folderRef.current?.click(),
    openZip: () => zipRef.current?.click(),
  }));

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (list.length) onFiles(list);
    e.target.value = "";
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target; keyboard upload is the toolbar buttons
    <div
      className={`${styles.browser} ${dragging ? styles.dropActive : ""}`}
      onDragEnter={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!disabled) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        filesFromDrop(e.dataTransfer).then((files) => {
          if (files.length) onFiles(files);
        });
      }}
    >
      {children}
      <input ref={filesRef} type="file" multiple accept={FILE_INPUT_ACCEPT} hidden onChange={handleInput} />
      <input
        ref={folderRef}
        type="file"
        multiple
        hidden
        onChange={handleInput}
        // webkitdirectory/directory aren't in React's input types — spread them in.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
      />
      <input ref={zipRef} type="file" accept=".zip,application/zip" hidden onChange={handleInput} />
    </div>
  );
});

UploadZone.displayName = "UploadZone";
export default UploadZone;
