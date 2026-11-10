// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { detectPii } from "../src/pii";

beforeAll(() =>
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  }),
);
it("matches actual native detection and UTF16 offsets across Unicode and formatted input", () => {
  const editor = wasm.WasmEditor.withDefaultSchema('{"version":0,"blocks":[]}');
  const cases = [
    "clean",
    "Ж😀 test@example.com +1 (555) 123-4567",
    "4111 1111 1111 1111",
    "bad 4111 1111 1111 1112",
    "ж4111111111111111я",
    "a.b+name@host.example",
    "1234567",
    "٤111 1111 1111 1111",
    "a".repeat(50000),
  ];
  for (const separator of ["", "-", ".", " ", "\t", "\u0085", "\u00a0", "\u2009", "\ufeff"]) {
    for (const prefix of ["", "+1", "+1 ", "1-"])
      cases.push(
        `😀 ${prefix}(555)${separator}123${separator}4567 4111${separator}1111${separator}1111${separator}1111`,
      );
  }
  try {
    for (const text of cases)
      expect(detectPii(text), text.slice(0, 80)).toEqual(JSON.parse(editor.detect_pii(text)));
  } finally {
    editor.free();
  }
});
