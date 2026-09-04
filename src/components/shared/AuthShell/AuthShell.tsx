import React from "react";

import { LeafLogoMark } from "@components/shared/Icons/Icons";
import ImageBlurBlock from "@components/shared/ImageBlurBlock/ImageBlurBlock";

import styles from "./AuthShell.module.scss";

type AuthShellProps = {
  /** Sits under the "Clarity" wordmark in the card header. */
  tagline: string;
  /** The inner form panel — heading, form, footer links. */
  children: React.ReactNode;
  /** Extra node pinned to the right of the header, e.g. step dots. */
  headerAside?: React.ReactNode;
  /** Quiet line under the form panel, still inside the card (e.g. the demo prompt). */
  footer?: React.ReactNode;
  /** Wider card for the two-column sign-up forms. */
  wide?: boolean;
  /** The blurred photo panel — on for login/sign-up, off for the plainer demo page. */
  photo?: boolean;
};

// Shared chrome for every auth page (login, sign-up, counsellor sign-up, demo):
// the tinted-ground page, the centred column, and one card whose header band
// carries the logo + tagline. Pages own only their card *body* (and its
// field/button styles) via their own module.
export default function AuthShell({
  tagline,
  children,
  headerAside,
  footer,
  wide = false,
  photo = true,
}: AuthShellProps) {
  return (
    <main className={`${styles.page} page`}>
      {photo && (
        <ImageBlurBlock
          imageUrl="/pexels-amirali-shaghaghi-18428647.jpg"
          photographer="Amirali Shaghaghi"
          sourceLabel="Pexels"
          creditUrl="https://www.pexels.com/@amirali-shaghaghi-479660570/"
        />
      )}
      <div className={`${styles.container} container`}>
        <div
          className={[styles.card, wide ? styles.cardWide : "", photo ? styles.onPhoto : ""].filter(Boolean).join(" ")}
        >
          <header className={styles.header}>
            <LeafLogoMark size={40} color="var(--logo-color, var(--accent))" />
            <div className={styles.headerText}>
              <span className={styles.title}>Clarity</span>
              <span className={styles.tagline}>{tagline}</span>
            </div>
            {headerAside && <div className={styles.headerAside}>{headerAside}</div>}
          </header>
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      </div>
    </main>
  );
}
