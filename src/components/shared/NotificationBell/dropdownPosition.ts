// Where the notification panel sits, measured off the bell button. Pulled out
// as a pure function so the fiddly bits — the mobile breakpoint, the
// right-edge offset, the 8px viewport gutter — are unit-testable without a DOM.

export type DropdownCoords = {
  top: number;
  left: number | "auto";
  right: number | "auto";
  /** Explicit width in px, or "auto" to span between `left` and `right`. */
  width: number | "auto";
};

/** Viewport width (px) at or below which the panel spans the screen instead of
 *  hanging off the bell. */
export const MOBILE_MAX_WIDTH = 560;

/** Gap between the bell and the top of the panel, and the gutter from each
 *  viewport edge on small screens. */
export const GAP = 10;
export const GUTTER = 8;

/** Panel width on wider screens, where it hangs off the bell's right edge. */
export const DESKTOP_WIDTH = 340;

export function computeDropdownCoords(rect: Pick<DOMRect, "bottom" | "right">, viewportWidth: number): DropdownCoords {
  const top = rect.bottom + GAP;

  if (viewportWidth <= MOBILE_MAX_WIDTH) {
    // Full-bleed between the gutters — anchoring it under the bell (which isn't
    // the right-most item in the bar) left an odd gap on the right and read as
    // "opening to the left".
    return { top, left: GUTTER, right: GUTTER, width: "auto" };
  }

  // Right-align the panel with the bell, but never let it tuck under the
  // viewport's right gutter.
  return {
    top,
    left: "auto",
    right: Math.max(GUTTER, viewportWidth - rect.right),
    width: DESKTOP_WIDTH,
  };
}
