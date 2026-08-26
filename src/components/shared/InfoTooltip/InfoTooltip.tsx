import { useEffect, useRef, useState } from "react";

import Modal from "@components/shared/Modal/Modal";

import styles from "./InfoTooltip.module.scss";

export type TooltipPosition = "top" | "bottom" | "left" | "right";
export type TooltipTrigger = "hover" | "click" | "both";
export type InfoVariant = "basic" | "rich";

interface InfoTooltipProps {
  text: string;
  variant?: InfoVariant;
  title?: string;
  videoUrl?: string;
  position?: TooltipPosition;
  trigger?: TooltipTrigger;
  className?: string;
}

export default function InfoTooltip({
  text,
  variant = "basic",
  title,
  videoUrl,
  position = "top",
  trigger = "hover",
  className,
}: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  // Close on outside click (for click/both trigger)
  useEffect(() => {
    if (!visible || trigger === "hover" || variant === "rich") return;

    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [visible, trigger, variant]);

  // Close on Escape (basic tooltip only — the rich modal handles its own Escape)
  useEffect(() => {
    if (!visible || variant === "rich") return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [visible, variant]);

  const hoverProps =
    variant === "basic" && (trigger === "hover" || trigger === "both")
      ? {
          onMouseEnter: () => setVisible(true),
          onMouseLeave: () => setVisible(false),
          onFocus: () => setVisible(true),
          onBlur: () => setVisible(false),
        }
      : {};

  const clickProps =
    variant === "rich" || trigger === "click" || trigger === "both"
      ? {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            setVisible((v) => !v);
          },
        }
      : {};

  return (
    <span className={`${styles.wrapper} ${className ?? ""}`}>
      <button
        ref={ref}
        type="button"
        className={styles.trigger}
        aria-label={`More information: ${title ?? text}`}
        aria-expanded={variant === "rich" || trigger !== "hover" ? visible : undefined}
        {...hoverProps}
        {...clickProps}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
          <circle cx="7" cy="7" r="6.25" stroke="currentColor" strokeWidth="1.25" />
          <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="7" cy="4" r="0.75" fill="currentColor" />
        </svg>
      </button>

      {variant === "basic" && visible && (
        <span role="tooltip" className={`${styles.tooltip} ${styles[position]}`}>
          {text}
          <span className={styles.arrow} aria-hidden="true" />
        </span>
      )}

      {variant === "rich" && visible && (
        <Modal title={title ?? "More information"} onClose={() => setVisible(false)} size="sm">
          <div className={styles.richBody}>
            {text.split("\n").map((line, i) =>
              line.trim() === "" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text, order never changes
                <br key={i} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text, order never changes
                <p key={i}>{line}</p>
              ),
            )}
          </div>

          {videoUrl && (
            <div className={styles.videoWrap}>
              <iframe
                src={videoUrl}
                title={title ?? "Video"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </Modal>
      )}
    </span>
  );
}
