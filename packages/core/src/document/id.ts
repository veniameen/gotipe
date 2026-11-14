/**
 * IDs the library creates: blocks, comments, suggestions, versions, layers, peers. A UUID v4.
 *
 * `crypto.randomUUID()` exists only in a secure context (HTTPS or localhost); a page served
 * over plain HTTP elsewhere has `crypto.getRandomValues()` alone, and the ID is made from it.
 * Every package calls this helper instead of `crypto.randomUUID()` (checked by
 * `scripts/quality/architecture.mjs`), so no editor, manager or field initializer depends on
 * `applyPolyfills` having run first.
 */
export function createId(): string {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues === "function") return uuidFromRandomValues(source);
  throw new Error("GoTipe needs crypto.getRandomValues() to create IDs");
}

/** A UUID v4 of 16 random bytes (RFC 9562: version 4, variant 10). */
export function uuidFromRandomValues(source: Pick<Crypto, "getRandomValues">): string {
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
