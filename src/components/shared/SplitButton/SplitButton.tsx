import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const classes = [styles.btn, styles[variant], styles[size]].filter(Boolean).join(" ");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const handleToggle = () => {
    if (!isDropdownOpen && wrapperRef.current) {
      setDropdownRect(wrapperRef.current.getBoundingClientRect());
    }
    setIsDropdownOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | KeyboardEvent) => {
      if (wrapperRef.current?.contains(e.target as Node) || dropdownRef.current?.contains(e.target as Node)) return;
      setIsDropdownOpen(false);
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={[styles.buttonWrapper, isDropdownOpen ? styles.dropdownOpen : ""].filter(Boolean).join(" ")}
    >
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
        dropdownRect &&
        createPortal(
          <div
            ref={dropdownRef}
            className={styles.portalDropdown}
            style={{
              top: dropdownRect.bottom,
              right: window.innerWidth - dropdownRect.right,
              minWidth: dropdownRect.width,
            }}
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
