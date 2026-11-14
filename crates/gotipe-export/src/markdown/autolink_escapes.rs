//! Typed text that a reader would take for an autolink literal (`www.a.b`, `http://…`,
//! `a@b.cd`) gets the character that starts one escaped (`www\.a.b`), so it reads back as text
//! (D-97). A run of typed characters is one text for the reader, whatever each is written as,
//! but only the characters written as they are can start an address; it is scanned as the
//! reader scans it, and an escape made here keeps that address from starting.
//! `serialization/autolink-escapes.ts` of `packages/markdown` does the same.
use super::units::Unit;
use crate::markdown_parse::autolinks::AutolinkScanner;
use std::cell::Cell;

pub(super) fn escape_autolinks(units: &[Unit], rend: &mut [String]) {
    let mut k = 0;
    while k < units.len() {
        if !matches!(units[k], Unit::Text(_)) {
            k += 1;
            continue;
        }
        let mut text = String::new();
        // the unit of every byte of the run's text
        let mut unit_at = vec![];
        while let Some(Unit::Text(c)) = units.get(k) {
            unit_at.extend(std::iter::repeat_n(k, c.len_utf8()));
            text.push(*c);
            k += 1;
        }
        if !text.contains(['@', ':']) && !text.contains("www.") {
            continue;
        }
        // which bytes are written as they are: only those can start an address
        let literal_at: Vec<Cell<bool>> = unit_at
            .iter()
            .map(|&unit| {
                let as_is = matches!(units[unit], Unit::Text(c)
                    if rend[unit].len() == c.len_utf8() && rend[unit].starts_with(c));
                Cell::new(as_is)
            })
            .collect();
        let literal = |at: usize| literal_at[at].get();
        let mut scanner = AutolinkScanner::new(&text);
        let mut p = 0;
        while p < text.len() {
            let Some(link) = scanner.at(p, text[..p].chars().next_back(), &literal) else {
                p += text[p..].chars().next().map_or(1, char::len_utf8);
                continue;
            };
            // the address does not start any more; what else starts here is looked for again
            rend[unit_at[link.trigger]] = format!("\\{}", &text[link.trigger..link.trigger + 1]);
            literal_at[link.trigger].set(false);
        }
    }
}
