/**
 * `crypto.randomUUID` exists only in a secure context (https, localhost). The demos and the
 * managers they create (comments, versions, AI) call it, so a page served over plain http, such
 * as a preview on the local network, gets the same version-4 ids from `getRandomValues`, which
 * every context has. The same as core's internal `applyPolyfills`, which is not a public export.
 * Called explicitly before a demo mounts; importing this file changes nothing.
 */
export function ensureRandomUUID(): void {
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.randomUUID === "function") return;
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}
