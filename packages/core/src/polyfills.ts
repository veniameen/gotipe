import { uuidFromRandomValues } from "./document/id";

/**
 * Fills the two platform functions that the library and its adapters call and that some
 * contexts lack: `structuredClone` and `crypto.randomUUID`. GoTipe names no minimum browser
 * versions (docs-site: Browser support); the code is built for ES2022 and tested in current
 * Chromium, Firefox and WebKit.
 */
export function applyPolyfills(): void {
  if (typeof globalThis.structuredClone === "undefined") {
    globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  }
  // crypto.randomUUID requires a secure context (HTTPS/localhost). The library itself uses
  // `createId` (document/id.ts); this keeps the global for host code that calls it directly.
  const source = globalThis.crypto;
  if (
    typeof source !== "undefined" &&
    typeof source.randomUUID !== "function" &&
    typeof source.getRandomValues === "function"
  ) {
    source.randomUUID = () =>
      uuidFromRandomValues(source) as `${string}-${string}-${string}-${string}-${string}`;
  }
}
