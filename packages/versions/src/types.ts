export interface Version {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  snapshot: Document;
}

export interface VersionDiff {
  added: string[];
  removed: string[];
  modified: string[];
  moved: string[];
}

/** Every version for storage: `exportState()` returns it, `loadState()` reads it back. */
export interface VersionsSnapshot {
  version: 1;
  versions: Version[];
}

export interface VersionsOptions {
  /** A stored snapshot to start with, read as `loadState()` reads it; an invalid one throws. */
  initialState?: unknown;
  autoSave?: boolean;
  autoSaveInterval?: number;
  maxVersions?: number;
  onVersionCreated?: (version: Version) => void;
  onVersionRestored?: (version: Version) => void;
}
import type { Document } from "@gotipe/core";
