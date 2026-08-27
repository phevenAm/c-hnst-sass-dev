import { clientDisplayName } from "@/Helpers/Helpers";
import type { ClientStub, Session, UserProfile } from "@/models/globalTypes";

// Just the stub_sessions columns this block needs — the dashboard fetches a
// wider select than the revenue chart used to.
export interface UpcomingStubSession {
  id: string;
  stub_id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
  paid: boolean;
  location: string | null;
}

// One normalised row, whether it came from `sessions` or `stub_sessions`.
export interface UpcomingRow {
  key: string;
  scheduledAt: string;
  name: string;
  colorKey: string;
  to: string;
  paid: boolean;
  location: string | null;
  durationMinutes: number | null;
  isOffline: boolean;
}

interface BuildArgs {
  sessions: Session[];
  clients: UserProfile[];
  stubSessions?: UpcomingStubSession[];
  stubs?: ClientStub[];
  useCodenames?: boolean;
  limit?: number;
  now?: number;
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Merge real client sessions and offline-client (stub) sessions into one
// soonest-first list of the next `limit` still-to-come, non-cancelled sessions
// within the next 7 days. `now` is injectable for tests.
export function buildUpcomingRows({
  sessions,
  clients,
  stubSessions = [],
  stubs = [],
  useCodenames = false,
  limit = 6,
  now = Date.now(),
}: BuildArgs): UpcomingRow[] {
  const cutoff = now + WINDOW_MS;
  const inWindow = (iso: string) => {
    const t = new Date(iso).getTime();
    return t > now && t <= cutoff;
  };

  const clientName = (id: string | null) => {
    const c = clients.find((x) => x.id === id);
    return c ? clientDisplayName(c, useCodenames) : "Client";
  };
  const stubName = (stub: ClientStub | undefined) => {
    if (!stub) return "Offline client";
    const full = `${stub.first_name} ${stub.last_name}`.trim();
    return useCodenames ? stub.codename || full : full;
  };

  const realRows: UpcomingRow[] = sessions
    .filter((s) => s.status !== "cancelled" && inWindow(s.scheduled_at))
    .map((s) => ({
      key: `session-${s.id}`,
      scheduledAt: s.scheduled_at,
      name: clientName(s.client_id),
      colorKey: s.client_id ?? "x",
      to: s.client_id ? `/admin/clients/${s.client_id}` : "/admin/scheduler",
      paid: s.paid,
      location: s.location,
      durationMinutes: s.duration_minutes,
      isOffline: false,
    }));

  // A stub that's been linked to a real client is no longer its own client —
  // its sessions are imported onto the real client (see merge_stub_to_user),
  // so listing them here too would double them up and point at a person who
  // isn't in the client list. Mirror the scheduler, which filters the same way.
  const linkedStubIds = new Set(stubs.filter((st) => st.linked_user_id).map((st) => st.id));

  const stubRows: UpcomingRow[] = stubSessions
    .filter((s) => s.status !== "cancelled" && !linkedStubIds.has(s.stub_id) && inWindow(s.scheduled_at))
    .map((s) => ({
      key: `stub-${s.id}`,
      scheduledAt: s.scheduled_at,
      name: stubName(stubs.find((st) => st.id === s.stub_id)),
      colorKey: `stub-${s.stub_id}`,
      to: `/admin/clients/stub/${s.stub_id}`,
      paid: s.paid,
      location: s.location,
      durationMinutes: s.duration_minutes,
      isOffline: true,
    }));

  return [...realRows, ...stubRows]
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, limit);
}
