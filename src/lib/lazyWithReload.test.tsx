import { Suspense } from "react";

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { classifyImportError, lazyWithReload } from "./lazyWithReload";

const FLAG = "chunk-reload-attempted";

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe("classifyImportError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://x/assets/SettingsPage-abc.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Expected a JavaScript module script but the server responded with a MIME type of text/html",
  ])("says reload for a stale-chunk error: %j", (msg) => {
    expect(classifyImportError(new Error(msg))).toBe("reload");
  });

  it.each([
    "some unrelated runtime error",
    "Cannot read properties of undefined",
    "",
  ])("says rethrow for an unrelated error: %j", (msg) => {
    expect(classifyImportError(new Error(msg))).toBe("rethrow");
  });

  it("says rethrow for a stale-chunk error once the reload flag is already set (no loop)", () => {
    sessionStorage.setItem(FLAG, "1");
    expect(classifyImportError(new Error("Failed to fetch dynamically imported module"))).toBe("rethrow");
  });

  it("handles a non-Error rejection value", () => {
    expect(classifyImportError("Failed to fetch dynamically imported module")).toBe("reload");
    expect(classifyImportError(undefined)).toBe("rethrow");
  });
});

describe("lazyWithReload", () => {
  it("renders the component when the import succeeds", async () => {
    const Lazy = lazyWithReload(() => Promise.resolve({ default: () => <div>the page</div> }));
    render(
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>,
    );
    expect(await screen.findByText("the page")).toBeInTheDocument();
  });

  it("clears a stale reload flag after a successful load", async () => {
    sessionStorage.setItem(FLAG, "1");
    const Lazy = lazyWithReload(() => Promise.resolve({ default: () => <div>recovered</div> }));
    render(
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>,
    );
    expect(await screen.findByText("recovered")).toBeInTheDocument();
    expect(sessionStorage.getItem(FLAG)).toBeNull();
  });
});
