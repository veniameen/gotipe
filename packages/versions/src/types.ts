export interface Version {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  snapshot: object;
}

export interface VersionDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export interface VersionsOptions {
  autoSave?: boolean;
  autoSaveInterval?: number;
  maxVersions?: number;
  onVersionCreated?: (version: Version) => void;
  onVersionRestored?: (version: Version) => void;
}
