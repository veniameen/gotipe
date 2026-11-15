---
"@gotipe/collaboration": patch
"@gotipe/react": patch
"@gotipe/sdk": patch
"@gotipe/versions": patch
---

The published JavaScript of these packages no longer carries source comments: esbuild kept
the ones inside class bodies and object literals, about 1.8 KB gzip in all, 1.4 KB of them
in `@gotipe/collaboration`. The type declarations keep the documentation of public methods
(`LocalCollaborationBridge`, `GoTipeClient`, `VersionsManager`), so editor hints are
unchanged. `GoTipeClient.getExportJob` names its first parameter `docId` in the
declarations (it was `_docId`). Behaviour does not change.
