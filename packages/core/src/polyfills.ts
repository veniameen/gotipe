import { uuidFromRandomValues } from "./document/id";

/**
 * Browser compatibility: Chrome 90+, Firefox 90+, Safari 15+.
 * Provides polyfills for missing APIs.
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
