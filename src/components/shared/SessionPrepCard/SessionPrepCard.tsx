import dayjs from "dayjs";

import Card from "@components/shared/Card/Card";

import styles from "./SessionPrepCard.module.scss";

type Props = {
  clientName: string;
  nextSessionAt: string;
  totalSessions: number;
  attendedSessions: number;
  lastSeenAt: string | null;
  lastNote: { content: string; createdAt: string } | null;
  /** Notes are client-side encrypted and the admin hasn't unlocked them this session. */
  notesLocked: boolean;
  onViewNotes: () => void;
};

const NOTE_PREVIEW_LENGTH = 220;

export default function SessionPrepCard({
  clientName,
  nextSessionAt,
  totalSessions,
  attendedSessions,
  lastSeenAt,
  lastNote,
  notesLocked,
  onViewNotes,
}: Props) {
  const notePreview =
    lastNote?.content && lastNote.content.length > NOTE_PREVIEW_LENGTH
      ? `${lastNote.content.slice(0, NOTE_PREVIEW_LENGTH)}…`
      : lastNote?.content;

  return (
    <Card className={styles.card}>
      <p className={styles.title}>Session prep: {clientName}</p>
      <p className={styles.nextSession}>Next session: {dayjs(nextSessionAt).format("D MMM, HH:mm")}</p>
      <p className={styles.stats}>
        {totalSessions} session{totalSessions === 1 ? "" : "s"} · {attendedSessions} attended
        {lastSeenAt ? ` · last seen ${dayjs(lastSeenAt).format("D MMM")}` : ""}
      </p>

      {lastNote ? (
        <div className={styles.noteBlock}>
          <p className={styles.noteLabel}>Last note ({dayjs(lastNote.createdAt).format("D MMM")}):</p>
          <p className={styles.noteText}>&ldquo;{notePreview}&rdquo;</p>
        </div>
      ) : notesLocked ? (
        <p className={styles.noteMuted}>Unlock encryption (open any session's notes) to see the last note here.</p>
      ) : (
        <p className={styles.noteMuted}>No notes yet.</p>
      )}

      <button type="button" className={styles.viewNotes} onClick={onViewNotes}>
        View all notes →
      </button>
    </Card>
  );
}
