import type { GoTipeEditor } from "@gotipe/core";
import {
  INVISIBLES_LAYER,
  isInvisibleCharactersVisible,
  toggleInvisibleCharacters,
} from "@gotipe/core/extensions";
import { useEditorState } from "@gotipe/react";
import { Tip } from "../components/formatting/tip";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon } from "../page/icons";

/**
 * The ¶ switch of a fixed toolbar (Atlas frame 28): shows spaces, line breaks and paragraph ends
 * quieter than the text. The document never changes. Needs the `InvisibleCharacters` extension.
 */
export function InvisiblesToggle({ editor }: { editor: GoTipeEditor }) {
  const i18n = useBlockEditorI18n();
  // The layer changes the view state whenever it is shown or hidden, from here or elsewhere.
  const visible =
    useEditorState(editor, () => isInvisibleCharactersVisible(editor)) ??
    isInvisibleCharactersVisible(editor);
  return (
    <button
      type="button"
      className="gotipe-format-tool gotipe-invisibles-toggle"
      aria-label={i18n.t("invisibles.toggle")}
      aria-pressed={visible}
      data-gotipe-layer={INVISIBLES_LAYER}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => toggleInvisibleCharacters(editor)}
    >
      <PageIcon name="pilcrow" />
      <Tip label={i18n.t("invisibles.toggle")} />
    </button>
  );
}
