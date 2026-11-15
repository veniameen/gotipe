import { GoTipeError, decodeDocument } from "@gotipe/core";
import type { Version } from "./types";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GoTipeError("VALIDATION_ERROR", "Invalid version record");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()))
    throw new GoTipeError("VALIDATION_ERROR", `Invalid version ${label}`);
  return value;
}
function version(value: unknown): Version {
  const entry = object(value);
  const createdAt = text(entry.createdAt, "date");
  if (!Number.isFinite(Date.parse(createdAt)))
    throw new GoTipeError("VALIDATION_ERROR", "Invalid version date");
  const result: Version = {
    id: text(entry.id, "ID"),
    name: text(entry.name, "name").trim(),
    createdAt,
    createdBy: text(entry.createdBy, "author", true),
    snapshot: decodeDocument(entry.snapshot),
  };
  if (entry.description !== undefined)
    result.description = text(entry.description, "description", true);
  return result;
}

/**
 * Checks a stored `{ version: 1, versions }` snapshot as a whole and returns its versions
 * oldest first by `createdAt` (equal times keep their order). Nothing is half loaded.
 */
export function decodeVersionsSnapshot(value: unknown): Version[] {
  const source = object(value);
  if (source.version !== 1 || !Array.isArray(source.versions) || source.versions.length > 10000)
    throw new GoTipeError("VALIDATION_ERROR", "Unsupported versions snapshot");
  const ids = new Set<string>();
  const versions = source.versions.map((entry) => {
    const result = version(entry);
    if (ids.has(result.id)) throw new GoTipeError("VALIDATION_ERROR", "Duplicate version ID");
    ids.add(result.id);
    return result;
  });
  return versions
    .map((entry, index) => ({ entry, index, time: Date.parse(entry.createdAt) }))
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map(({ entry }) => entry);
}
