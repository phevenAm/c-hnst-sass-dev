import { useMemo } from "react";
import { Link } from "react-router-dom";

import dayjs from "dayjs";

import Avatar from "@components/shared/Avatar/Avatar";
import Badge from "@components/shared/Badge/Badge";

import { pickColor } from "@/Helpers/Helpers";
import type { ClientStub, Session, UserProfile } from "@/models/globalTypes";
import { buildUpcomingRows, type UpcomingStubSession } from "./upcomingSessionsUtils";

import styles from "./UpcomingSessions.module.scss";

export type { UpcomingStubSession };

interface UpcomingSessionsProps {
  sessions: Session[];
  clients: UserProfile[];
  stubSessions?: UpcomingStubSession[];
  stubs?: ClientStub[];
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

// Headerless card — the next `limit` upcoming (future, non-cancelled) sessions,
// merging real client sessions and offline-client (stub) sessions.
export default function UpcomingSessions({
  sessions,
  clients,
  stubSessions = [],
  stubs = [],
  useCodenames = false,
  limit = 6,
}: UpcomingSessionsProps) {
  const upcoming = useMemo(
    () => buildUpcomingRows({ sessions, clients, stubSessions, stubs, useCodenames, limit }),
    [sessions, clients, stubSessions, stubs, useCodenames, limit],
  );

  return (
    <div className={styles.pad}>
      {upcoming.length === 0 ? (
        <p className={styles.empty}>No upcoming sessions booked.</p>
      ) : (
        <ul className={styles.list}>
          {upcoming.map((s) => (
            <li key={s.key}>
              <Link to={s.to} className={styles.row}>
                <div className={styles.when}>
                  <span className={styles.day}>{dayLabel(s.scheduledAt)}</span>
                  <span className={styles.time}>{dayjs(s.scheduledAt).format("h:mma")}</span>
                </div>
                <div className={styles.clientGroup}>
                  <Avatar name={s.name} color={pickColor(s.colorKey)} size={34} />
                  <div className={styles.info}>
                    <div className={styles.nameBadgeContainer}>
                      <p className={styles.name}>{s.name}</p>
                      <Badge variant={s.paid ? "success" : "warning"}>{s.paid ? "Paid" : "Unpaid"}</Badge>
                    </div>
                    <p className={styles.meta}>
                      {s.location === "in_person" ? "In person" : "Online"} · {s.durationMinutes} min
                      {s.isOffline ? " · Offline client" : ""}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
