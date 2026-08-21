import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { type WalkthroughPage, type WalkthroughStep, walkthroughSteps } from "../data/walkthroughSteps";
import { useConsentPending } from "../Hooks/useConsentPending";
import { useAuth } from "./AuthContext";

const LS_DISMISSED_KEY = "walkthrough_dismissed_routes";
const LS_GLOBAL_KEY = "walkthrough_globally_dismissed";
const PROMPT_DELAY_MS = 4000;
const DECLINE_MESSAGE_MS = 3000;

interface WalkthroughContextValue {
  isActive: boolean;
  promptVisible: boolean;
  declineMessageVisible: boolean;
  currentStep: WalkthroughStep | null;
  currentPage: WalkthroughPage | null;
  currentStepIndex: number;
  totalSteps: number;
  hasWalkthroughForPage: boolean;
  isDismissedGlobally: boolean;
  acceptPrompt: () => void;
  declinePrompt: () => void;
  startWalkthrough: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipPage: () => void;
  dismissAll: () => void;
  resetAll: () => void;
}

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

function matchRoute(pathname: string): string | null {
  if (walkthroughSteps[pathname]) return pathname;
  // Sort longer patterns first so /admin/clients/stub/ matches before /admin/clients/
  const prefixPatterns = Object.keys(walkthroughSteps)
    .filter((k) => k.endsWith("/"))
    .sort((a, b) => b.length - a.length);
  for (const pattern of prefixPatterns) {
    if (pathname.startsWith(pattern)) return pattern;
  }
  return null;
}

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function addDismissed(route: string) {
  const current = getDismissed();
  if (!current.includes(route)) {
    localStorage.setItem(LS_DISMISSED_KEY, JSON.stringify([...current, route]));
  }
}

function removeDismissed(route: string) {
  const current = getDismissed();
  localStorage.setItem(LS_DISMISSED_KEY, JSON.stringify(current.filter((r) => r !== route)));
}

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { loading: authLoading } = useAuth();
  const { pending: consentPending } = useConsentPending();

  const [matchedRoute, setMatchedRoute] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [declineMessageVisible, setDeclineMessageVisible] = useState(false);
  const [isDismissedGlobally, setIsDismissedGlobally] = useState(() => localStorage.getItem(LS_GLOBAL_KEY) === "true");

  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const declineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPage = matchedRoute ? walkthroughSteps[matchedRoute] : null;
  const sortedSteps = currentPage ? [...currentPage.steps].sort((a, b) => a.order - b.order) : [];
  const currentStep = sortedSteps[stepIndex] ?? null;
  const totalSteps = sortedSteps.length;

  // On navigation: reset state, then after a delay show the prompt if page is unseen.
  // Never start that timer while auth is still resolving (the page behind it
  // isn't real content yet — could still be a spinner, or about to redirect
  // to somewhere else entirely) or while the client-consent modal is up
  // (it's meant to block the whole app until agreed to; the walkthrough
  // popping up over/behind it was a real, reported bug). Both are in the
  // dependency array so the timer starts the moment whichever was blocking
  // clears, rather than only re-checking on the next navigation.
  useEffect(() => {
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);

    const route = matchRoute(pathname);
    setMatchedRoute(route);
    setStepIndex(0);
    setIsActive(false);
    setPromptVisible(false);

    if (!route || isDismissedGlobally || getDismissed().includes(route) || authLoading || consentPending) return;

    promptTimerRef.current = setTimeout(() => {
      setPromptVisible(true);
    }, PROMPT_DELAY_MS);

    return () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    };
  }, [pathname, isDismissedGlobally, authLoading, consentPending]);

  // Accept prompt → start the walkthrough
  const acceptPrompt = useCallback(() => {
    setPromptVisible(false);
    setIsActive(true);
  }, []);

  // Decline prompt → dismiss this page, show a brief hint about settings
  const declinePrompt = useCallback(() => {
    setPromptVisible(false);
    if (matchedRoute) addDismissed(matchedRoute);
    setDeclineMessageVisible(true);
    if (declineTimerRef.current) clearTimeout(declineTimerRef.current);
    declineTimerRef.current = setTimeout(() => {
      setDeclineMessageVisible(false);
    }, DECLINE_MESSAGE_MS);
  }, [matchedRoute]);

  // Manually start the walkthrough for the current page (e.g. from settings reset)
  const startWalkthrough = useCallback(() => {
    if (!matchedRoute) return;
    removeDismissed(matchedRoute);
    setStepIndex(0);
    setPromptVisible(false);
    setIsActive(true);
  }, [matchedRoute]);

  const nextStep = useCallback(() => {
    if (stepIndex < totalSteps - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setIsActive(false);
      if (matchedRoute) addDismissed(matchedRoute);
    }
  }, [stepIndex, totalSteps, matchedRoute]);

  const prevStep = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const skipPage = useCallback(() => {
    setIsActive(false);
    if (matchedRoute) addDismissed(matchedRoute);
  }, [matchedRoute]);

  const dismissAll = useCallback(() => {
    localStorage.setItem(LS_GLOBAL_KEY, "true");
    setIsDismissedGlobally(true);
    setIsActive(false);
    setPromptVisible(false);
  }, []);

  const resetAll = useCallback(() => {
    localStorage.removeItem(LS_DISMISSED_KEY);
    localStorage.removeItem(LS_GLOBAL_KEY);
    setIsDismissedGlobally(false);
    // The prompt will appear naturally on next navigation via the effect above.
    // Trigger it immediately on the current page if one exists.
    const route = matchRoute(pathname);
    setMatchedRoute(route);
    setStepIndex(0);
    setIsActive(false);
    if (route) {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
      promptTimerRef.current = setTimeout(() => setPromptVisible(true), PROMPT_DELAY_MS);
    }
  }, [pathname]);

  return (
    <WalkthroughContext.Provider
      value={{
        isActive,
        promptVisible,
        declineMessageVisible,
        currentStep,
        currentPage,
        currentStepIndex: stepIndex,
        totalSteps,
        hasWalkthroughForPage: !!currentPage,
        isDismissedGlobally,
        acceptPrompt,
        declinePrompt,
        startWalkthrough,
        nextStep,
        prevStep,
        skipPage,
        dismissAll,
        resetAll,
      }}
    >
      {children}
    </WalkthroughContext.Provider>
  );
}

export function useWalkthrough() {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) throw new Error("useWalkthrough must be used inside WalkthroughProvider");
  return ctx;
}
