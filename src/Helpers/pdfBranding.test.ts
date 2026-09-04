import { describe, expect, it, vi } from "vitest";

import { CONTENT_TOP, formatToday, runningHeader, stampChrome, TEAL, tableBlock, tableHead } from "./pdfBranding";

// A minimal jsPDF stand-in that records the text drawn on each page.
function mockDoc(pageCount: number) {
  let page = 1;
  const texts: { page: number; s: string; opts?: unknown }[] = [];
  const doc = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    getNumberOfPages: () => pageCount,
    setPage: (p: number) => {
      page = p;
    },
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setTextColor: vi.fn(),
    setLineWidth: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    text: (s: string, _x: number, _y: number, opts?: unknown) => {
      texts.push({ page, s, opts });
    },
  };
  return { doc, texts };
}

describe("formatToday", () => {
  it("is a UK long date", () => {
    expect(formatToday()).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });
});

describe("tableHead / tableBlock", () => {
  it("tableHead fills with the brand teal", () => {
    expect(tableHead.fillColor).toEqual(TEAL);
    expect(tableHead.textColor).toEqual([255, 255, 255]);
  });

  it("tableBlock sets a top margin so overflow rows clear the header band", () => {
    const b = tableBlock();
    expect(b.headStyles).toBe(tableHead);
    expect(b.margin.top).toBeGreaterThanOrEqual(20);
  });
});

describe("runningHeader", () => {
  it("draws the wordmark + title and returns the content top", () => {
    const { doc, texts } = mockDoc(2);
    // biome-ignore lint/suspicious/noExplicitAny: mock doc
    const y = runningHeader(doc as any, "Client Report");
    expect(y).toBe(CONTENT_TOP);
    expect(texts.map((t) => t.s)).toEqual(["Clarity", "Client Report"]);
  });
});

describe("stampChrome", () => {
  it("numbers content pages 1..N and skips the cover when hasCover", () => {
    const { doc, texts } = mockDoc(4); // page 1 = cover, 2..4 = content
    // biome-ignore lint/suspicious/noExplicitAny: mock doc
    stampChrome(doc as any, { title: "CPD Log", footer: "CPD Log 2026" });
    const pageLabels = texts.filter((t) => /^Page /.test(t.s)).map((t) => t.s);
    expect(pageLabels).toEqual(["Page 1 of 3", "Page 2 of 3", "Page 3 of 3"]);
    // nothing stamped on the cover
    expect(texts.some((t) => t.page === 1)).toBe(false);
    // footer uses the footer label, not the title
    expect(texts.some((t) => t.s.includes("Clarity · CPD Log 2026 · Generated"))).toBe(true);
  });

  it("stamps from page 1 and hides page numbers for a single-page doc", () => {
    const { doc, texts } = mockDoc(1); // invoice: no cover, one page
    // biome-ignore lint/suspicious/noExplicitAny: mock doc
    stampChrome(doc as any, { title: "Invoice OT-1", hasCover: false });
    expect(texts.some((t) => t.page === 1)).toBe(true);
    expect(texts.some((t) => /^Page /.test(t.s))).toBe(false);
  });
});
