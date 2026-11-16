import { afterEach, describe, expect, it, vi } from "vitest";
import { DefaultPreset } from "../src/presets";
import type { TextSpan } from "../src/types/block";
import type { EditorHost } from "../src/types/editor";
import { ENGINES, createOn, doc, paragraph } from "./engines";

// D-186: a click on a link gives the host the link's own `target` in `info`, and the host
// decides where it opens. The editor still asks for a new tab and, without a host, opens one.
const link = (text: string, href: string, target?: string): TextSpan => ({
  text,
  marks: [{ type: "link", attrs: target ? { href, target } : { href } }],
});
const plain = (text: string): TextSpan => ({ text, marks: [] });
// One address, two targets: the click is read at its link, not by its address.
const content = doc(
  paragraph("a", [
    plain("Ёж 😀 "),
    link("сюда", "https://x.y/same", "_self"),
    plain(" и "),
    link("туда", "https://x.y/same", "_blank"),
  ]),
  paragraph("b", [link("без цели", "https://x.y/bare")]),
);
// What an adapter draws: anchors without `target`.
const markup =
  '<p data-block-id="a" data-block-type="paragraph">Ёж 😀 <a href="https://x.y/same">сюда</a> и ' +
  '<a href="https://x.y/same">туда</a></p>' +
  '<p data-block-id="b" data-block-type="paragraph"><a href="https://x.y/bare">без цели</a></p>';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe.each(ENGINES)("%s engine: link target goes to the host (D-186)", (engine) => {
  const mount = async (host?: EditorHost) => {
    const editor = await createOn(engine, { extensions: DefaultPreset, content, host });
    const root = document.createElement("div");
    root.innerHTML = markup;
    document.body.append(root);
    editor.mount(root);
    const anchors = [...root.querySelectorAll("a")];
    const click = (index: number, init: MouseEventInit, type = "click") =>
      anchors[index]!.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
    return { editor, click };
  };

  it("passes the target of the clicked link in info, null when the link has none", async () => {
    const openLink = vi.fn();
    const { editor, click } = await mount({ openLink });
    click(0, { ctrlKey: true });
    click(1, { metaKey: true });
    click(2, { button: 1 }, "auxclick");
    expect(openLink.mock.calls).toEqual([
      ["https://x.y/same", { blockId: "a", newTab: true, target: "_self" }],
      ["https://x.y/same", { blockId: "a", newTab: true, target: "_blank" }],
      ["https://x.y/bare", { blockId: "b", newTab: true, target: null }],
    ]);
    editor.setEditable(false);
    click(0, {});
    expect(openLink).toHaveBeenLastCalledWith("https://x.y/same", {
      blockId: "a",
      newTab: true,
      target: "_self",
    });
    editor.destroy();
  });

  it("opens a new tab without a host, whatever the target", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const page = window.location.href;
    const { editor, click } = await mount();
    click(0, { ctrlKey: true });
    expect(open).toHaveBeenCalledWith("https://x.y/same", "_blank", "noopener,noreferrer");
    expect(window.location.href).toBe(page);
    editor.destroy();
  });

  it("editor.openLink passes its target, null without one, as for a file block's name", async () => {
    const openLink = vi.fn();
    const { editor } = await mount({ openLink });
    editor.openLink("files/a.pdf", { blockId: "file", newTab: true });
    editor.openLink("https://x.y/same", { target: "_self" });
    expect(openLink.mock.calls).toEqual([
      ["files/a.pdf", { blockId: "file", newTab: true, target: null }],
      ["https://x.y/same", { blockId: null, newTab: true, target: "_self" }],
    ]);
    editor.destroy();
  });
});
