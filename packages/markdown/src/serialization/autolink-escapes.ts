import { AutolinkScanner, charBefore } from "../grammar/autolinks";
import type { Unit } from "./inline-types";

/**
 * Typed text that a reader would take for an autolink literal (`www.a.b`, `http://…`, `a@b.cd`)
 * gets the character that starts one escaped (`www\.a.b`), so it reads back as text (D-97). A
 * run of typed characters is one text for the reader, whatever each is written as, but only the
 * characters written as they are can start an address; it is scanned as the reader scans it,
 * and an escape made here keeps that address from starting. The Rust writer
 * (`crates/gotipe-export/src/markdown/autolink_escapes.rs`) does the same.
 */
export function escapeAutolinks(units: readonly Unit[], rend: string[]): void {
  for (let k = 0; k < units.length; ) {
    if (units[k]!.k !== "t") {
      k++;
      continue;
    }
    let text = "";
    /** The unit of every UTF-16 offset of the run's text. */
    const unitAt: number[] = [];
    for (; units[k]?.k === "t"; k++) {
      const ch = (units[k] as Extract<Unit, { k: "t" }>).ch;
      for (let i = 0; i < ch.length; i++) unitAt.push(k);
      text += ch;
    }
    if (!/[@:]|www\./.test(text)) continue;
    const literal = (index: number): boolean => {
      const unit = units[unitAt[index]!] as Extract<Unit, { k: "t" }>;
      return rend[unitAt[index]!] === unit.ch;
    };
    const scanner = new AutolinkScanner(text, literal);
    for (let p = 0; p < text.length; ) {
      const link = scanner.at(p, charBefore(text, p));
      if (!link) {
        p++;
        continue;
      }
      // the address does not start any more; what else starts here is looked for again
      rend[unitAt[link.trigger]!] = `\\${text[link.trigger]}`;
    }
  }
}
