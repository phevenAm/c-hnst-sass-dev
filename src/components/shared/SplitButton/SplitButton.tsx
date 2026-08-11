import React, { useEffect, useRef, useState } from "react";

import { Size, Variant } from "@constants/constants";

import { ChevronDown } from "../Icons/Icons";

import styles from "./SplitButton.module.scss";

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
  const classes = [styles.btn, styles[variant], styles[size]].filter(Boolean).join(" ");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleToggle = () => {
    if (!isDropdownOpen && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const estimatedHeight = options.length * 36 + 16;
      setOpensUpward(rect.bottom + estimatedHeight > window.innerHeight);
    }
    setIsDropdownOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setIsDropdownOpen(false);
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
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

      {isDropdownOpen && (
        <div className={[styles.dropdown, opensUpward ? styles.dropdownUp : ""].filter(Boolean).join(" ")}>
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
        </div>
      )}
    </div>
  );
};

export default SplitButton;
