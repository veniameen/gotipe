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

export interface VersionsOptions {
  autoSave?: boolean;
  autoSaveInterval?: number;
  maxVersions?: number;
  onVersionCreated?: (version: Version) => void;
  onVersionRestored?: (version: Version) => void;
}
import type { Document } from "@gotipe/core";
