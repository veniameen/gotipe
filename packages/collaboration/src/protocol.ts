const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export interface Operation {
  id: { lamport: number; peer_id: string };
  change: unknown;
}
export interface Update {
  protocol: "gotipe.crdt/1";
  base: object;
  operations: Operation[];
}

export const operationId = (operation: Operation) =>
  JSON.stringify([operation.id.peer_id, operation.id.lamport]);

export function readUpdate(bytes: Uint8Array): Update {
  const value = JSON.parse(decoder.decode(bytes));
  if (
    !value ||
    value.protocol !== "gotipe.crdt/1" ||
    !value.base ||
    typeof value.base !== "object" ||
    !Array.isArray(value.operations)
  )
    throw new Error("Invalid collaboration update envelope");
  const ids = new Set<string>();
  for (const op of value.operations) {
    if (
      !op ||
      !op.id ||
      typeof op.id.peer_id !== "string" ||
      !op.id.peer_id ||
      !Number.isSafeInteger(op.id.lamport) ||
      op.id.lamport <= 0 ||
      !op.change
    )
      throw new Error("Invalid collaboration operation identity");
    const id = operationId(op);
    if (ids.has(id)) throw new Error("Duplicate operation identity in one update");
    ids.add(id);
  }
  return value;
}

/** Error codes the provider handles itself; any other 0x08 code stops it. */
export const BASELINE_REPLACED = "BASELINE_REPLACED";
export const INVALID_AWARENESS = "INVALID_AWARENESS";
export const UPDATE_NOT_SAVED = "UPDATE_NOT_SAVED";

export function readServerError(bytes: Uint8Array): { code: string; message: string } {
  const value = decodeJSON(bytes) as { code?: unknown; message?: unknown } | null;
  if (!value || typeof value.code !== "string" || !value.code)
    throw new Error("Invalid collaboration error frame");
  const message =
    typeof value.message === "string" && value.message
      ? value.message
      : "The collaboration server rejected the request";
  return { code: value.code, message };
}

/**
 * Validates the sync endpoint once, when the provider is configured. These are
 * permanent mistakes: retrying them can never succeed.
 */
export function syncEndpoint(wsUrl: string): URL {
  let url: URL;
  try {
    url = new URL(wsUrl);
  } catch {
    throw new TypeError("The collaboration URL must be an absolute ws: or wss: URL");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:")
    throw new TypeError("The collaboration URL must be an absolute ws: or wss: URL");
  if (url.username || url.password || url.searchParams.has("token"))
    throw new TypeError("Use the token option instead of credentials in the collaboration URL");
  return url;
}

/** The replica identity rule of the engine and Cloud: byte length, as Rust and Go count it. */
export function validPeerId(peerId: string): boolean {
  return !!peerId.trim() && encoder.encode(peerId).length <= 256 && !peerId.startsWith("@base");
}

/** Same baseline content; revision counters are local and ignored, as in the engine. */
export function sameBaseline(left: object, right: object): boolean {
  const { version: _left, ...a } = left as Record<string, unknown>;
  const { version: _right, ...b } = right as Record<string, unknown>;
  return equalJSON(a, b);
}
function equalJSON(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalJSON(value, right[index]))
    );
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equalJSON(a[key], b[key]))
  );
}

export function encodeJSON(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}
export function decodeJSON(bytes: Uint8Array): unknown {
  return JSON.parse(decoder.decode(bytes));
}
export function frame(
  kind: number,
  payload: Uint8Array = new Uint8Array(),
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(payload.length + 1);
  bytes[0] = kind;
  bytes.set(payload, 1);
  return bytes;
}

export function authProtocol(token: string): string {
  const bytes = encoder.encode(token);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `gotipe.auth.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

/** SDK keeps embedded CRDT objects intact. Byte arrays/serialized envelopes are also accepted. */
export function storedUpdate(value: unknown): Uint8Array {
  const bytes =
    value instanceof Uint8Array
      ? value
      : typeof value === "string"
        ? encoder.encode(value)
        : Array.isArray(value) &&
            value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
          ? Uint8Array.from(value)
          : encodeJSON(value);
  readUpdate(bytes);
  return bytes;
}
