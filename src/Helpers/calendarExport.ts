import type { Session } from "@/models/globalTypes";

function toIcsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;
}

function fold(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface AdminIcsOptions {
  clientLabel: string;
  businessName?: string;
  sessionNumber?: number;
  totalSessions?: number;
  lastNotes?: string;
}

export function downloadAdminSessionIcs(session: Session, opts: AdminIcsOptions): void {
  const start = new Date(session.scheduled_at);
  const end = new Date(start.getTime() + session.duration_minutes * 60_000);

  const num = opts.sessionNumber != null ? ` (#${opts.sessionNumber})` : "";
  const summary = `${opts.clientLabel} — Session${num}`;

  const descParts: string[] = [];
  if (opts.businessName) descParts.push(`Practice: ${opts.businessName}`);
  if (opts.totalSessions != null) descParts.push(`Total sessions: ${opts.totalSessions}`);
  if (opts.lastNotes?.trim()) descParts.push(`Notes: ${opts.lastNotes.trim()}`);

  const slug = opts.clientLabel
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const filename = `session-${slug}.ics`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${opts.businessName ?? "Clarity"}//EN`,
    "BEGIN:VEVENT",
    `UID:${session.id}@withclarity.uk`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    fold(`SUMMARY:${summary}`),
    session.address ? fold(`LOCATION:${session.address}`) : null,
    descParts.length ? fold(`DESCRIPTION:${descParts.join("\\n")}`) : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  triggerDownload(lines, filename);
}

export interface ClientIcsOptions {
  title: string;
  includeLocation: boolean;
}

export function downloadClientSessionIcs(session: Session, opts?: ClientIcsOptions): void {
  const start = new Date(session.scheduled_at);
  const end = new Date(start.getTime() + session.duration_minutes * 60_000);

  const dateStr = start.toISOString().slice(0, 10);
  const filename = `session-${dateStr}.ics`;
  const summary = opts?.title ?? "Therapy Session";
  const includeLocation = opts?.includeLocation ?? true;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clarity//EN",
    "BEGIN:VEVENT",
    `UID:${session.id}@withclarity.uk`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    fold(`SUMMARY:${summary}`),
    includeLocation && session.address ? fold(`LOCATION:${session.address}`) : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  triggerDownload(lines, filename);
}

export function downloadSessionIcs(session: Session): void {
  downloadClientSessionIcs(session);
}
