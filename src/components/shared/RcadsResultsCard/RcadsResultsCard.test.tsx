import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RcadsResultsCard from "./RcadsResultsCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { supabaseMock, setRow } = vi.hoisted(() => {
  let row: Record<string, unknown> | null = null;
  return {
    supabaseMock: {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: row, error: null }),
              }),
            }),
          }),
        }),
      })),
    },
    setRow: (r: typeof row) => {
      row = r;
    },
  };
});
vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

// All-zero answers keep every subscale in the "normal" band, away from the
// clinical/borderline edges — happy-path plumbing, not the scoring math
// itself (that's rcadsScoring.test.ts's job).
const ALL_ZERO_ANSWERS = Array(47).fill(0);

describe("RcadsResultsCard — happy path", () => {
  it("renders scores, and the two disclosures are collapsed by default", async () => {
    setRow({
      id: "r1",
      date_of_birth: "2015-01-01",
      gender: "girl",
      answers: ALL_ZERO_ANSWERS,
      submitted_at: "2026-08-01T00:00:00.000Z",
    });
    render(<RcadsResultsCard clientId="client-1" />);

    expect(await screen.findByText("Separation Anxiety")).toBeInTheDocument();
    expect(screen.getByText("Total RCADS")).toBeInTheDocument();
    expect(screen.getByText(/T ≥ 65 borderline/)).toBeInTheDocument();

    expect(screen.queryByText(/Each scale's raw score/)).not.toBeInTheDocument();
    expect(screen.queryByText(/I worry about things/)).not.toBeInTheDocument();
  });

  it("expands the calculation explainer on click", async () => {
    setRow({
      id: "r1",
      date_of_birth: "2015-01-01",
      gender: "boy",
      answers: ALL_ZERO_ANSWERS,
      submitted_at: "2026-08-01T00:00:00.000Z",
    });
    render(<RcadsResultsCard clientId="client-1" />);
    await screen.findByText("Separation Anxiety");

    fireEvent.click(screen.getByRole("button", { name: "How is this calculated?" }));

    expect(screen.getByText(/Each scale's raw score/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("expands the raw answers list, showing question text and the client's actual answer", async () => {
    const answers = Array(47).fill(0);
    answers[0] = 3; // item 1 = "I worry about things" -> "Always"
    setRow({
      id: "r1",
      date_of_birth: "2015-01-01",
      gender: "boy",
      answers,
      submitted_at: "2026-08-01T00:00:00.000Z",
    });
    render(<RcadsResultsCard clientId="client-1" />);
    await screen.findByText("Separation Anxiety");

    fireEvent.click(screen.getByRole("button", { name: "View raw answers" }));

    expect(screen.getByText(/I worry about things/)).toBeInTheDocument();
    expect(screen.getByText("Always")).toBeInTheDocument();
  });
});

describe("RcadsResultsCard — sad paths", () => {
  it("shows 'No responses yet' when the client has never submitted the RCADS", async () => {
    setRow(null);
    render(<RcadsResultsCard clientId="client-1" />);

    expect(await screen.findByText("No responses yet.")).toBeInTheDocument();
  });

  it("shows 'No responses yet' rather than crashing on a malformed answers array", async () => {
    setRow({
      id: "r1",
      date_of_birth: "2015-01-01",
      gender: "boy",
      answers: [0, 1, 2], // wrong length — real data is always exactly 47
      submitted_at: "2026-08-01T00:00:00.000Z",
    });
    render(<RcadsResultsCard clientId="client-1" />);

    expect(await screen.findByText("No responses yet.")).toBeInTheDocument();
  });

  it("shows a loading state before the fetch resolves", () => {
    setRow(null);
    render(<RcadsResultsCard clientId="client-1" />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("re-fetches when clientId changes, discarding the previous client's result", async () => {
    setRow({
      id: "r1",
      date_of_birth: "2015-01-01",
      gender: "boy",
      answers: ALL_ZERO_ANSWERS,
      submitted_at: "2026-08-01T00:00:00.000Z",
    });
    const { rerender } = render(<RcadsResultsCard clientId="client-1" />);
    await screen.findByText("Separation Anxiety");

    setRow(null);
    rerender(<RcadsResultsCard clientId="client-2" />);

    await waitFor(() => expect(screen.getByText("No responses yet.")).toBeInTheDocument());
  });
});
