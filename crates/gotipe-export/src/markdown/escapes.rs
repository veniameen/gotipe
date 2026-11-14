//! Step 6 of `writeInline` (`packages/markdown/src/inline-serialize.ts`): the escapes that depend
//! on what is written after a character, right to left where a later escape changes it.
use super::{characters::length16, escape_text, units::Unit, Emoji};
use crate::markdown_parse::atoms;

/// Step 6 of `writeInline`: typed backslashes, the dollars that would open a formula and the
/// colons that would start a registered custom emoji.
pub(super) fn following(
    units: &[Unit],
    rend: &mut [String],
    is_break: &dyn Fn(usize) -> bool,
    emoji: &Emoji,
) {
    let n = units.len();
    // backslashes, right to left: what one is written as depends on the unit after it
    for k in (0..n).rev() {
        if !matches!(units[k], Unit::Text('\\')) {
            continue;
        }
        let next = if k + 1 >= n {
            None
        } else if is_break(k + 1) {
            Some('\n')
        } else {
            rend[k + 1].chars().next()
        };
        rend[k] = match next {
            Some(next) if next != '\n' && !next.is_ascii_punctuation() => "\\".into(),
            _ => "\\\\".into(),
        };
    }
    escape_dollars(units, rend, is_break);
    if !emoji.is_empty() {
        escape_colons(units, rend, is_break, emoji);
    }
}

fn space(byte: Option<u8>) -> bool {
    matches!(byte, Some(b' ' | b'\t' | b'\n' | b'\r'))
}

/// Dollars, right to left: a typed `$` that would open a formula for a reader of inline formulas
/// is escaped; `$5 and $6` stays as typed. The rest of the line is read as `math_end` reads it
/// after a `$`: kept backwards as it is decided, with, for each byte, where the first `$` that no
/// backslash escapes stands from it.
fn escape_dollars(units: &[Unit], rend: &mut [String], is_break: &dyn Fn(usize) -> bool) {
    // the rest of the line, last byte first, and for each the index of the `$` reading stops at
    // from there (`None`: none on the line)
    let mut bytes: Vec<u8> = vec![];
    let mut stops: Vec<Option<usize>> = vec![];
    let write = |written: &str, bytes: &mut Vec<u8>, stops: &mut Vec<Option<usize>>| {
        for &byte in written.as_bytes().iter().rev() {
            let j = bytes.len();
            let stop = match byte {
                b'$' => Some(j),
                b'\\' if j >= 1 && bytes[j - 1] == b'\n' => None,
                b'\\' => j.checked_sub(2).and_then(|next| stops[next]),
                b'\n' => None,
                _ => j.checked_sub(1).and_then(|next| stops[next]),
            };
            bytes.push(byte);
            stops.push(stop);
        }
    };
    let typed_dollar = |k: usize| matches!(units.get(k), Some(Unit::Text('$')));
    let mut k = units.len();
    while k > 0 {
        k -= 1;
        if is_break(k) {
            bytes.clear();
            stops.clear();
            continue;
        }
        if !typed_dollar(k) {
            write(&rend[k], &mut bytes, &mut stops);
            continue;
        }
        let mut from = k;
        while from > 0 && typed_dollar(from - 1) {
            from -= 1;
        }
        let first = bytes.last().copied();
        let stop = bytes
            .len()
            .checked_sub(1)
            .filter(|_| first != Some(b'$') && !space(first))
            .and_then(|top| stops[top]);
        // `math_end` after a `$` alone: the `$` it stops at follows no blank and is followed by
        // no digit. Two or more typed dollars in a row are text for the reader as well, unless
        // the `$` of a formula follows them: joined with it they would make the formula text.
        let formula = from == k
            && stop.is_some_and(|stop| {
                !space(bytes.get(stop + 1).copied())
                    && !stop
                        .checked_sub(1)
                        .is_some_and(|after| bytes[after].is_ascii_digit())
            });
        if first == Some(b'$') || formula {
            for dollar in &mut rend[from..=k] {
                *dollar = "\\$".into();
            }
        }
        for written in rend[from..=k].iter().rev() {
            write(written, &mut bytes, &mut stops);
        }
        k = from;
    }
}

/// Where a word holds the start of an address: a scheme and `://`, or `www.` (`url_word` of the
/// reader), kept as the word is written.
#[derive(Default)]
struct UrlWord {
    found: bool,
    /// The run of scheme characters before here holds a letter.
    letter: bool,
    /// How much of `://` follows that run.
    colon: u8,
    tail: String,
}

impl UrlWord {
    fn push(&mut self, c: char) {
        if matches!(c, ' ' | '\t' | '\n' | '\r' | '\x0c' | '\x0b') {
            *self = Self::default();
            return;
        }
        self.colon = if self.colon > 0 && c == '/' {
            self.colon + 1
        } else {
            u8::from(c == ':' && self.letter)
        };
        self.found |= self.colon == 3;
        self.letter = if c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-') {
            self.letter || c.is_ascii_alphabetic()
        } else {
            false
        };
        self.tail.push(c);
        if self.tail.chars().count() > 4 {
            self.tail.remove(0);
        }
        self.found |= self.tail == "www.";
    }
}

/// Colons, left to right: typed `:name:` of a registered custom emoji is escaped, as a reader of
/// custom emoji would take it for one. `emoji_at` looks back at the character before the colon
/// and at the word it ends; both are kept as the line is written.
fn escape_colons(
    units: &[Unit],
    rend: &mut [String],
    is_break: &dyn Fn(usize) -> bool,
    emoji: &Emoji,
) {
    let mut word = UrlWord::default();
    let mut last: Option<char> = None;
    for k in 0..units.len() {
        if is_break(k) {
            word = UrlWord::default();
            last = None;
            continue;
        }
        if matches!(units[k], Unit::Text(':')) && rend[k] == ":" && !word.found {
            let mut rest = String::new();
            for q in (k + 1..units.len()).take_while(|q| !is_break(*q)) {
                if length16(&rest) >= 100 {
                    break;
                }
                rest.push_str(&rend[q]);
            }
            let before = last.map(String::from).unwrap_or_default();
            if atoms::emoji_at(&format!("{before}:{rest}"), before.len(), emoji).is_some() {
                rend[k] = "\\:".into();
            }
        }
        for c in rend[k].chars() {
            word.push(c);
            last = (!matches!(c, ' ' | '\t' | '\n' | '\r' | '\x0c' | '\x0b')).then_some(c);
        }
    }
}

/// Document text outside rich text (the alt of an image block): Markdown's characters escaped,
/// and a typed `$` alone that would open a formula. Right to left: an escape changes what a
/// formula before it reads.
pub(super) fn typed(text: &str) -> String {
    let mut text = escape_text(text);
    let dollars: Vec<usize> = text.match_indices('$').map(|(at, _)| at).collect();
    let mut index = dollars.len();
    while index > 0 {
        let last = index - 1;
        let mut first = last;
        while first > 0 && dollars[first - 1] + 1 == dollars[first] {
            first -= 1;
        }
        let line = text[dollars[last]..].split('\n').next().unwrap_or("");
        if first == last && atoms::math_end(line, 0).is_some() {
            text.insert(dollars[last], '\\');
        }
        index = first;
    }
    text
}
