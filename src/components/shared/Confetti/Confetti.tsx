import styles from "./Confetti.module.scss";

// 42 stable keys so we never key pieces by array index.
const KEYS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP".split("");

interface ConfettiProps {
  /** Number of pieces. Visual variation (colour/drift/timing) is defined for
   *  the first 16; extra pieces fall straight down. Default 16. */
  count?: number;
  /** Extra class on the wrapper — use it to position the burst origin. */
  className?: string;
}

/**
 * One-shot CSS confetti burst. Purely decorative (aria-hidden), no JS
 * animation — it plays once on mount and fades out.
 *
 * The nearest positioned ancestor is the origin: give the parent
 * `position: relative` and the pieces rain from its top edge. Override the
 * fall distance with `--confetti-fall` on the parent if needed.
 */
export default function Confetti({ count = 16, className = "" }: ConfettiProps) {
  return (
    <div className={`${styles.confetti} ${className}`.trim()} aria-hidden="true">
      {KEYS.slice(0, Math.max(0, count)).map((k) => (
        <span key={k} className={styles.piece} />
      ))}
    </div>
  );
}
