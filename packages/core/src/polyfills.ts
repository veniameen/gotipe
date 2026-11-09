/**
 * Browser compatibility: Chrome 90+, Firefox 90+, Safari 15+.
 * Provides polyfills for missing APIs.
 */
export function applyPolyfills(): void {
  if (typeof globalThis.structuredClone === "undefined") {
    globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  }
  // crypto.randomUUID requires a secure context (HTTPS/localhost).
  // Polyfill for non-secure contexts (e.g. Docker, HTTP dev servers).
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    globalThis.crypto.randomUUID = () => {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      // Set version 4 and variant bits
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
    };
  }
}
