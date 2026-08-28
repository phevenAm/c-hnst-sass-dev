import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useWalkthrough } from "@context/WalkthroughContext";

import styles from "./WalkthroughOverlay.module.scss";

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CardPos {
  top: number;
  left: number;
  placement: "below" | "above" | "fallback";
}

const SPOTLIGHT_PAD = 10;
const CARD_GAP = 14;
const CARD_WIDTH = 440;
const VIEWPORT_PAD = 16;

// Viewport-relative rect of a target element, padded, ready for the fixed
// spotlight div.
function measureTarget(el: HTMLElement): SpotlightRect {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - SPOTLIGHT_PAD,
    left: r.left - SPOTLIGHT_PAD,
    width: r.width + SPOTLIGHT_PAD * 2,
    height: r.height + SPOTLIGHT_PAD * 2,
  };
}

function calcCardPos(sl: SpotlightRect, cardHeight: number): CardPos {
  const idealLeft = sl.left + sl.width / 2 - CARD_WIDTH / 2;
  const left = Math.max(VIEWPORT_PAD, Math.min(idealLeft, window.innerWidth - CARD_WIDTH - VIEWPORT_PAD));

  const spaceBelow = window.innerHeight - (sl.top + sl.height + CARD_GAP);
  const spaceAbove = sl.top - CARD_GAP;

  if (spaceBelow >= cardHeight + VIEWPORT_PAD) {
    return { top: sl.top + sl.height + CARD_GAP, left, placement: "below" };
  }
  if (spaceAbove >= cardHeight + VIEWPORT_PAD) {
    return { top: sl.top - cardHeight - CARD_GAP, left, placement: "above" };
  }
  return { top: window.innerHeight - cardHeight - VIEWPORT_PAD, left, placement: "fallback" };
}

// ── Prompt card ───────────────────────────────────────────────────────────────

function WalkthroughPrompt() {
  const { promptVisible, currentPage, acceptPrompt, declinePrompt } = useWalkthrough();
  if (!promptVisible || !currentPage) return null;

  return (
    <div className={styles.prompt} role="dialog" aria-label="Walkthrough offer">
      <p className={styles.promptQuestion}>
        Want a quick tour of <strong>{currentPage.pageTitle}</strong>?
      </p>
      <div className={styles.promptActions}>
        <button type="button" className={styles.btnDecline} onClick={declinePrompt}>
          No thanks
        </button>
        <button type="button" className={styles.btnAccept} onClick={acceptPrompt}>
          Yes please
        </button>
      </div>
    </div>
  );
}

// ── Decline message ───────────────────────────────────────────────────────────

function DeclineMessage() {
  const { declineMessageVisible } = useWalkthrough();
  if (!declineMessageVisible) return null;

  return (
    <div className={styles.declineMessage} role="status">
      You can restart walkthroughs from <strong>Settings → Interface</strong> anytime.
    </div>
  );
}

// ── Main walkthrough overlay ──────────────────────────────────────────────────

export default function WalkthroughOverlay() {
  const { isActive, currentStep, currentPage, currentStepIndex, totalSteps, nextStep, prevStep, skipPage, dismissAll } =
    useWalkthrough();
  const navigate = useNavigate();

  // A step's CTA button: end this page's tour, then go do the thing.
  const runStepAction = (to: string) => {
    skipPage();
    navigate(to);
  };

  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [cardPos, setCardPos] = useState<CardPos | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const cardRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(
    (sl: SpotlightRect) => {
      const cardH = cardRef.current?.offsetHeight ?? (isExpanded ? 200 : 82);
      setCardPos(calcCardPos(sl, cardH));
    },
    [isExpanded],
  );

  const stepTarget = currentStep?.target;

  // Acquire the target for the current step and settle the spotlight over it.
  // The previous version measured once, 350ms after kicking off a smooth
  // scroll — a fixed guess that lost the target on longer pages, slower
  // devices, or when the element hadn't rendered yet (data still loading).
  // Now: retry until the element exists, then rAF-poll getBoundingClientRect
  // until it stops moving (scroll finished) or a hard cap is hit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentStepIndex isn't read in the body, but two consecutive steps can share the same stepTarget — without the index, advancing between them wouldn't re-trigger this effect
  useEffect(() => {
    if (!isActive || !stepTarget) {
      setSpotlight(null);
      setCardPos(null);
      setIsExpanded(true);
      return;
    }

    let rafId = 0;
    let cancelled = false;
    let didScroll = false;
    let stableFrames = 0;
    let lastTop = Number.NaN;
    const startedAt = performance.now();

    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(stepTarget);

      if (!el) {
        // not in the DOM yet — keep looking for up to 2s, then give up
        if (performance.now() - startedAt < 2000) rafId = requestAnimationFrame(tick);
        else setSpotlight(null);
        return;
      }

      if (!didScroll) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        didScroll = true;
      }

      const sl = measureTarget(el);
      setSpotlight(sl);

      const settled = Math.abs(sl.top - lastTop) < 0.5;
      lastTop = sl.top;
      stableFrames = settled ? stableFrames + 1 : 0;

      // commit once the position holds for 3 frames, or after 800ms
      if (stableFrames < 3 && performance.now() - startedAt < 800) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [isActive, currentStepIndex, stepTarget]); // index (primitive) is more reliable than object reference

  useLayoutEffect(() => {
    if (spotlight) reposition(spotlight);
  }, [spotlight, reposition]);

  // Keep the spotlight glued to its target through scrolling, resizes and
  // late layout shifts (images, async content) for as long as the step is up.
  useEffect(() => {
    if (!isActive || !stepTarget) return;

    let rafId = 0;
    const remeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(stepTarget);
        if (el) setSpotlight(measureTarget(el));
      });
    };

    window.addEventListener("scroll", remeasure, { passive: true, capture: true });
    window.addEventListener("resize", remeasure);
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", remeasure, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", remeasure);
      ro.disconnect();
    };
  }, [isActive, stepTarget]);

  const hasTarget = !!currentStep?.target;
  const isLastStep = currentStepIndex === totalSteps - 1;
  const cardStyle: React.CSSProperties =
    cardPos && hasTarget ? { top: cardPos.top, left: cardPos.left, bottom: "auto", transform: "none" } : {};

  return (
    <>
      {/* Prompt and decline message render independently of walkthrough active state */}
      <WalkthroughPrompt />
      <DeclineMessage />

      {isActive && currentStep && currentPage && (
        <>
          {spotlight && (
            <div
              className={styles.spotlight}
              aria-label="Click to read the walkthrough step"
              role="button"
              tabIndex={0}
              style={{
                top: spotlight.top,
                left: spotlight.left,
                width: spotlight.width,
                height: spotlight.height,
              }}
              onClick={() => setIsExpanded(true)}
              onKeyDown={(e) => e.key === "Enter" && setIsExpanded(true)}
            />
          )}

          <div
            ref={cardRef}
            className={`${styles.card} ${isExpanded ? styles.cardExpanded : styles.cardCompact} ${!hasTarget ? styles.cardCentered : ""}`}
            style={cardStyle}
            role="dialog"
            aria-live="polite"
            aria-label={`Walkthrough: ${currentPage.pageTitle}, step ${currentStepIndex + 1} of ${totalSteps}`}
          >
            <div className={styles.header}>
              <span className={styles.pageTag}>{currentPage.pageTitle}</span>
              <div className={styles.headerRight}>
                <div className={styles.dotsInline} aria-hidden="true">
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative list, position is the identity
                    <span key={i} className={`${styles.dot} ${i === currentStepIndex ? styles.dotActive : ""}`} />
                  ))}
                </div>
                {hasTarget && (
                  <button
                    type="button"
                    className={styles.expandBtn}
                    onClick={() => setIsExpanded((v) => !v)}
                    aria-label={isExpanded ? "Collapse explanation" : "Expand explanation"}
                    title={isExpanded ? "Collapse" : "Read more"}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                      style={{
                        transform: isExpanded ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                      }}
                    >
                      <path
                        d="M2 4l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={skipPage}
                  aria-label="Skip walkthrough for this page"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <h3 className={styles.stepTitle}>{currentStep.title}</h3>

            {isExpanded && (
              <>
                <p className={styles.stepBody}>{currentStep.body}</p>
                {currentStep.actions && currentStep.actions.length > 0 && (
                  <div className={styles.stepActions}>
                    {currentStep.actions.slice(0, 2).map((action) => (
                      <button
                        type="button"
                        key={`${action.to}|${action.label}`}
                        className={styles.btnAction}
                        onClick={() => runStepAction(action.to)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.footer}>
                  <button
                    type="button"
                    className={styles.btnDismiss}
                    onClick={dismissAll}
                    title="Turn off all walkthroughs"
                  >
                    Don't show again
                  </button>
                  <div className={styles.navActions}>
                    {currentStepIndex > 0 && (
                      <button type="button" className={styles.btnBack} onClick={prevStep}>
                        Back
                      </button>
                    )}
                    <button type="button" className={styles.btnNext} onClick={nextStep}>
                      {isLastStep ? "Got it" : "Next"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {!isExpanded && (
              <div className={styles.compactFooter}>
                {currentStepIndex > 0 && (
                  <button type="button" className={styles.btnBack} onClick={prevStep}>
                    Back
                  </button>
                )}
                <button type="button" className={styles.btnNext} onClick={nextStep}>
                  {isLastStep ? "Got it" : "Next"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
