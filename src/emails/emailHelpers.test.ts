import { describe, expect, it } from "vitest";

import {
  previewPaymentReceived,
  previewSessionBooked,
  previewSessionCancelled,
  previewSessionRescheduled,
} from "./emailHelpers";

// Settings → Emails used to only let admins customize the session-reminder
// template (previewSessionReminder) — these four were preview-only, no
// subject/body/heading override. See feature_all_email_templates_editable.

describe("previewSessionBooked", () => {
  it("falls back to the default intro/title when no custom content is given", () => {
    const html = previewSessionBooked();
    expect(html).toContain("Your session has been confirmed. Here are the details:");
    expect(html).toContain("your session is booked");
  });

  it("substitutes {{name}}/{{date}}/{{location}}/{{duration}} in a custom body", () => {
    const html = previewSessionBooked("Hi {{name}}! See you {{date}} for {{duration}} ({{location}}).");
    expect(html).toContain("Hi Alex! See you Monday 10 August 2026 at 2:00pm for 50 minutes (Online).");
    expect(html).not.toContain("{{name}}");
  });

  it("substitutes {{name}} in a custom heading", () => {
    const html = previewSessionBooked(undefined, "Welcome back, {{name}}!");
    expect(html).toContain("Welcome back, Alex!");
  });

  it("keeps the details table even when the body is customised", () => {
    const html = previewSessionBooked("A totally custom intro.");
    expect(html).toContain("A totally custom intro.");
    expect(html).toContain("Fee"); // details table row, unaffected by customBody
  });
});

describe("previewSessionCancelled", () => {
  it("falls back to the default copy when nothing custom is given", () => {
    expect(previewSessionCancelled()).toContain("The following session has been cancelled:");
  });

  it("interpolates a custom body and heading", () => {
    const html = previewSessionCancelled("Sorry {{name}}, {{date}} won't work.", "Bad news, {{name}}");
    expect(html).toContain("Sorry Alex, Monday 10 August 2026 at 2:00pm won't work.");
    expect(html).toContain("Bad news, Alex");
  });
});

describe("previewSessionRescheduled", () => {
  it("falls back to the default copy when nothing custom is given", () => {
    expect(previewSessionRescheduled()).toContain("Your session has been moved to a new time:");
  });

  it("interpolates {{date}} and {{location}} in a custom body", () => {
    const html = previewSessionRescheduled("New slot: {{date}}, {{location}}.");
    expect(html).toContain("New slot: Monday 10 August 2026 at 2:00pm, Online.");
  });
});

describe("previewPaymentReceived", () => {
  it("falls back to the default copy when nothing custom is given", () => {
    expect(previewPaymentReceived()).toContain("has been received for a session on");
  });

  it("interpolates {{amount}} (payment-specific token, no location/duration)", () => {
    const html = previewPaymentReceived("Thanks {{name}}, we got your {{amount}} on {{date}}.");
    expect(html).toContain("Thanks Alex, we got your £60.00 on Monday 10 August 2026 at 2:00pm.");
  });

  it("is case-insensitive on token names", () => {
    const html = previewPaymentReceived("Hi {{Name}}, {{AMOUNT}} received.");
    expect(html).toContain("Hi Alex, £60.00 received.");
  });
});
