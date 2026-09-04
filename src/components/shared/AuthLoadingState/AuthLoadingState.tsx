import { useSyncExternalStore } from "react";

import { LeafLogoMark } from "@components/shared/Icons/Icons";

import { isHeroSplashDone, subscribeHeroSplashDone } from "@/lib/heroSplashState";

import styles from "./AuthLoadingState.module.css";

type Props = {
  // "splash" is the very first thing a user sees on a cold load (before any
  // layout/navbar exists), so it's just the logo. "plain" is used deeper in
  // the tree — switching between already-loaded routes — where a small
  // spinner reads as a brief pause rather than a full loading moment.
  variant?: "splash" | "plain";
};

export default function AuthLoadingState({ variant = "splash" }: Props) {
  // <HeroSplash> owns the cold-boot moment — while it's still up (or hasn't
  // rendered yet), every other "loading" gate defers to it instead of
  // popping its own splash on top of/behind it. See heroSplashState.ts.
  const heroSplashDone = useSyncExternalStore(subscribeHeroSplashDone, isHeroSplashDone, () => true);

  if (variant === "splash" && !heroSplashDone) return null;

  if (variant === "plain") {
    return (
      <div className={styles.wrapper}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.splash}>
      <div className={styles.splashLogo}>
        {/* color="currentColor" so the SVG inherits the wrapper's animated color
            instead of the fixed --text-primary LeafLogoMark defaults to. */}
        <LeafLogoMark size={96} color="currentColor" />
      </div>
    </div>
  );
}
