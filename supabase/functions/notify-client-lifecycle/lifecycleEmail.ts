// Pure logic for the notify-client-lifecycle edge function, split out so it can
// be unit-tested with vitest (index.ts is Deno/HTTP glue and imports
// _shared/email.ts, which touches Deno.env at load time).

export type LifecycleEvent = "deactivated" | "reactivated" | "closed";

export const LIFECYCLE_EMAIL_TYPE: Record<LifecycleEvent, string> = {
  deactivated: "account_deactivated",
  reactivated: "account_reactivated",
  closed: "account_closed",
};

export function isValidEvent(value: unknown): value is LifecycleEvent {
  return value === "deactivated" || value === "reactivated" || value === "closed";
}

/**
 * Whether we can/should send for this event. Returns a reason when skipping so
 * the caller can report it.
 */
export function lifecycleSkipReason(opts: {
  email: string | null | undefined;
  event: LifecycleEvent;
  disabledEmailTypes?: string[] | null;
}): string | null {
  const { email, event, disabledEmailTypes } = opts;
  if (!email || email.endsWith("@deleted.invalid")) return "no reachable email";
  if ((disabledEmailTypes ?? []).includes(LIFECYCLE_EMAIL_TYPE[event])) return "practice disabled this type";
  return null;
}

export type LifecycleEmailContent = {
  label: string;
  subject: string;
  title: string;
  paras: string[];
  notes: string[];
  cta?: { label: string; url: string };
};

export function buildLifecycleEmail(opts: {
  event: LifecycleEvent;
  firstName?: string | null;
  appUrl?: string | null;
}): LifecycleEmailContent {
  const name = opts.firstName?.trim() || "there";
  const appUrl = (opts.appUrl ?? "").replace(/\/$/, "");

  if (opts.event === "deactivated") {
    return {
      label: "Account deactivated",
      subject: "Your account has been deactivated",
      title: `Hi ${name}, your account has been deactivated`,
      paras: [
        "Your practitioner has ended your access to their practice management platform. You won't be able to sign in from now on.",
      ],
      notes: [
        "Your session and payment history is retained on your practitioner's records for as long as their professional guidelines require. If you have any questions, please contact your practitioner directly.",
      ],
    };
  }

  if (opts.event === "reactivated") {
    return {
      label: "Account reactivated",
      subject: "Your account has been reactivated",
      title: `Hi ${name}, your account is active again`,
      paras: ["Your practitioner has restored your access. You can sign in again using your existing details."],
      notes: [],
      cta: appUrl ? { label: "Sign in", url: `${appUrl}/login` } : undefined,
    };
  }

  return {
    label: "Account closed",
    subject: "Your account has been closed",
    title: `Hi ${name}, your account is now closed`,
    paras: ["This confirms your account has been closed at your request. Your login has been removed."],
    notes: [
      "Your personal details have been anonymised. Your practitioner keeps an anonymised record of your sessions and payments — identified only by a codename — for as long as their professional guidelines require.",
    ],
  };
}
