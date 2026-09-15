import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Size, Variant } from "@constants/constants";

import { ChevronDown } from "../Icons/Icons";

import styles from "./SplitButton.module.scss";

type DropdownCoords = { top: number; left: number; minWidth: number };

export interface SplitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  primaryAction: () => void;
  options: { label: string; onClick: () => void }[];
  primaryLabel: string;
  secondaryLabel?: string;
}

const SplitButton = ({
  variant = "primary",
  size = "md",
  primaryAction,
  options = [],
  primaryLabel = "placeholder primary label",
  secondaryLabel = "Show more options",
}: SplitButtonProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const [coords, setCoords] = useState<DropdownCoords>({ top: 0, left: 0, minWidth: 0 });
  const classes = [styles.btn, styles[variant], styles[size]].filter(Boolean).join(" ");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // The dropdown itself lives in a document.body portal, so it's never a DOM
  // descendant of wrapperRef — the outside-click closer below needs its own
  // ref to it, or every option click reads as "outside" (mousedown fires,
  // closes the menu and unmounts the button, before the click that would
  // have run its onClick ever arrives) and silently does nothing.
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Rendered in a portal on document.body (see below) so the dropdown escapes
  // any ancestor's overflow:hidden / stacking context — a row in a scrolling
  // list, a modal body, a narrow card. Position is measured off the wrapper
  // each time it opens, flipping upward when there isn't room below.
  const handleToggle = () => {
    if (!isDropdownOpen && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const estimatedHeight = options.length * 36 + 16;
      const flipUp = rect.bottom + estimatedHeight > window.innerHeight;
      setOpensUpward(flipUp);
      setCoords({
        top: flipUp ? rect.top - estimatedHeight : rect.bottom,
        left: Math.min(rect.left, window.innerWidth - rect.width - 8),
        minWidth: rect.width,
      });
    }
    setIsDropdownOpen((prev) => !prev);
  };

  // Keep the menu glued to its trigger if the page scrolls or resizes while open.
  useEffect(() => {
    if (!isDropdownOpen) return;
    const reposition = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const estimatedHeight = options.length * 36 + 16;
      const flipUp = rect.bottom + estimatedHeight > window.innerHeight;
      setOpensUpward(flipUp);
      setCoords({
        top: flipUp ? rect.top - estimatedHeight : rect.bottom,
        left: Math.min(rect.left, window.innerWidth - rect.width - 8),
        minWidth: rect.width,
      });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [isDropdownOpen, options.length]);

  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setIsDropdownOpen(false);
    };
    // mousedown fires before the next click handler, ensuring this dropdown
    // closes before another one opens when the user clicks a different trigger
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, []);

  const wrapperClass = [
    styles.buttonWrapper,
    isDropdownOpen ? styles.dropdownOpen : "",
    isDropdownOpen && opensUpward ? styles.opensUpward : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <button
        type="button"
        className={[classes, styles.mainButton].filter(Boolean).join(" ")}
        onClick={() => primaryAction()}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        className={[styles.secondaryButton, classes].filter(Boolean).join(" ")}
        aria-label={secondaryLabel}
        onClick={handleToggle}
      >
        <ChevronDown />
      </button>

      {isDropdownOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            data-testid="split-button-dropdown"
            className={[styles.dropdown, styles.dropdownPortal, opensUpward ? styles.dropdownUp : ""]
              .filter(Boolean)
              .join(" ")}
            style={{ top: coords.top, left: coords.left, minWidth: coords.minWidth }}
          >
            <ul>
              {options.map(({ label, onClick }) => (
                <li key={label}>
                  <button
                    type="button"
                    className={styles.labelButton}
                    onClick={() => {
                      onClick();
                      setIsDropdownOpen(false);
                    }}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default SplitButton;
