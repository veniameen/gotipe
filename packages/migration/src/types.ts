import type { Document } from "@gotipe/core";

export interface MigrationOptions {
  strict?: boolean;
  onWarning?: (message: string) => void;
  blockTypeMap?: Record<string, string>;
  markTypeMap?: Record<string, string>;
}

export interface MigrationResult {
  document: Document;
  warnings: string[];
  skippedNodes: number;
}
