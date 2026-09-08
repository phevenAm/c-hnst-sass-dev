import { describe, expect, it } from "vitest";

import { computeDropdownCoords, DESKTOP_WIDTH, GAP, GUTTER, MOBILE_MAX_WIDTH } from "./dropdownPosition";

const rect = (bottom: number, right: number) => ({ bottom, right }) as Pick<DOMRect, "bottom" | "right">;

describe("computeDropdownCoords", () => {
  it("hangs a fixed-width panel off the bell's right edge on desktop", () => {
    // Bell right edge 40px from a 1440px viewport → panel offset 40 from the right.
    expect(computeDropdownCoords(rect(64, 1400), 1440)).toEqual({
      top: 64 + GAP,
      left: "auto",
      right: 40,
      width: DESKTOP_WIDTH,
    });
  });

  it("keeps at least an 8px gutter when the bell sits flush to the edge", () => {
    expect(computeDropdownCoords(rect(64, 1445), 1440).right).toBe(GUTTER);
  });

  it("goes full-bleed between both gutters on mobile — never anchored off the bell", () => {
    // The bell is nowhere near the right edge (avatar + Sign out follow it), so
    // anchoring right/left both produced a lopsided gap. Full-bleed instead.
    expect(computeDropdownCoords(rect(56, 250), MOBILE_MAX_WIDTH)).toEqual({
      top: 56 + GAP,
      left: GUTTER,
      right: GUTTER,
      width: "auto",
    });
  });

  it("switches layout exactly at the mobile breakpoint", () => {
    const belowLeftRight = computeDropdownCoords(rect(56, 300), MOBILE_MAX_WIDTH - 1);
    expect([belowLeftRight.left, belowLeftRight.right, belowLeftRight.width]).toEqual([GUTTER, GUTTER, "auto"]);

    const above = computeDropdownCoords(rect(56, 300), MOBILE_MAX_WIDTH + 1);
    expect(above.left).toBe("auto");
    expect(above.width).toBe(DESKTOP_WIDTH);
  });
});
