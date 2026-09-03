import { Button } from "@/components/shared";
import Spinner from "@/components/shared/Spinner/Spinner";
import type { Response, UserProfile } from "../models/globalTypes";

export const isQuestionnaireCheckInDue = (date: string, frequency: string) => {
  const now = new Date();
  const d = new Date(date);

  const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);

  if (frequency === "daily") return diffDays >= 1;
  if (frequency === "weekly") return diffDays >= 7;
  if (frequency === "fortnightly") return diffDays >= 14;

  return false;
};

export const getResponseDate = (response: Response) => response.submitted_at ?? response.created_at ?? "";

export const getInitials = (displayName: string | null, firstName = "", lastName = ""): string => {
  const name = displayName?.trim() || `${firstName} ${lastName}`.trim();
  const parts = name.split(" ").filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
};

export const AVATAR_COLORS = ["teal", "sage", "stone", "sky", "clay"] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];
export const pickColor = (userId: string): AvatarColor => AVATAR_COLORS[userId.charCodeAt(0) % AVATAR_COLORS.length];

export const isPdfUrl = (url: string): boolean => {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
};

export const ageFromDob = (dob: string | null | undefined): number | null => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthday = now >= new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
};

export const isAdultFromDob = (dob: string | null | undefined): boolean => {
  const age = ageFromDob(dob);
  return age != null && age >= 18;
};

// Compact "3 days ago" style relative time. Returns "" for missing/bad input.
// Falls back to an absolute date once past ~30 days.
export const timeAgo = (iso: string | null | undefined, now: number = Date.now()): string => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((now - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days <= 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(then).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// Optional client-profile fields (age, email, last seen). Returns the string to
// render, or null to render nothing. Off unless the counsellor turned it on for
// that client; the practice-wide `masterHidden` switch hides all of them;
// masked as *** while codenames are on.
export const maskedProfileValue = (
  value: string | number | null | undefined,
  opts: { show: boolean | null | undefined; codenames?: boolean; masterHidden?: boolean },
): string | null => {
  if (opts.masterHidden || !opts.show || value == null || value === "") return null;
  return opts.codenames ? "***" : String(value);
};

export function clientDisplayName(
  client: Pick<UserProfile, "first_name" | "last_name" | "display_name" | "admin_codename">,
  useCodenames = false,
): string {
  if (useCodenames && client.admin_codename) return client.admin_codename;
  const name = client.display_name || `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim();
  if (name) return name;
  // Anonymised (or never-named) clients have no name fields left — fall back to
  // the codename before the generic label so they stay identifiable to the admin.
  return client.admin_codename || "Unnamed client";
}

export function isPageStatusLoading(...statuses: string[]) {
  if (statuses.some((s) => s === "loading" || s === "idle")) {
    return (
      <div className="page">
        <Spinner />
      </div>
    );
  }
  if (statuses.some((s) => s === "failed")) {
    return (
      <div className="page">
        <h1>oops something went wrong</h1>
        <p>Maybe give the page a reload</p>

        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    );
  }
}
