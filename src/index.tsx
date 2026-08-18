import ReactDOM from "react-dom/client";

import { registerSW } from "virtual:pwa-register";
import "./index.scss";

import App from "./App";
import ErrorBoundary from "./components/shared/ErrorBoundary/ErrorBoundary";

registerSW({ immediate: true });

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
