import type { GoTipeEditor } from "@gotipe/core";
import type { Version, VersionDiff } from "./types";

export class VersionsManager {
  private versions: Version[] = [];
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private editor: GoTipeEditor,
    private options: { autoSave?: boolean; autoSaveInterval?: number; maxVersions?: number } = {},
  ) {
    if (options.autoSave) {
      this.startAutoSave(options.autoSaveInterval ?? 300000); // 5 min default
    }
  }

  createVersion(name: string, createdBy: string, description?: string): Version {
    const version: Version = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: new Date().toISOString(),
      createdBy,
      snapshot: this.editor.getJSON(),
    };

    this.versions.push(version);

    // Enforce max versions
    if (this.options.maxVersions && this.versions.length > this.options.maxVersions) {
      this.versions = this.versions.slice(-this.options.maxVersions);
    }

    return version;
  }

  restoreVersion(versionId: string): boolean {
    const version = this.versions.find((v) => v.id === versionId);
    if (!version) return false;

    this.editor.setContent(version.snapshot);
    return true;
  }

  getVersions(): Version[] {
    return [...this.versions];
  }

  getVersion(id: string): Version | undefined {
    return this.versions.find((v) => v.id === id);
  }

  deleteVersion(id: string): boolean {
    const index = this.versions.findIndex((v) => v.id === id);
    if (index === -1) return false;
    this.versions.splice(index, 1);
    return true;
  }

  compareVersions(versionIdA: string, versionIdB: string): VersionDiff | null {
    const a = this.getVersion(versionIdA);
    const b = this.getVersion(versionIdB);
    if (!a || !b) return null;

    const blocksA = (a.snapshot as { blocks?: { id: string }[] }).blocks ?? [];
    const blocksB = (b.snapshot as { blocks?: { id: string }[] }).blocks ?? [];

    const idsA = new Set(blocksA.map((bl) => bl.id));
    const idsB = new Set(blocksB.map((bl) => bl.id));

    return {
      added: blocksB.filter((bl) => !idsA.has(bl.id)).map((bl) => bl.id),
      removed: blocksA.filter((bl) => !idsB.has(bl.id)).map((bl) => bl.id),
      modified: blocksB
        .filter((bl) => idsA.has(bl.id))
        .filter((bl) => {
          const orig = blocksA.find((o) => o.id === bl.id);
          return JSON.stringify(orig) !== JSON.stringify(bl);
        })
        .map((bl) => bl.id),
    };
  }

  private startAutoSave(interval: number): void {
    this.autoSaveTimer = setInterval(() => {
      this.createVersion(`Auto-save ${new Date().toLocaleString()}`, "system");
    }, interval);
  }

  destroy(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.versions = [];
  }
}
