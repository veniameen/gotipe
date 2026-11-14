const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** The full state: the baseline document and operations. Only frame `0x02` and local copies. */
export const FULL_STATE = "gotipe.crdt/1";
/** Operations alone; the connection names their baseline by its generation. */
export const OPERATIONS = "gotipe.crdt/2";
/** Cloud closes the connection for a larger WebSocket message. */
export const MESSAGE_LIMIT = 1 << 20;

export interface Operation {
  id: { lamport: number; peer_id: string };
  change: unknown;
}
export interface Update {
  protocol: typeof FULL_STATE | typeof OPERATIONS;
  /** Present exactly in a full state. */
  base?: object;
  operations: Operation[];
}

export const operationId = (operation: Operation) =>
  JSON.stringify([operation.id.peer_id, operation.id.lamport]);

/** Validates a decoded envelope of either protocol. */
export function checkUpdate(value: unknown): Update {
  const update = value as Partial<Update> | null;
  const hasBase = !!update && typeof update.base === "object" && update.base !== null;
  if (
    !update ||
    typeof update !== "object" ||
    !Array.isArray(update.operations) ||
    !(
      (update.protocol === FULL_STATE && hasBase) ||
      (update.protocol === OPERATIONS && update.base === undefined)
    )
  )
    throw new Error("Invalid collaboration update envelope");
  const ids = new Set<string>();
  for (const op of update.operations) {
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
  return update as Update;
}
export function readUpdate(bytes: Uint8Array): Update {
  return checkUpdate(JSON.parse(decoder.decode(bytes)));
}

/**
 * An engine result: operations plus one counter (`remaining` or `acknowledged`).
 * `continues` is true when the operations are a part of one transaction that
 * the engine returns the rest of after their last clock.
 */
export function readOperations<Counter extends "remaining" | "acknowledged">(
  bytes: Uint8Array,
  counter: Counter,
): { operations: Operation[]; continues: boolean } & Record<Counter, number> {
  const value = JSON.parse(decoder.decode(bytes));
  const count = value?.[counter];
  if (
    value?.protocol !== OPERATIONS ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    (counter === "remaining" && typeof value.continues !== "boolean")
  )
    throw new Error(
      "The editor returned no incremental collaboration update; @gotipe/core and @gotipe/wasm must match this @gotipe/collaboration",
    );
  return {
    operations: checkUpdate({ ...value, base: undefined }).operations,
    continues: value.continues === true,
    [counter]: count,
  } as {
    operations: Operation[];
    continues: boolean;
  } & Record<Counter, number>;
}

/**
 * A client update: serialized operations under the generation of their baseline.
 * `continues` marks a part of one transaction; Cloud saves, acknowledges and
 * relays the transaction only with its last part.
 */
export function operationsEnvelope(
  generation: string,
  operations: string[],
  continues = false,
): Uint8Array {
  return encoder.encode(
    `{"protocol":"${OPERATIONS}","generation":${JSON.stringify(generation)},"operations":[${operations.join(",")}]${continues ? ',"continues":true' : ""}}`,
  );
}
/** The first protocol's update: the same operations behind a copy of the baseline. */
export function baselineEnvelope(base: string, operations: string[]): Uint8Array {
  return encoder.encode(
    `{"protocol":"${FULL_STATE}","base":${base},"operations":[${operations.join(",")}]}`,
  );
}
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Error codes the provider handles itself; any other 0x08 code stops it. */
export const BASELINE_REPLACED = "BASELINE_REPLACED";
export const INVALID_AWARENESS = "INVALID_AWARENESS";
export const UPDATE_NOT_SAVED = "UPDATE_NOT_SAVED";
/** The server cannot take the next transaction whole; it is sent again in standalone frames. */
export const UPDATE_TOO_LARGE = "UPDATE_TOO_LARGE";

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

/** The token of `collaboration_state.generation`: opaque, short, safe in a URL. */
export function validGeneration(generation: unknown): generation is string {
  return typeof generation === "string" && /^[A-Za-z0-9._~-]{1,128}$/.test(generation);
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

/**
 * One update holding the operations of `updates`, which are a set, not a
 * sequence: an editor validates the union once. Updates of the first protocol
 * must start from the same baseline.
 */
export function unionOf(updates: Update[]): Uint8Array {
  let base: object | undefined;
  const operations: Operation[] = [];
  for (const update of updates) {
    if (update.base) {
      if (base && !sameBaseline(base, update.base))
        throw new Error("Stored collaboration updates start from different documents");
      base ??= update.base;
    }
    for (const operation of update.operations) operations.push(operation);
  }
  return encodeJSON(
    base ? { protocol: FULL_STATE, base, operations } : { protocol: OPERATIONS, operations },
  );
}

/** A stored record as the SDK returns it: an envelope object, its bytes, text or byte array. */
export function storedUpdate(value: unknown): Update {
  if (value instanceof Uint8Array) return readUpdate(value);
  if (typeof value === "string") return readUpdate(encoder.encode(value));
  if (Array.isArray(value)) {
    if (!value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255))
      throw new Error("Invalid collaboration update envelope");
    return readUpdate(Uint8Array.from(value));
  }
  // Already decoded by the REST client: check it without parsing it again.
  return checkUpdate(value);
}
