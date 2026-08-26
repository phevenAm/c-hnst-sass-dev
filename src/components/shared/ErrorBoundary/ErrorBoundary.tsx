import { Component, type ErrorInfo, type ReactNode } from "react";

import Button from "@components/shared/Button/Button";

import styles from "./ErrorBoundary.module.scss";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Render errors anywhere in the tree below this (including inside context
// providers, since this sits outside all of them in index.tsx) land here
// instead of unmounting the whole app to a blank white screen.
//
// Only a class component can be an error boundary — React doesn't expose a
// hook equivalent (no "useErrorBoundary"), so this can't be written as a
// function component.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  // A plain reload isn't enough here: if the crash is being served by a
  // stale service worker (the whole reason this boundary exists — e.g. the
  // 2026-08-26 incident, where the fix wouldn't reach an already-stuck PWA
  // until the old worker's cache was gone), a normal navigation just
  // re-serves the same cached bundle from that worker. Unregistering the
  // worker(s) and clearing the Cache Storage entries first forces the next
  // load to hit the network for fresh code instead of looping on the crash.
  handleReload = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }
    } catch {
      // Best-effort — a browser that blocks these APIs (private mode, an
      // older Safari) shouldn't stop the reload from happening at all.
    } finally {
      window.location.reload();
    }
  };

  // Full navigation, not react-router — this component sits outside
  // <BrowserRouter>, so there's no router context to call useNavigate with.
  // "/" also lets RootRedirect send the user to the right place (admin vs
  // client dashboard, or /login if signed out) instead of guessing here.
  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.heading}>Oops, something went wrong</h1>
          <p className={styles.body}>
            This page hit an unexpected error. Reloading usually fixes it — if it keeps happening, let us know.
          </p>
          <div className={styles.actions}>
            <Button variant="primary" onClick={this.handleReload}>
              Reload page
            </Button>
            <Button variant="secondary" onClick={this.handleGoHome}>
              Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
