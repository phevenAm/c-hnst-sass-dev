import "@testing-library/jest-dom/vitest";
import { toHaveNoViolations } from "jest-axe";
import { expect, vi } from "vitest";

expect.extend(toHaveNoViolations);

// Recharts' ResponsiveContainer uses ResizeObserver which JSDOM doesn't provide
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// JSDOM doesn't implement scrollIntoView — components that scroll a
// deep-linked element into view (e.g. AdminClientsPageDetailed's ?session=
// handler) would otherwise throw in tests.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// lottie-web probes canvas 2D context at import time; JSDOM's getContext()
// returns null without the optional "canvas" package, which crashes the
// import outright. Stub the component so anything importing it (even
// transitively, e.g. via the shared components barrel) doesn't blow up.
vi.mock("lottie-react", () => ({
  default: () => null,
}));
