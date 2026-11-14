import { htmlAtoms } from "../../document/html-atoms";
import { rememberLocal, remoteAtomRepair } from "../../editor/remote-atom-repair";
import type { InlineAtomSupport } from "../../types/atoms";

/**
 * The atom support of the built-in atom extensions (`ExtensionConfig.atomSupport`): the
 * editor reaches this code only through an extension that carries it.
 */
export const INLINE_ATOM_SUPPORT: InlineAtomSupport = {
  rememberLocal,
  repairRemote: remoteAtomRepair,
  readHtml: htmlAtoms,
};
