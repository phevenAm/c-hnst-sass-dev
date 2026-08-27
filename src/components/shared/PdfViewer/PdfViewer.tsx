import { useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import OpenInFullOutlinedIcon from "@mui/icons-material/OpenInFullOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";

import Modal from "@components/shared/Modal/Modal";
import Spinner from "@components/shared/Spinner/Spinner";

import styles from "./PdfViewer.module.scss";

// react-pdf renders via a web worker — Vite needs the actual worker file
// URL, not a bare specifier, or the Document never loads.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props {
  url: string;
  title: string;
}

// Measures the available width so <Page> can render at a size that fills
// its container — react-pdf renders to a fixed-pixel canvas, it doesn't
// scale with CSS the way an <img> would.
function usePageWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // clientWidth is the untransformed layout width (unlike
    // getBoundingClientRect, which is affected by any scale animation on a
    // parent modal). Measure now, then keep re-measuring for a handful of
    // frames — the container is often still settling when this first runs
    // (modal opening, flex layout resolving, a scrollbar appearing), and
    // "Open full page" in particular mounts into a container that hasn't
    // reached its final size yet.
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
      {/* Don't render the pages until the container has a real measured
          width — rendering at react-pdf's native size first (and hoping a
          later re-measure fixes it) is what left the full-page view stuck
          small. Wait for the width, then render every page at that size. */}
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
            // as mispositioned overlay text around the canvas, which is what
            // made multi-page docs look broken.
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ))
      )}
    </Document>
  );
}

export default function PdfViewer({ url, title }: Props) {
  const [previewRef, previewWidth] = usePageWidth();
  const [fullRef, fullWidth] = usePageWidth();
  const [fullPageOpen, setFullPageOpen] = useState(false);
  // A load failure inside the embedded preview means the same failure would
  // happen in the full-page view — no point offering a button that opens to
  // the same error, so it's hidden once a load error fires.
  const [loadFailed, setLoadFailed] = useState(false);

  return (
    <div className={styles.wrapper}>
      {/* Scroll container is padded; the ref sits on an unpadded inner column
          so the measured width is the real space a <Page> canvas can fill —
          measuring the padded box made every canvas overflow its own padding. */}
      <div className={styles.preview}>
        <div ref={previewRef} className={styles.pageCol}>
          <PageStack url={url} width={previewWidth} onLoadError={() => setLoadFailed(true)} />
        </div>
      </div>

      <div className={styles.actions}>
        {!loadFailed && (
          <button type="button" className={styles.actionLink} onClick={() => setFullPageOpen(true)}>
            <OpenInFullOutlinedIcon fontSize="inherit" />
            Open full page
          </button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.actionLink}>
          <OpenInNewOutlinedIcon fontSize="inherit" />
          Open in new tab
        </a>
      </div>

      {fullPageOpen && (
        <Modal title={title} onClose={() => setFullPageOpen(false)} size="full">
          <div className={styles.fullPage}>
            <div ref={fullRef} className={styles.pageCol}>
              <PageStack url={url} width={fullWidth} onLoadError={() => setFullPageOpen(false)} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
