import { describe, expect, it } from "vitest";

import { emailTemplate } from "./email.ts";

describe("emailTemplate — light-only", () => {
  const html = emailTemplate({
    label: "Session reminder",
    title: "Hi Sam,",
    body: "<p>See you soon.</p>",
    footerNote: "You received this because you have a session booked through Clarity.",
    unsubscribeUrl: "https://withclarity.uk/unsubscribe?token=abc",
  });

  it("declares itself light-only so clients don't dark-transform it", () => {
    expect(html).toContain('name="color-scheme" content="light only"');
    expect(html).toContain('name="supported-color-schemes" content="light"');
    expect(html).toContain("color-scheme: only light");
  });

  it("carries no prefers-color-scheme:dark or Outlook data-ogsc overrides", () => {
    expect(html).not.toContain("prefers-color-scheme");
    expect(html).not.toContain("data-ogsc");
    expect(html).not.toContain("data-ogsb");
  });

  it("paints the page ground and card white", () => {
    expect(html).toContain('bgcolor="#ffffff"');
  });
});
