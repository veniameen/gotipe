import { type GoTipeEditor, GoTipeError, createId } from "@gotipe/core";
import { compareDocuments, snapshotKey } from "./diff";
import { decodeVersionsSnapshot } from "./persistence";
import type { Version, VersionDiff, VersionsOptions, VersionsSnapshot } from "./types";

/**
 * Session snapshots. Hosts own persistence (`exportState`/`loadState`); all returned data is
 * detached from internal state.
 */
export class VersionsManager {
  private versions: Version[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private listeners = new Set<() => void>();
  private revision = 0;
  private savedKey: string;
  private maxVersions: number;
  private unsubscribeDestroy: () => void;

  constructor(
    private editor: Pick<
      GoTipeEditor,
      "getJSON" | "setContent" | "isDestroyed" | "on" | "reportError"
    >,
    private options: VersionsOptions = {},
  ) {
    this.maxVersions = options.maxVersions ?? 100;
    if (!Number.isInteger(this.maxVersions) || this.maxVersions < 1)
      throw new RangeError("maxVersions must be a positive integer");
    const interval = options.autoSaveInterval ?? 300000;
    if (!Number.isFinite(interval) || interval <= 0)
      throw new RangeError("autoSaveInterval must be positive");
    this.savedKey = snapshotKey(editor.getJSON());
    this.unsubscribeDestroy = editor.on("destroy", () => this.destroy());
    if (options.initialState !== undefined) {
      try {
        this.loadState(options.initialState);
      } catch (error) {
        this.destroy();
        throw error;
      }
    }
    if (options.autoSave) this.timer = setInterval(() => this.autoSave(), interval);
  }
  private assertLive(): void {
    if (this.destroyed || this.editor.isDestroyed)
      throw new Error("The versions manager was destroyed");
  }
  private notify(callback?: () => void): void {
    try {
      callback?.();
    } catch (error) {
      this.editor.reportError(
        new GoTipeError(
          "EXTENSION_ERROR",
          error instanceof Error ? error.message : "Version callback failed",
        ),
      );
    }
  }
  private changed(): void {
    this.revision++;
    for (const listener of this.listeners) this.notify(listener);
  }
  subscribe(listener: () => void): () => void {
    this.assertLive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  getRevision(): number {
    return this.revision;
  }

  createVersion(name: string, createdBy: string, description?: string): Version {
    this.assertLive();
    if (!name.trim()) throw new Error("A version name is required");
    const version: Version = {
      id: createId(),
      name: name.trim(),
      description,
      createdAt: new Date().toISOString(),
      createdBy,
      snapshot: structuredClone(this.editor.getJSON()),
    };
    this.versions.push(version);
    if (this.versions.length > this.maxVersions)
      this.versions.splice(0, this.versions.length - this.maxVersions);
    this.savedKey = snapshotKey(version.snapshot);
    this.changed();
    this.notify(() => this.options.onVersionCreated?.(structuredClone(version)));
    return structuredClone(version);
  }
  restoreVersion(id: string): boolean {
    this.assertLive();
    const version = this.versions.find((entry) => entry.id === id);
    if (!version) return false;
    this.editor.setContent(structuredClone(version.snapshot), {
      addToHistory: true,
      preserveSelection: true,
    });
    this.changed();
    this.notify(() => this.options.onVersionRestored?.(structuredClone(version)));
    return true;
  }
  getVersions(): Version[] {
    return structuredClone(this.versions);
  }
  getVersion(id: string): Version | undefined {
    const version = this.versions.find((entry) => entry.id === id);
    return version ? structuredClone(version) : undefined;
  }
  deleteVersion(id: string): boolean {
    this.assertLive();
    const index = this.versions.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    this.versions.splice(index, 1);
    this.changed();
    return true;
  }
  /** Every version, oldest first, detached from the manager: store it as JSON. */
  exportState(): VersionsSnapshot {
    this.assertLive();
    return { version: 1, versions: structuredClone(this.versions) };
  }
  /**
   * Replaces the versions with a stored snapshot, oldest first by `createdAt`. The whole
   * snapshot is checked before anything changes. Like `createVersion`, the manager keeps the
   * newest `maxVersions`; auto-save compares the document with the newest one loaded.
   */
  loadState(value: unknown): void {
    this.assertLive();
    const versions = decodeVersionsSnapshot(value).slice(-this.maxVersions);
    this.versions = versions;
    const newest = versions.at(-1);
    if (newest) this.savedKey = snapshotKey(newest.snapshot);
    this.changed();
  }
  compareVersions(a: string, b: string): VersionDiff | null {
    const before = this.versions.find((entry) => entry.id === a);
    const after = this.versions.find((entry) => entry.id === b);
    return before && after ? compareDocuments(before.snapshot, after.snapshot) : null;
  }
  private autoSave(): void {
    if (this.destroyed || this.editor.isDestroyed) return;
    try {
      if (snapshotKey(this.editor.getJSON()) !== this.savedKey)
        this.createVersion(`Auto-save ${new Date().toLocaleString()}`, "system");
    } catch (error) {
      this.editor.reportError(
        new GoTipeError(
          "EXTENSION_ERROR",
          error instanceof Error ? error.message : "Version auto-save failed",
        ),
      );
    }
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeDestroy();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.versions = [];
    this.listeners.clear();
  }
}
