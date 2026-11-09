import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { useGoTipeI18n } from "@gotipe/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageIcon } from "./icons";
import { usePageOverlay } from "./overlay";
import type { PageBlockCommand } from "./page-commands";
import { usePageBlockHandle } from "./use-page-block-handle";

const TURN_INTO = new Set([
  "text",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "todoList",
  "quote",
  "code",
  "callout",
  "agent",
]);

function firstTextBlock(block: BlockView): BlockView {
  if (block.children.length > 0 && (block.content === null || block.type.endsWith("List"))) {
    return firstTextBlock(block.children[0]!);
  }
  return block;
}

/**
 * The block handle (left of the hovered block) and its menu. Hidden in
 * read-only mode. `root` is the page editor element that holds the content.
 */
export function PageBlockMenu({
  editor,
  root,
  commands,
}: {
  editor: GoTipeEditor;
  root: HTMLElement | null;
  commands: PageBlockCommand[];
}) {
  const i18n = useGoTipeI18n();
  const overlay = usePageOverlay();
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [submenu, setSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { hover, setHover, indicator, editable, handleRef, onDragStart, onDragEnd } =
    usePageBlockHandle(editor, root, menu !== null);

  useEffect(() => {
    if (!editable) {
      setMenu(null);
      setSubmenu(false);
    }
  }, [editable]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
      setSubmenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setSubmenu(false);
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const maxTop = window.innerHeight - rect.height - 8;
    if (menu.top > maxTop) setMenu({ ...menu, top: Math.max(8, maxTop) });
  }, [menu]);

  const close = useCallback(() => {
    setMenu(null);
    setSubmenu(false);
    setHover(null);
  }, [setHover]);

  const withBlock = useCallback(
    (fn: (block: BlockView) => void) => {
      if (!menu) return;
      const block = editor.getViewState().blocks.find((b) => b.id === menu.id);
      if (block) fn(block);
      close();
    },
    [editor, menu, close],
  );

  if (!editable || !overlay) return null;

  const turnInto = commands.filter((c) => TURN_INTO.has(String(c.aliases[0])));

  return createPortal(
    <>
      {hover && !menu ? (
        <button
          ref={handleRef}
          type="button"
          className="gotipe-page-handle"
          aria-label={i18n.t("block.handle")}
          draggable
          data-gotipe-drag-handle=""
          data-block-drag={hover.dragId}
          aria-haspopup="menu"
          style={{
            position: "fixed",
            top: hover.handleTop,
            left: hover.left - 28,
          }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={() => {
            setMenu({ id: hover.id, top: hover.top, left: hover.left - 28 });
          }}
        >
          <PageIcon name="grip" />
        </button>
      ) : null}
      {indicator ? (
        <div
          className="gotipe-page-drop-indicator"
          data-gotipe-drop-indicator=""
          style={{ position: "fixed", ...indicator }}
          aria-hidden="true"
        />
      ) : null}
      {menu ? (
        <div
          ref={menuRef}
          className="gotipe-page-menu gotipe-block-menu"
          role="menu"
          aria-label={i18n.t("block.menu")}
          style={{ position: "fixed", top: menu.top, left: Math.max(8, menu.left - 230) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={submenu}
            className="gotipe-page-menu-item"
            onClick={() => setSubmenu((v) => !v)}
          >
            <span className="gotipe-page-menu-icon">
              <PageIcon name="text" />
            </span>
            <span className="gotipe-page-menu-label">{i18n.t("block.turnInto")}</span>
            <span className="gotipe-page-menu-meta gotipe-page-menu-chevron">
              <PageIcon name="chevron" />
            </span>
          </button>
          {submenu
            ? turnInto.map((cmd) => (
                <button
                  key={cmd.name}
                  type="button"
                  role="menuitem"
                  className="gotipe-page-menu-item gotipe-page-menu-sub"
                  onClick={() =>
                    withBlock((block) => {
                      const target = firstTextBlock(block);
                      editor.setSelection({
                        anchor: { blockId: target.id, offset: 0 },
                        head: { blockId: target.id, offset: 0 },
                      });
                      cmd.execute(editor);
                    })
                  }
                >
                  <span className="gotipe-page-menu-icon">
                    <PageIcon name={cmd.pageIcon} />
                  </span>
                  <span className="gotipe-page-menu-label">{cmd.name}</span>
                </button>
              ))
            : null}
          <div className="gotipe-page-menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="gotipe-page-menu-item"
            onClick={() => withBlock((b) => editor.chain().duplicateBlock(b.id).run())}
          >
            <span className="gotipe-page-menu-icon">
              <PageIcon name="duplicate" />
            </span>
            <span className="gotipe-page-menu-label">{i18n.t("block.duplicate")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="gotipe-page-menu-item"
            onClick={() => withBlock((b) => editor.chain().moveBlockUp(b.id).run())}
          >
            <span className="gotipe-page-menu-icon">
              <PageIcon name="up" />
            </span>
            <span className="gotipe-page-menu-label">{i18n.t("block.moveUp")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="gotipe-page-menu-item"
            onClick={() => withBlock((b) => editor.chain().moveBlockDown(b.id).run())}
          >
            <span className="gotipe-page-menu-icon">
              <PageIcon name="down" />
            </span>
            <span className="gotipe-page-menu-label">{i18n.t("block.moveDown")}</span>
          </button>
          <div className="gotipe-page-menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="gotipe-page-menu-item is-danger"
            onClick={() => withBlock((b) => editor.chain().deleteBlock(b.id).run())}
          >
            <span className="gotipe-page-menu-icon">
              <PageIcon name="trash" />
            </span>
            <span className="gotipe-page-menu-label">{i18n.t("block.delete")}</span>
          </button>
        </div>
      ) : null}
    </>,
    overlay,
  );
}
