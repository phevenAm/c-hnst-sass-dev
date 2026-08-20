import ReactDOM from "react-dom/client";

import { registerSW } from "virtual:pwa-register";
import "./index.scss";

import App from "./App";
import ErrorBoundary from "./components/shared/ErrorBoundary/ErrorBoundary";
import { setSwRegistration, setUpdateSW } from "./lib/swUpdate";

// registerType: "prompt" (vite.config.js) means a new service worker installs
// but waits — it only takes over once applyServiceWorkerUpdate() calls this
// returned function, instead of every open tab silently switching versions
// mid-session the moment a deploy goes out.
setUpdateSW(
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      if (reg) setSwRegistration(reg);
    },
  }),
);

// Supabase's cross-tab auth lock can forcibly "steal" the lock from a tab
// that's mid-wait (e.g. one tab signs out while another is reloading) — the
// losing tab's pending lock callback rejects with this AbortError. Our own
// onAuthStateChange subscribers (AuthContext, EncryptionContext) already
// catch this and recover correctly, but the rejection can also escape from
// inside supabase-js's own internal subscriber-notification machinery,
// before it ever reaches our callbacks — no try/catch of ours can intercept
// that. It's harmless (the losing tab just re-checks its session on the next
// auth event), so swallow it here instead of letting it surface as an
// uncaught error.
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.name === "AbortError" && /lock broken/i.test(event.reason?.message ?? "")) {
    console.warn("Suppressed cross-tab auth lock rejection:", event.reason.message);
    event.preventDefault();
  }
});

if (import.meta.env.DEV) {
  const { default: axe } = await import("@axe-core/react");
  const React = await import("react");
  axe(React.default, ReactDOM, 1000);
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in DOM");
const root = ReactDOM.createRoot(rootElement);
root.render(
  // <React.StrictMode>
  <>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </>,
  // </React.StrictMode>
);
