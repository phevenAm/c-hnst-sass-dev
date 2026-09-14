import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import TrendChart, { MultiTooltip } from "./TrendChart";

afterEach(cleanup);

describe("TrendChart", () => {
  it("shows the title for a single-series chart", () => {
    render(<TrendChart title="Sessions per week" data={[{ label: "Mon", value: 3 }]} />);
    expect(screen.getByText("Sessions per week")).toBeInTheDocument();
  });

  it("shows 'No data yet' when every single-series value is zero", () => {
    render(<TrendChart title="Sessions per week" data={[{ label: "Mon", value: 0 }]} />);
    expect(screen.getByText("No data yet.")).toBeInTheDocument();
  });

  it("shows the title and renders past the empty check for a multi-series chart with data", () => {
    render(
      <TrendChart
        title="Revenue vs outgoings"
        data={[{ label: "Apr", Revenue: 100, Outgoings: 20 }]}
        series={[
          { key: "Revenue", name: "Revenue", color: "#4a665b" },
          { key: "Outgoings", name: "Outgoings", color: "#a8633a", kind: "line" },
        ]}
      />,
    );
    expect(screen.getByText("Revenue vs outgoings")).toBeInTheDocument();
    expect(screen.queryByText("No data yet.")).not.toBeInTheDocument();
  });

  it("shows 'No data yet' when every multi-series value is zero, including a right-axis series", () => {
    render(
      <TrendChart
        title="Revenue vs outgoings vs sessions"
        data={[{ label: "Apr", Revenue: 0, Sessions: 0 }]}
        series={[
          { key: "Revenue", name: "Revenue", color: "#4a665b" },
          { key: "Sessions", name: "Sessions", color: "#3a7fa8", axis: "right" },
        ]}
      />,
    );
    expect(screen.getByText("No data yet.")).toBeInTheDocument();
  });
});

describe("MultiTooltip", () => {
  const series = [
    { key: "Revenue", name: "Revenue", color: "#4a665b" },
    {
      key: "Sessions",
      name: "Sessions",
      color: "#3a7fa8",
      axis: "right" as const,
      valueFormatter: (v: number) => `${v} sessions`,
    },
  ];
  const payload = [
    { value: 250, name: "Revenue", color: "#4a665b", dataKey: "Revenue" },
    { value: 4, name: "Sessions", color: "#3a7fa8", dataKey: "Sessions" },
  ];

  it("falls back to the chart's valueFormatter for a series without its own", () => {
    render(<MultiTooltip active label="Apr" payload={payload} valueFormatter={(v) => `£${v}`} series={series} />);
    expect(screen.getByText("£250")).toBeInTheDocument();
  });

  it("uses a series' own valueFormatter over the chart's default", () => {
    render(<MultiTooltip active label="Apr" payload={payload} valueFormatter={(v) => `£${v}`} series={series} />);
    expect(screen.getByText("4 sessions")).toBeInTheDocument();
    expect(screen.queryByText("£4")).not.toBeInTheDocument();
  });

  it("renders nothing when inactive", () => {
    const { container } = render(
      <MultiTooltip active={false} label="Apr" payload={payload} valueFormatter={(v) => `£${v}`} series={series} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
