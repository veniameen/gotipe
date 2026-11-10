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
