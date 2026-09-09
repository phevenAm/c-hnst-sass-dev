// The UpdateBanner only renders in an installed PWA when a newer build is live.
// We fake both conditions: force `(display-mode: standalone)` to match, and
// stub /version.json to a version that won't equal the built __APP_VERSION__.
//
// Regression target (admin_todos 502c4b3a): on a phone the banner stacked its
// text over the actions and the "Update now" / "Later" buttons could end up
// clipped or off-screen. Both must be fully visible within the viewport.

import { expect, test } from "@playwright/test";

const BASE = "http://localhost:5174";
const MOBILE = { width: 375, height: 667 };

test.use({ viewport: MOBILE });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    // report the app as an installed PWA
    // @ts-expect-error - test shim
    window.matchMedia = (q: string) =>
      q === "(display-mode: standalone)"
        ? {
            matches: true,
            media: q,
            addEventListener() {},
            removeEventListener() {},
            onchange: null,
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
          }
        : real(q);
  });
  await page.route("**/version.json*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: "999.999.999" }) }),
  );
});

test("on mobile the banner shows with both actions fully on-screen", async ({ page }) => {
  await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 20_000 });

  await expect(page.getByText(/a new version is available/i)).toBeVisible({ timeout: 15_000 });

  const updateBtn = page.getByRole("button", { name: /update now/i });
  const laterBtn = page.getByRole("button", { name: /^later$/i });
  await expect(updateBtn).toBeVisible();
  await expect(laterBtn).toBeVisible();

  for (const [name, box] of [
    ["update now", await updateBtn.boundingBox()],
    ["later", await laterBtn.boundingBox()],
  ] as const) {
    expect(box, `${name} button has a box`).not.toBeNull();
    if (!box) continue;
    expect(box.x, `${name} not off the left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} not clipped on the right`).toBeLessThanOrEqual(MOBILE.width + 0.5);
    expect(box.width, `${name} has real width`).toBeGreaterThan(20);
  }
});

test("'Later' hides the banner and it does not immediately return", async ({ page }) => {
  await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.getByRole("button", { name: /^later$/i }).click();
  await expect(page.getByText(/a new version is available/i)).toHaveCount(0);
  await page.waitForTimeout(1_500);
  await expect(page.getByText(/a new version is available/i)).toHaveCount(0);
});
