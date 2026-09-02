import { Component, type ErrorInfo, type ReactNode } from "react";

import Button from "@components/shared/Button/Button";

import { supabase } from "@/lib/supabase";

import styles from "./ErrorBoundary.module.scss";

const SUPPORT_EMAIL = "support@withclarity.uk";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  reportOpen: boolean;
  reportText: string;
  reportStatus: "idle" | "sending" | "sent" | "failed";
}

// Render errors anywhere in the tree below this (including inside context
// providers, since this sits outside all of them in index.tsx) land here
// instead of unmounting the whole app to a blank white screen.
//
// Only a class component can be an error boundary — React doesn't expose a
// hook equivalent (no "useErrorBoundary"), so this can't be written as a
// function component. It also can't rely on any app context (auth, toast,
// router) — those providers may be the thing that crashed.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    componentStack: null,
    reportOpen: false,
    reportText: "",
    reportStatus: "idle",
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
    this.setState({ error, componentStack: info.componentStack ?? null });
  }

  // Everything the person can't be expected to describe: where they were,
  // what actually threw, and enough of the stack to locate it.
  buildDiagnostics = () => {
    const { error, componentStack } = this.state;
    return [
      `URL: ${window.location.href}`,
      `When: ${new Date().toISOString()}`,
      `Browser: ${navigator.userAgent}`,
      `Error: ${error?.name ?? "Error"}: ${error?.message ?? "(no message)"}`,
      error?.stack ? `Stack:\n${error.stack.split("\n").slice(0, 12).join("\n")}` : "",
      componentStack ? `Component stack:\n${componentStack.split("\n").slice(0, 12).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  buildMessage = () => {
    const note = this.state.reportText.trim();
    return `${note || "(no description given)"}\n\n---- diagnostics ----\n${this.buildDiagnostics()}`;
  };

  mailtoHref = () => {
    const subject = encodeURIComponent("Clarity — app error report");
    const body = encodeURIComponent(this.buildMessage());
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  // The feedback table's RLS only allows an authenticated user to insert a
  // row attributed to themselves. The common crash is a signed-in user on a
  // broken bundle, so read the persisted session directly (no AuthContext
  // here) and submit as them. If there's no session, or the insert fails,
  // fall through to the mailto: link the UI shows on "failed".
  sendReport = async () => {
    this.setState({ reportStatus: "sending" });
    const message = this.buildMessage();
    const page = window.location.pathname;
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) throw new Error("no session");

      const { error } = await supabase
        .from("feedback")
        .insert({ submitter_id: uid, type: "bug", severity: "high", message, page });
      if (error) throw error;

      supabase.functions
        .invoke("notify-feedback", { body: { type: "bug", severity: "high", message, page } })
        .catch(() => {});
      this.setState({ reportStatus: "sent" });
    } catch {
      this.setState({ reportStatus: "failed" });
    }
  };

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

  renderReporter() {
    const { reportText, reportStatus } = this.state;

    return (
      // Self-contained overlay — no shared Modal / portal / context, since any
      // of those could be what crashed.
      <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Report this problem">
        <div className={styles.reportCard}>
          {reportStatus === "sent" ? (
            <>
              <h2 className={styles.reportHeading}>Report sent</h2>
              <p className={styles.reportIntro}>
                Thanks — this went to our team flagged as a high-priority crash. Try reloading the page now.
              </p>
              <div className={styles.reportActions}>
                <Button variant="primary" onClick={this.handleReload}>
                  Reload page
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className={styles.reportHeading}>Report this problem</h2>
              <p className={styles.reportIntro}>
                We'll get a high-priority alert with the technical details attached. A note about what you were doing
                helps us track it down.
              </p>
              <label htmlFor="eb-report" className={styles.reportLabel}>
                What were you doing when it broke? <span>(optional)</span>
              </label>
              <textarea
                id="eb-report"
                className={styles.reportInput}
                rows={4}
                value={reportText}
                onChange={(e) => this.setState({ reportText: e.target.value })}
                placeholder="e.g. clicked Save on the payments page"
              />
              {reportStatus === "failed" && (
                <p className={styles.reportHint}>
                  Couldn't send it automatically. <a href={this.mailtoHref()}>Email the report to us instead</a>.
                </p>
              )}
              <div className={styles.reportActions}>
                <Button
                  variant="ghost"
                  onClick={() => this.setState({ reportOpen: false, reportStatus: "idle" })}
                  disabled={reportStatus === "sending"}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={this.sendReport} disabled={reportStatus === "sending"}>
                  {reportStatus === "sending" ? "Sending…" : "Send report"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.heading}>Oops, something went wrong</h1>
          <p className={styles.body}>
            This page hit an unexpected error. Reloading usually fixes it — if it keeps happening, let us know what you
            were doing and we'll look into it.
          </p>
          <div className={styles.actions}>
            <Button variant="primary" onClick={this.handleReload}>
              Reload page
            </Button>
            <Button variant="secondary" onClick={this.handleGoHome}>
              Go to dashboard
            </Button>
          </div>

          <button
            type="button"
            className={styles.reportToggle}
            onClick={() => this.setState({ reportOpen: true, reportStatus: "idle" })}
          >
            Report this problem
          </button>
        </div>

        {this.state.reportOpen && this.renderReporter()}
      </div>
    );
  }
}
