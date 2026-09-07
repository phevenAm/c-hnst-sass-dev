import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadBrandedCsv = vi.fn();
vi.mock("./csvExport", () => ({
  downloadBrandedCsv: (...args: unknown[]) => downloadBrandedCsv(...args),
}));

import { type ActivityExportRow, exportActivityCsv } from "./activityLogExport";

const rows: ActivityExportRow[] = [
  { when: "9am, Mon 1st Sep 2026", who: "Dr A", summary: "Dr A added client 'Cassie'", details: "" },
  {
    when: "10am, Mon 1st Sep 2026",
    who: "Dr A",
    summary: "Dr A updated a session",
    details: "status: scheduled → cancelled",
  },
];

describe("exportActivityCsv", () => {
  beforeEach(() => downloadBrandedCsv.mockClear());

  it("maps rows to the fixed 4-column order and forwards filename/title/meta", () => {
    exportActivityCsv(rows, {
      filename: "activity-log-2026-09-07",
      title: "Activity log",
      meta: [
        ["Scope", "All activity"],
        ["Entries", 2],
      ],
    });

    expect(downloadBrandedCsv).toHaveBeenCalledTimes(1);
    const arg = downloadBrandedCsv.mock.calls[0][0] as {
      filename: string;
      title: string;
      headers: string[];
      rows: unknown[][];
      meta: [string, unknown][];
    };
    expect(arg.filename).toBe("activity-log-2026-09-07");
    expect(arg.title).toBe("Activity log");
    expect(arg.headers).toEqual(["When", "Who", "Activity", "Details"]);
    expect(arg.rows).toEqual([
      ["9am, Mon 1st Sep 2026", "Dr A", "Dr A added client 'Cassie'", ""],
      ["10am, Mon 1st Sep 2026", "Dr A", "Dr A updated a session", "status: scheduled → cancelled"],
    ]);
    expect(arg.meta).toEqual([
      ["Scope", "All activity"],
      ["Entries", 2],
    ]);
  });

  it("handles an empty feed", () => {
    exportActivityCsv([], { filename: "empty", title: "Activity log" });
    const arg = downloadBrandedCsv.mock.calls[0][0] as { rows: unknown[][] };
    expect(arg.rows).toEqual([]);
  });
});
