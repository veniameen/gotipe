//! Step 5 of `writeInline` (`packages/markdown/src/inline-serialize.ts`): each typed character
//! written as it is, escaped or as a character reference, by what a reader would take it for
//! where it stands: the start of a block, emphasis, a link, an entity, a list number.
use super::{
    inline::{class, Break},
    units::{Kind, Options, Unit},
};

/// How a typed character is written.
enum Typed {
    Literal,
    Escaped,
    Reference,
}

/// `^([-*_])[ \t]*(?:\1[ \t]*){2,}$`: a thematic break.
fn thematic(line: &str) -> bool {
    let Some(first @ ('-' | '*' | '_')) = line.chars().next() else {
        return false;
    };
    line.chars().all(|c| c == first || c == ' ' || c == '\t') && line.matches(first).count() >= 3
}

/// `^#{1,6}(?:[ \t]|$)`: an ATX heading marker.
fn atx_marker(line: &str) -> bool {
    re!(r"^#{1,6}(?:[ \t]|$)").is_match(line)
}

/// `^#+$`: the closing sequence of a heading.
fn hashes(line: &str) -> bool {
    !line.is_empty() && line.bytes().all(|b| b == b'#')
}

/// `^c+[ \t]*$`: a setext underline of `c`.
fn underline(line: &str, c: char) -> bool {
    let rest = line.trim_start_matches(c);
    rest.len() < line.len() && rest.trim_matches([' ', '\t']).is_empty()
}

/// `^:?-+:?[ \t]*(?:\||$)`: a cell of a table's delimiter row.
fn delimiter_row(line: &str) -> bool {
    re!(r"^:?-+:?[ \t]*(?:\||$)").is_match(line)
}

/// A character reference at the start of `look`.
fn reference_start(look: &str) -> bool {
    re!(r"^&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});").is_match(look)
}

/// The length JavaScript counts: the TypeScript writer limits its look-ahead by it.
pub(super) fn length16(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}

/// What step 5 knows of the lines.
pub(super) struct Lines<'a> {
    pub o: &'a Options<'a>,
    pub reference: &'a [bool],
    pub breaks: &'a [Option<Break>],
    pub line_index: &'a [usize],
    pub at_line_start: &'a [bool],
    pub line_start_of: &'a [usize],
    pub multiline: bool,
    pub block_rules: &'a dyn Fn(usize) -> bool,
}

/// Step 5 of `writeInline`: each typed character as it is, escaped or as a reference.
pub(super) fn decide(units: &[Unit], rend: &mut [String], lines: &Lines) {
    let n = units.len();
    let o = lines.o;
    let is_break = |k: usize| lines.breaks.get(k).copied().flatten() == Some(Break::Hard);
    // the rest of the line, as far as a block start can be told from it
    let line_rest = |k: usize, rend: &[String]| -> String {
        let mut rest = String::new();
        let mut length = 0;
        for q in (k..n).take_while(|q| !is_break(*q)) {
            let part = match &units[q] {
                Unit::Text(c) => c.to_string(),
                _ => rend[q].clone(),
            };
            length += length16(&part);
            rest.push_str(&part);
            if length > 200 {
                break;
            }
        }
        rest
    };
    let next_is_ws = |k: usize| match units.get(k + 1) {
        None => true,
        Some(Unit::Text(c)) => matches!(c, ' ' | '\t') && !lines.reference[k + 1],
        Some(Unit::Newline) => is_break(k + 1),
        Some(_) => false,
    };
    let next_first = |k: usize, rend: &[String]| match units.get(k + 1) {
        None => None,
        Some(Unit::Text(c)) => Some(*c),
        Some(_) => rend[k + 1].chars().next(),
    };
    let continued = |k: usize| lines.line_index[k] > 0 || o.continuation;
    // what is written so far, kept small: a block of any size is written in linear time (D-96)
    let mut last: Option<char> = None;
    let mut line_digits: Option<usize> = Some(0);
    let wrote = |written: &str, last: &mut Option<char>, digits: &mut Option<usize>| {
        if let Some(c) = written.chars().next_back() {
            *last = Some(c);
            *digits = digits
                .filter(|_| written.bytes().all(|b| b.is_ascii_digit()))
                .map(|count| count + written.len());
        }
    };
    for k in 0..n {
        let Unit::Text(c) = units[k] else {
            if is_break(k) {
                last = Some('\n');
                line_digits = Some(0);
            } else {
                wrote(&rend[k], &mut last, &mut line_digits);
            }
            continue;
        };
        let previous = if lines.at_line_start[k] { None } else { last };
        let previous_ws = previous.is_none() || class(previous) == 1;
        let bs = (lines.block_rules)(k);
        let after_bracket =
            previous == Some(']') && !matches!(units.get(k.wrapping_sub(1)), Some(Unit::Text(_)));
        let mode = match c {
            ' ' | '\t' if lines.reference[k] => Typed::Reference,
            '`' | '[' | ']' => Typed::Escaped,
            '*' if bs && (next_is_ws(k) || thematic(&line_rest(k, rend))) => Typed::Escaped,
            '*' if previous_ws && next_is_ws(k) => Typed::Literal,
            '*' => Typed::Escaped,
            '_' if bs && thematic(&line_rest(k, rend)) => Typed::Escaped,
            '_' if previous_ws && next_is_ws(k) => Typed::Literal,
            '_' => {
                let next = next_first(k, rend);
                let next_text =
                    matches!(units.get(k + 1), Some(Unit::Text(_))) && !lines.reference[k + 1];
                if previous.is_some()
                    && class(previous) == 0
                    && next.is_some()
                    && next_text
                    && class(next) == 0
                {
                    Typed::Literal
                } else {
                    Typed::Escaped
                }
            }
            '~' if previous_ws
                && next_is_ws(k)
                && !(bs && line_rest(k, rend).starts_with("~~~")) =>
            {
                Typed::Literal
            }
            '~' => Typed::Escaped,
            '<' if next_first(k, rend).is_some_and(|next| {
                next.is_ascii_alphabetic() || matches!(next, '/' | '!' | '?')
            }) =>
            {
                Typed::Escaped
            }
            '>' if bs => Typed::Escaped,
            '#' if bs && atx_marker(&line_rest(k, rend)) => Typed::Escaped,
            '#' if o.kind == Kind::Heading && previous_ws && hashes(&line_rest(k, rend)) => {
                Typed::Escaped
            }
            '-' if bs
                && (next_is_ws(k) || {
                    let rest = line_rest(k, rend);
                    thematic(&rest)
                        || continued(k) && (underline(&rest, '-') || delimiter_row(&rest))
                }) =>
            {
                Typed::Escaped
            }
            '+' if bs && next_is_ws(k) => Typed::Escaped,
            '=' if bs && continued(k) && underline(&line_rest(k, rend), '=') => Typed::Escaped,
            '.' | ')'
                if (lines.block_rules)(lines.line_start_of[k])
                    && line_digits.is_some_and(|count| (1..=9).contains(&count))
                    && next_is_ws(k) =>
            {
                Typed::Escaped
            }
            '&' => {
                let mut look = String::from("&");
                for unit in &units[k + 1..] {
                    if length16(&look) >= 40 {
                        break;
                    }
                    match unit {
                        Unit::Text(c) => look.push(*c),
                        Unit::Verbatim { text, .. } => look.push_str(text),
                        _ => break,
                    }
                }
                if reference_start(&look) {
                    Typed::Escaped
                } else {
                    Typed::Literal
                }
            }
            '!' if next_first(k, rend) == Some('[')
                && !matches!(units.get(k + 1), Some(Unit::Text(_))) =>
            {
                Typed::Escaped
            }
            ':' if bs && continued(k) && delimiter_row(&line_rest(k, rend)) => Typed::Escaped,
            ':' | '(' if after_bracket => Typed::Escaped,
            '|' if o.kind == Kind::Cell || lines.multiline => Typed::Escaped,
            _ => Typed::Literal,
        };
        let before = k.checked_sub(1).map(|before| &units[before]);
        let after = units.get(k + 1);
        // A digit right after a formula would make its closing `$` literal, and no letter or
        // digit may touch a custom emoji: `a:party:` is not one when read back.
        let digit_after_formula =
            c.is_ascii_digit() && matches!(before, Some(Unit::Syntax { math: 2, .. }));
        let emoji = |unit: Option<&Unit>| matches!(unit, Some(Unit::Verbatim { emoji: true, .. }));
        let touches_emoji = c.is_ascii_alphanumeric() && (emoji(before) || emoji(after));
        let mode = if digit_after_formula || touches_emoji {
            Typed::Reference
        } else {
            mode
        };
        rend[k] = match mode {
            Typed::Literal => c.to_string(),
            Typed::Escaped => format!("\\{c}"),
            Typed::Reference => format!("&#{};", u32::from(c)),
        };
        wrote(&rend[k], &mut last, &mut line_digits);
    }
}
