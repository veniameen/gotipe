import type { GoTipeEditor } from "@gotipe/core";
import { type TextAlignment, getTextAlign, setTextAlign } from "@gotipe/core/extensions";
import type { TranslationKey } from "@gotipe/i18n";
import { useEditorState } from "@gotipe/react";
import { useId } from "react";
import { ALIGN_KEYS, ariaKeys } from "../components/formatting/keys";
import { MenuKey, Tip } from "../components/formatting/tip";
import { useFormattingMenu } from "../components/formatting/use-formatting-menu";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon, type PageIconName } from "../page/icons";

/** The four alignments of a block (Atlas frame 27), in the order the menus list them. */
export const ALIGN_OPTIONS: readonly {
  value: TextAlignment;
  icon: PageIconName;
  name: TranslationKey;
}[] = [
  { value: "left", icon: "alignLeft", name: "align.left" },
  { value: "center", icon: "alignCenter", name: "align.center" },
  { value: "right", icon: "alignRight", name: "align.right" },
  { value: "justify", icon: "alignJustify", name: "align.justify" },
];

/** Block types `TextAlign` aligns by default. */
const ALIGNABLE = ["paragraph", "heading"];

/** Whether the block under the caret takes an alignment. */
export function useAlignable(editor: GoTipeEditor): boolean {
  return (
    useEditorState(editor, () => ALIGNABLE.includes(editor.getCurrentBlock()?.type ?? "")) ?? false
  );
}

/** The alignment of the block under the caret, `left` by default; re-read on every change. */
export function useTextAlign(editor: GoTipeEditor): TextAlignment {
  return useEditorState(editor, () => getTextAlign(editor) ?? "left") ?? "left";
}

/**
 * Menu rows of the four alignments: the current one ticked, the others with their keys. `pick`
 * runs the choice on the selection the menu was opened on.
 */
export function AlignOptions({
  current,
  pick,
  role = "menuitemradio",
  disabled = false,
}: {
  current: TextAlignment;
  pick: (value: TextAlignment) => void;
  role?: "menuitemradio" | "option";
  disabled?: boolean;
}) {
  const i18n = useBlockEditorI18n();
  return (
    <>
      {ALIGN_OPTIONS.map((option) => {
        const chosen = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            role={role}
            className={chosen ? "is-current" : undefined}
            {...(role === "option" ? { "aria-selected": chosen } : { "aria-checked": chosen })}
            aria-keyshortcuts={ariaKeys(ALIGN_KEYS[option.value])}
            data-align={option.value}
            disabled={disabled}
            onClick={() => pick(option.value)}
          >
            <PageIcon name={option.icon} />
            <span className="gotipe-menu-text">{i18n.t(option.name)}</span>
            {chosen ? (
              <PageIcon name="check" className="gotipe-menu-end" />
            ) : (
              <MenuKey binding={ALIGN_KEYS[option.value]} />
            )}
          </button>
        );
      })}
    </>
  );
}

/**
 * The alignment list of a fixed toolbar (Atlas frame 27, modern view): the current alignment's
 * glyph and a chevron; the list holds the same rows as “More”. Where a block takes no alignment,
 * or the editor is read-only, the tool stays focusable and its tooltip says why (frame 31).
 */
export function AlignPicker({ editor }: { editor: GoTipeEditor }) {
  const i18n = useBlockEditorI18n();
  const menu = useFormattingMenu(editor);
  const current = useTextAlign(editor);
  const alignable = useAlignable(editor);
  const tip = useId();
  const icon = ALIGN_OPTIONS.find((option) => option.value === current)?.icon ?? "alignLeft";
  const reason = !menu.editable
    ? i18n.t("toolbar.readOnly")
    : alignable
      ? null
      : i18n.t("align.unavailable");
  return (
    <div className="gotipe-format-anchor">
      <button
        ref={menu.trigger}
        type="button"
        className="gotipe-format-tool is-pick"
        aria-label={i18n.t("align.label")}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        aria-disabled={reason ? true : undefined}
        aria-describedby={reason ? tip : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (reason) return;
          if (menu.open) menu.close();
          else menu.show();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !menu.open && !reason) {
            event.preventDefault();
            menu.show();
          }
        }}
      >
        <PageIcon name={icon} />
        <PageIcon name="chevron" />
        <Tip id={tip} label={reason ?? i18n.t("align.label")} />
      </button>
      {menu.open && (
        <div
          ref={menu.popup}
          className="gotipe-format-menu"
          role="listbox"
          aria-label={i18n.t("align.label")}
          data-gotipe-formatting-popup=""
          style={menu.style}
          onKeyDown={menu.keydown}
        >
          <AlignOptions
            role="option"
            current={current}
            pick={(value) => menu.apply(() => setTextAlign(editor, value))}
          />
        </div>
      )}
    </div>
  );
}
