export { defineVersions, getVersionsManager } from "./extension";
export { compareDocuments } from "./diff";
export { blockText, countWordChanges, diffText } from "./text-diff";
export type { TextChange, WordChanges } from "./text-diff";
export type { Version, VersionDiff, VersionsOptions, VersionsSnapshot } from "./types";
export { VersionsManager } from "./manager";
