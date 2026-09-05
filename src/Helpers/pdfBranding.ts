// ── Clarity PDF brand kit ────────────────────────────────────────────────────
// One place every PDF export draws its chrome from, so an invoice, a client
// report and the CPD log all read as the same product: a photo cover page
// (the frosted login art), a teal running header on every content page, teal
// table headers, and a branded footer with page numbers.
//
// Usage:
//   const doc = new jsPDF();                     // portrait A4, mm
//   addCoverPage(doc, { title: "Client Report", subtitle: name });
//   doc.addPage();
//   let y = runningHeader(doc, "Client Report"); // first content page
//   autoTable(doc, { startY: y, ...tableBlock() });
//   stampChrome(doc, { title: "Client Report", footer: "Confidential report" });
//   doc.save("report.pdf");                        // stampChrome runs last

import type { jsPDF } from "jspdf";

import { PDF_COVER_JPEG } from "./pdfCoverImage";

type RGB = [number, number, number];

export const TEAL: RGB = [31, 73, 64]; // --accent / teal-800
export const INK: RGB = [45, 41, 38]; // body text
export const MUTED: RGB = [120, 120, 120]; // captions
export const WASH: RGB = [243, 241, 238]; // stat-tile fill

// The brand wordmark is Georgia; jsPDF's built-in "times" is the closest core
// font (no embedding, no bundle cost). Kept in one place so a later switch to
// an embedded Georgia subset is a one-line change.
export const SERIF = "times";

const MARGIN = 20;
const BAND_H = 16; // running-header band height (mm)

/** y content should start at on a page that has a running header. */
export const CONTENT_TOP = 28;
/** Pass as autoTable `margin.top` so rows on continuation pages clear the band. */
export const TABLE_TOP = 24;

/** Spread into an autoTable `headStyles` so every table header matches. */
export const tableHead = {
  fillColor: TEAL,
  textColor: [255, 255, 255] as RGB,
  fontStyle: "bold" as const,
};

/** Spread into an autoTable call so its header style and continuation-page top
 *  margin are consistent: `autoTable(doc, { startY, ...tableBlock() })`. The top
 *  margin keeps rows on overflow pages clear of the band `stampChrome` stamps. */
export const tableBlock = () => ({
  headStyles: tableHead,
  margin: { top: TABLE_TOP, left: MARGIN, right: MARGIN },
});

/** "4 September 2026" */
export const formatToday = (): string =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// jsPDF's GState (for the translucent teal wash) isn't in the bundled types.
type WithGState = jsPDF & {
  GState?: new (opts: { opacity: number }) => unknown;
  setGState?: (g: unknown) => void;
};

/** The Clarity sprout — the same two-leaf-and-stem mark as <LeafLogoMark>,
 *  drawn as vector so it stays crisp at any size. `cx`/`cy` is the stem base. */
function drawSprout(doc: jsPDF, cx: number, cy: number, s: number, color: RGB = [255, 255, 255]) {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(s * 0.1);
  doc.line(cx, cy, cx, cy - s * 0.68); // stem
  doc.ellipse(cx - s * 0.28, cy - s * 0.5, s * 0.3, s * 0.2, "F"); // left leaf
  doc.ellipse(cx + s * 0.28, cy - s * 0.5, s * 0.3, s * 0.2, "F"); // right leaf
}

export type CoverOptions = {
  /** The document kind, e.g. "Client Report", "Invoice", "CPD Log". */
  title: string;
  /** Second line — usually the practice or client name. */
  subtitle?: string;
  /** Extra lines under the title (defaults to a "Generated <today>" line). */
  meta?: string[];
};

/** Fills the current (first) page with the frosted photo, a teal wash and a
 *  solid teal text block. Call `doc.addPage()` afterwards for content. */
export function addCoverPage(doc: jsPDF, { title, subtitle, meta }: CoverOptions): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // The cover JPEG is a portrait A4 crop; on a landscape page draw it
  // "cover"-fit (full width, overflowing top/bottom) so it isn't stretched.
  if (W > H) {
    const drawH = W * 1.414;
    doc.addImage(PDF_COVER_JPEG, "JPEG", 0, (H - drawH) / 2, W, drawH, undefined, "FAST");
  } else {
    doc.addImage(PDF_COVER_JPEG, "JPEG", 0, 0, W, H, undefined, "FAST");
  }

  // Translucent teal wash over the whole photo (best-effort — skipped if the
  // GState API isn't present in this jsPDF build).
  const g = doc as WithGState;
  if (g.GState && g.setGState) {
    g.setGState(new g.GState({ opacity: 0.55 }));
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, W, H, "F");
    g.setGState(new g.GState({ opacity: 1 }));
  }

  // Opaque teal block for the wordmark + title, so text is always crisp.
  const bandTop = H - 108;
  doc.setFillColor(...TEAL);
  doc.rect(0, bandTop, W, H - bandTop, "F");

  drawSprout(doc, MARGIN + 4, bandTop + 30, 12);
  doc.setFont(SERIF, "normal");
  doc.setFontSize(30);
  doc.setTextColor(255, 255, 255);
  doc.text("Clarity", MARGIN + 16, bandTop + 30);

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, bandTop + 42, W - MARGIN, bandTop + 42);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(title, MARGIN, bandTop + 60);

  let y = bandTop + 72;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(226, 236, 233);
    doc.text(subtitle, MARGIN, y);
    y += 10;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(198, 216, 211);
  for (const line of meta ?? [`Generated ${formatToday()}`]) {
    doc.text(line, MARGIN, y);
    y += 6;
  }

  // Leave the pen in a sane default for whatever the caller draws next.
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.setDrawColor(...INK);
}

/** Draws the teal header band + wordmark + right-aligned title on the current
 *  page. Used by `runningHeader`, `tableBlock`'s didDrawPage, and `stampChrome`. */
function drawRunningBand(doc: jsPDF, title: string): void {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, BAND_H, "F");
  doc.setFont(SERIF, "normal");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("Clarity", MARGIN, 10.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(title, W - MARGIN, 10.5, { align: "right" });
  doc.setTextColor(...INK);
  doc.setDrawColor(...INK);
}

/** Teal band at the top of the first content page. Returns the y content should
 *  start at. Call once, right after the `doc.addPage()` that follows the cover. */
export function runningHeader(doc: jsPDF, title: string): number {
  drawRunningBand(doc, title);
  return CONTENT_TOP;
}

export type ChromeOptions = {
  /** Right-aligned label in the running header on every content page. */
  title: string;
  /** Footer label — defaults to `title`. */
  footer?: string;
  /** Whether page 1 is a photo cover to skip (default true). Invoices pass false. */
  hasCover?: boolean;
};

/** Stamps the running header and the footer + "Page X of Y" across every content
 *  page. Run last, immediately before `doc.save()` — it covers pages that
 *  autoTable or manual `addPage()` calls created after the first. */
export function stampChrome(doc: jsPDF, { title, footer, hasCover = true }: ChromeOptions): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  const first = hasCover ? 2 : 1;
  const count = total - first + 1;
  const left = `Clarity · ${footer ?? title} · Generated ${formatToday()}`;
  for (let p = first; p <= total; p++) {
    doc.setPage(p);
    drawRunningBand(doc, title);
    doc.setDrawColor(...WASH);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, H - 12, W - MARGIN, H - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(left, MARGIN, H - 7);
    if (count > 1) doc.text(`Page ${p - first + 1} of ${count}`, W - MARGIN, H - 7, { align: "right" });
  }
  doc.setTextColor(...INK);
}
