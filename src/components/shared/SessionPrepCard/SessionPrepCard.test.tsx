import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SessionPrepCard from "./SessionPrepCard";

afterEach(cleanup);

const baseProps = {
  nextSessionAt: "2026-09-01T14:00:00Z",
  totalSessions: 3,
  attendedSessions: 2,
  lastSeenAt: "2026-08-20T14:00:00Z",
  lastNote: null,
  notesLocked: false,
  onViewNotes: vi.fn(),
};

describe("SessionPrepCard — actions", () => {
  it("renders and fires the Manage-this-session action when the handler is passed (happy path)", () => {
    const onManageSession = vi.fn();
    render(<SessionPrepCard {...baseProps} onManageSession={onManageSession} />);

    const btn = screen.getByRole("button", { name: "Manage this session →" });
    fireEvent.click(btn);
    expect(onManageSession).toHaveBeenCalledTimes(1);
  });

  it("omits the Manage-this-session action when no handler is passed (sad path)", () => {
    render(<SessionPrepCard {...baseProps} />);

    expect(screen.queryByRole("button", { name: "Manage this session →" })).not.toBeInTheDocument();
    // The notes action is always there.
    expect(screen.getByRole("button", { name: "View all notes →" })).toBeInTheDocument();
  });

  it("always renders View-all-notes and fires its handler", () => {
    const onViewNotes = vi.fn();
    render(<SessionPrepCard {...baseProps} onViewNotes={onViewNotes} onManageSession={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "View all notes →" }));
    expect(onViewNotes).toHaveBeenCalledTimes(1);
  });
});

describe("SessionPrepCard — note block", () => {
  it("shows the last note, truncated past 220 chars", () => {
    const long = "x".repeat(300);
    render(<SessionPrepCard {...baseProps} lastNote={{ content: long, createdAt: "2026-08-21T00:00:00Z" }} />);

    const note = screen.getByText(/x{220}…/);
    expect(note).toBeInTheDocument();
    expect(note.textContent).not.toContain("x".repeat(221));
  });

  it("shows a plain 'No notes yet.' when there is no note and nothing is locked (sad path)", () => {
    render(<SessionPrepCard {...baseProps} lastNote={null} notesLocked={false} />);
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
  });

  it("prompts to unlock encryption when notes are locked", () => {
    render(<SessionPrepCard {...baseProps} lastNote={null} notesLocked />);
    expect(screen.getByText(/Unlock encryption/)).toBeInTheDocument();
  });
});

describe("SessionPrepCard — stats line", () => {
  it("pluralises sessions and includes the last-seen date", () => {
    render(<SessionPrepCard {...baseProps} totalSessions={3} attendedSessions={2} />);
    expect(screen.getByText(/3 sessions · 2 attended · last session/)).toBeInTheDocument();
  });

  it("uses the singular for a single session and omits last-seen when never seen", () => {
    render(<SessionPrepCard {...baseProps} totalSessions={1} attendedSessions={0} lastSeenAt={null} />);
    const stats = screen.getByText(/1 session · 0 attended/);
    expect(stats.textContent).not.toContain("last session");
  });
});
