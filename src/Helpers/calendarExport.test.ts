import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/models/globalTypes";
import { downloadAdminSessionIcs, downloadClientSessionIcs, downloadSessionIcs } from "./calendarExport";

// calendarExport builds an .ics string and pushes it through a Blob + a
// synthetic <a> click. JSDOM has no real URL.createObjectURL / download, so
// stub that plumbing: capture the Blob passed to createObjectURL and the
// download filename set on the anchor, then read the text back in the test.
let capturedBlob: Blob | null;
let capturedFilename: string;
let clickSpy: ReturnType<typeof vi.fn>;

async function lastIcs(): Promise<string> {
  if (!capturedBlob) throw new Error("no download was triggered");
  return await capturedBlob.text();
}

beforeEach(() => {
  capturedBlob = null;
  capturedFilename = "";
  clickSpy = vi.fn();

  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob) => {
    capturedBlob = blob;
    return "blob:mock";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    const el = realCreateElement(tag) as HTMLElement;
    if (tag === "a") {
      Object.defineProperty(el, "click", {
        value: () => {
          capturedFilename = (el as HTMLAnchorElement).download;
          clickSpy();
        },
      });
    }
    return el;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-123",
    scheduled_at: "2026-05-01T09:00:00.000Z",
    duration_minutes: 50,
    address: null,
    ...overrides,
  } as unknown as Session;
}

describe("downloadAdminSessionIcs", () => {
  it("emits a well-formed VCALENDAR / VEVENT with CRLF line endings", async () => {
    downloadAdminSessionIcs(makeSession(), { clientLabel: "Jane Doe" });
    const ics = await lastIcs();

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("UID:sess-123@withclarity.uk");
  });

  it("derives DTEND from scheduled_at + duration_minutes", async () => {
    downloadAdminSessionIcs(makeSession({ duration_minutes: 90 }), { clientLabel: "Jane" });
    const ics = await lastIcs();
    expect(ics).toContain("DTSTART:20260501T090000Z");
    // 09:00 + 90 min => 10:30
    expect(ics).toContain("DTEND:20260501T103000Z");
  });

  it("puts the client label and session number in the SUMMARY", async () => {
    downloadAdminSessionIcs(makeSession(), { clientLabel: "Jane Doe", sessionNumber: 3 });
    expect(await lastIcs()).toContain("SUMMARY:Jane Doe — Session (#3)");
  });

  it("omits LOCATION when the session has no address, includes it when set", async () => {
    downloadAdminSessionIcs(makeSession(), { clientLabel: "Jane" });
    expect(await lastIcs()).not.toContain("LOCATION:");

    downloadAdminSessionIcs(makeSession({ address: "12 High St" }), { clientLabel: "Jane" });
    expect(await lastIcs()).toContain("LOCATION:12 High St");
  });

  it("builds a DESCRIPTION from business name, total sessions and notes joined with \\n", async () => {
    downloadAdminSessionIcs(makeSession(), {
      clientLabel: "Jane",
      businessName: "Oakwood",
      totalSessions: 6,
      lastNotes: "  bring worksheet  ",
    });
    const line = (await lastIcs()).split("\r\n").find((l) => l.startsWith("DESCRIPTION:"));
    expect(line).toBe("DESCRIPTION:Practice: Oakwood\\nTotal sessions: 6\\nNotes: bring worksheet");
  });

  it("omits DESCRIPTION entirely when there is nothing to describe", async () => {
    downloadAdminSessionIcs(makeSession(), { clientLabel: "Jane" });
    expect(await lastIcs()).not.toContain("DESCRIPTION:");
  });

  it("slugifies the client label for the filename", () => {
    downloadAdminSessionIcs(makeSession(), { clientLabel: "Jane D. O'Brien!" });
    expect(capturedFilename).toBe("session-jane-d-obrien.ics");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("folds SUMMARY lines longer than 75 octets onto continuation lines", async () => {
    const longLabel = "A".repeat(120);
    downloadAdminSessionIcs(makeSession(), { clientLabel: longLabel });
    const ics = await lastIcs();
    const summaryChunk = ics.slice(ics.indexOf("SUMMARY:"));
    const [firstLine, secondLine] = summaryChunk.split("\r\n");
    expect(firstLine.length).toBeLessThanOrEqual(75);
    expect(secondLine.startsWith(" ")).toBe(true);
  });

  it("names the PRODID after the business when provided, Clarity otherwise", async () => {
    downloadAdminSessionIcs(makeSession(), { clientLabel: "Jane", businessName: "Oakwood" });
    expect(await lastIcs()).toContain("PRODID:-//Oakwood//EN");

    downloadAdminSessionIcs(makeSession(), { clientLabel: "Jane" });
    expect(await lastIcs()).toContain("PRODID:-//Clarity//EN");
  });
});

describe("downloadClientSessionIcs", () => {
  it("defaults the SUMMARY to 'Therapy Session' and includes location by default", async () => {
    downloadClientSessionIcs(makeSession({ address: "Room 4" }));
    const ics = await lastIcs();
    expect(ics).toContain("SUMMARY:Therapy Session");
    expect(ics).toContain("LOCATION:Room 4");
  });

  it("uses the supplied title and can suppress the location", async () => {
    downloadClientSessionIcs(makeSession({ address: "Room 4" }), {
      title: "Weekly check-in",
      includeLocation: false,
    });
    const ics = await lastIcs();
    expect(ics).toContain("SUMMARY:Weekly check-in");
    expect(ics).not.toContain("LOCATION:");
  });

  it("names the file after the session date", () => {
    downloadClientSessionIcs(makeSession());
    expect(capturedFilename).toBe("session-2026-05-01.ics");
  });

  it("downloadSessionIcs is the client export with no options", async () => {
    downloadSessionIcs(makeSession());
    expect(await lastIcs()).toContain("SUMMARY:Therapy Session");
    expect(capturedFilename).toBe("session-2026-05-01.ics");
  });
});
