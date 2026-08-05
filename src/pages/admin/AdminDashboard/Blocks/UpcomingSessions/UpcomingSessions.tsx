import { useMemo } from "react";
import { Link } from "react-router-dom";

import dayjs from "dayjs";

import Avatar from "@components/shared/Avatar/Avatar";
import Badge from "@components/shared/Badge/Badge";
import Card from "@components/shared/Card/Card";

import { clientDisplayName, pickColor } from "@/Helpers/Helpers";
import type { Session, UserProfile } from "@/models/globalTypes";

import styles from "./UpcomingSessions.module.scss";

interface UpcomingSessionsProps {
  sessions: Session[];
  clients: UserProfile[];
  useCodenames?: boolean;
  limit?: number;
}

const ymd = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

const dayLabel = (iso: string) => {
  const d = dayjs(iso);
  const today = dayjs();
  if (ymd(d) === ymd(today)) return "Today";
  if (ymd(d) === ymd(today.add(1, "day"))) return "Tomorrow";
  return d.format("ddd D MMM");
};

// Headerless card — the next `limit` upcoming (future, non-cancelled) sessions.
export default function UpcomingSessions({
  sessions,
  clients,
  useCodenames = false,
  limit = 6,
}: UpcomingSessionsProps) {
  const upcoming = useMemo(() => {
    const now = new Date();
    return sessions
      .filter((s) => s.status !== "cancelled" && new Date(s.scheduled_at) > now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .slice(0, limit);
  }, [sessions, limit]);

  const clientName = (id: string | null) => {
    const c = clients.find((x) => x.id === id);
    if (!c) return "Client";
    return clientDisplayName(c, useCodenames);
  };

  return (
    <Card className={styles.pad}>
      {upcoming.length === 0 ? (
        <p className={styles.empty}>No upcoming sessions booked.</p>
      ) : (
        <ul className={styles.list}>
          {upcoming.map((s) => (
            <li key={s.id}>
              <Link to={s.client_id ? `/admin/clients/${s.client_id}` : "/admin/scheduler"} className={styles.row}>
                <div className={styles.when}>
                  <span className={styles.day}>{dayLabel(s.scheduled_at)}</span>
                  <span className={styles.time}>{dayjs(s.scheduled_at).format("h:mma")}</span>
                </div>
                <Avatar name={clientName(s.client_id)} color={pickColor(s.client_id ?? "x")} size={34} />
                <div className={styles.info}>
                  <p className={styles.name}>{clientName(s.client_id)}</p>
                  <p className={styles.meta}>
                    {s.location === "in_person" ? "In person" : "Online"} · {s.duration_minutes} min
                  </p>
                </div>
                <Badge variant={s.paid ? "success" : "warning"}>{s.paid ? "Paid" : "Unpaid"}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
