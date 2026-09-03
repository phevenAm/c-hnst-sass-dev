import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import OpenInFullOutlinedIcon from "@mui/icons-material/OpenInFullOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";

import Spinner from "@components/shared/Spinner/Spinner";

import { useScrollLock } from "@/Hooks/useScrollLock";

import styles from "./PdfViewer.module.scss";

// react-pdf renders via a web worker — Vite needs the actual worker file
// URL, not a bare specifier, or the Document never loads.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props {
  url: string;
  title: string;
}

// Measures the available width so <Page> can render at a size that fills its
// container — react-pdf renders to a fixed-pixel canvas, it doesn't scale
// with CSS the way an <img> would.
function usePageWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // clientWidth is the untransformed layout width. Measure now, then keep
    // re-measuring for a handful of frames — the container is often still
    // settling on first run (expanding to full screen, flex layout resolving,
    // a scrollbar appearing).
    const measure = () => setWidth(el.clientWidth || undefined);
    measure();

    let frame = 0;
    let raf = requestAnimationFrame(function tick() {
      measure();
      if (++frame < 12) raf = requestAnimationFrame(tick);
    });

    const observer = new ResizeObserver(() => measure());
    observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return [ref, width] as const;
}

function PageStack({ url, width, onLoadError }: { url: string; width?: number; onLoadError: () => void }) {
  const [numPages, setNumPages] = useState(0);

  return (
    <Document
      file={url}
      loading={<Spinner />}
      error={<p className={styles.error}>Couldn't load this PDF.</p>}
      onLoadSuccess={({ numPages: n }) => setNumPages(n)}
      onLoadError={onLoadError}
    >
      {/* Wait for a real measured width before rendering pages — rendering at
          react-pdf's native size first (and hoping a re-measure fixes it) is
          what left the expanded view stuck small. */}
      {!width || numPages === 0 ? (
        <Spinner />
      ) : (
        Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
          <Page
            key={pageNumber}
            pageNumber={pageNumber}
            width={width}
            className={styles.page}
            // We only need the rendered image. The text + annotation layers
            // need their own CSS (which we don't ship) — without it they spill
            // as mispositioned overlay text around the canvas.
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ))
      )}
    </Document>
  );
}

export default function PdfViewer({ url, title }: Props) {
  const [colRef, width] = usePageWidth();
  const [isFull, setIsFull] = useState(false);
  // A load failure means "Open full page" would just show the same error.
  const [loadFailed, setLoadFailed] = useState(false);

  // When expanded: lock the page scroll and let Escape collapse it. The same
  // <Document> stays mounted the whole time — the PDF is loaded once and the
  // pages just re-render wider as the container grows.
  useScrollLock(isFull);

  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFull]);

  return (
    <div className={`${styles.wrapper} ${isFull ? styles.full : ""}`}>
      {isFull && (
        <div className={styles.fullHeader}>
          <span className={styles.fullTitle}>{title}</span>
          <button type="button" className={styles.fullClose} onClick={() => setIsFull(false)} aria-label="Close">
            ×
          </button>
        </div>
      )}

      <div className={styles.preview}>
        <div ref={colRef} className={styles.pageCol}>
          <PageStack url={url} width={width} onLoadError={() => setLoadFailed(true)} />
        </div>
      </div>

      {!isFull && (
        <div className={styles.actions}>
          {!loadFailed && (
            <button type="button" className={styles.actionLink} onClick={() => setIsFull(true)}>
              <OpenInFullOutlinedIcon fontSize="inherit" />
              Open full page
            </button>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.actionLink}>
            <OpenInNewOutlinedIcon fontSize="inherit" />
            Open in new tab
          </a>
        </div>
      )}
    </div>
  );
}
