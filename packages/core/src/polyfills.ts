/**
 * Browser compatibility: Chrome 90+, Firefox 90+, Safari 15+.
 * Provides polyfills for missing APIs.
 */
export function applyPolyfills(): void {
  if (typeof globalThis.structuredClone === "undefined") {
    globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  }
}
