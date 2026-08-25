import dayjs from "dayjs";

import Card from "@components/shared/Card/Card";

import styles from "./SessionPrepCard.module.scss";

type Props = {
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

  let noteBlock;

  if (lastNote) {
    noteBlock = (
      <p className={styles.noteText}>
        &ldquo;{notePreview}&rdquo; <span className={styles.noteDate}>— {dayjs(lastNote.createdAt).format("D MMM")}</span>
      </p>
    );
  } else if (notesLocked) {
    noteBlock = <p className={styles.noteMuted}>Unlock encryption (open any session's notes) to see the last note here.</p>;
  } else {
    noteBlock = <p className={styles.noteMuted}>No notes yet.</p>;
  }

  return (
    <Card className={styles.card}>
      <span className={styles.badge}>Session prep</span>
      <p className={styles.nextSession}>Next session {dayjs(nextSessionAt).format("D MMM, HH:mm")}</p>
      <p className={styles.stats}>
        {totalSessions} session{totalSessions === 1 ? "" : "s"} · {attendedSessions} attended
        {lastSeenAt ? ` · last session ${dayjs(lastSeenAt).format("D MMM")}` : ""}
      </p>

      {noteBlock}

      <button type="button" className={styles.viewNotes} onClick={onViewNotes}>
        View all notes →
      </button>
    </Card>
  );
}
