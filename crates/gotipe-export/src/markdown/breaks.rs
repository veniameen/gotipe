//! Line breaks of a block's text, as `packages/markdown` writes them (D-88). A bare line
//! ending is a soft break, a space for every reader, so a "\n" of the document is written as a
//! hard break, `\` and a line ending, where its line has text and more text follows, and as
//! `&#10;` where it has not. The line after a hard break must not start a block: its leading
//! whitespace and the markers of lists, setext underlines and table rows are escaped.

/// One run of the block's text in writing order: the document text and whether it is typed
/// text, whose "\n" are line breaks (code and verbatim source keep theirs).
pub(super) struct Piece<'a> {
    pub text: &'a str,
    pub typed: bool,
}

/// Whether each "\n" of typed text, in order, is a hard break (`false`: `&#10;`). The rule of
/// `writeInline`: a line break needs text on its line before it and text anywhere after it.
pub(super) fn decide(pieces: &[Piece]) -> Vec<bool> {
    // every character of the text: Some(true) a line break, Some(false) text, None nothing
    let mut units = vec![];
    for piece in pieces {
        for c in piece.text.chars() {
            units.push(match c {
                '\n' if piece.typed => Some(true),
                '\r' if piece.typed => None,
                _ => Some(false),
            });
        }
    }
    let mut text_after = vec![false; units.len() + 1];
    for index in (0..units.len()).rev() {
        text_after[index] = text_after[index + 1] || units[index] == Some(false);
    }
    let mut hard = vec![];
    let mut line_has_text = false;
    for (index, unit) in units.iter().enumerate() {
        match unit {
            Some(true) if line_has_text && text_after[index + 1] => {
                hard.push(true);
                line_has_text = false;
            }
            Some(true) => {
                hard.push(false);
                line_has_text = true;
            }
            Some(false) => line_has_text = true,
            None => {}
        }
    }
    hard
}

/// Writes the typed "\n" at byte offsets `newlines` (ascending) as `hard` says. With a hard
/// break the typed `|` at `pipes` are escaped too: a line may not read as a table row.
pub(super) fn apply(text: &mut String, newlines: &[usize], hard: &[bool], pipes: &[usize]) {
    let mut newlines = newlines.to_vec();
    if hard.iter().any(|hard| *hard) {
        for &pipe in pipes.iter().rev() {
            text.insert(pipe, '\\');
            for offset in newlines.iter_mut().filter(|offset| **offset > pipe) {
                *offset += 1;
            }
        }
    }
    // right to left: what is written for one break does not move the ones before it
    for (&at, &hard) in newlines.iter().zip(hard).rev() {
        if !hard {
            text.replace_range(at..at + 1, "&#10;");
            continue;
        }
        escape_line_start(text, at + 1);
        let before = text[..at].chars().next_back();
        let mut at = at;
        if let Some(space @ (' ' | '\t')) = before {
            let reference = if space == ' ' { "&#32;" } else { "&#9;" };
            text.replace_range(at - 1..at, reference);
            at += reference.len() - 1;
        }
        text.insert(at, '\\');
    }
}

/// `^c+[ \t]*$`: a run of `c` and nothing after it but blanks (a setext underline).
fn underline(line: &str, c: char) -> bool {
    let rest = line.trim_start_matches(c);
    rest.len() < line.len() && rest.trim_matches([' ', '\t']).is_empty()
}

/// `^-[ \t]*(?:-[ \t]*){2,}$`: a thematic break of dashes.
fn dashes(line: &str) -> bool {
    line.starts_with('-')
        && line.chars().all(|c| matches!(c, '-' | ' ' | '\t'))
        && line.matches('-').count() >= 3
}

/// `^:?-+:?[ \t]*(?:\||$)`: a cell of a table's delimiter row. Its typed `|` may already be
/// escaped (`\|`): the reader's view of the text is the one that counts.
fn delimiter_cell(line: &str) -> bool {
    let rest = line.strip_prefix(':').unwrap_or(line);
    let after = rest.trim_start_matches('-');
    if after.len() == rest.len() {
        return false;
    }
    let after = after.strip_prefix(':').unwrap_or(after);
    let after = after.trim_start_matches([' ', '\t']);
    after.is_empty() || after.starts_with('|') || after.starts_with("\\|")
}

/// The line starting at byte `start` follows a hard break: what a reader would take for the
/// start of a block is escaped, as `writeInline` escapes it.
fn escape_line_start(text: &mut String, start: usize) {
    let end = text[start..].find('\n').map_or(text.len(), |n| start + n);
    let line = &text[start..end];
    let blank_after = |at: usize| line[at..].starts_with([' ', '\t']) || at == line.len();
    let escape = match line.chars().next() {
        // indentation is not text after a line break
        Some(space @ (' ' | '\t')) => {
            let reference = if space == ' ' { "&#32;" } else { "&#9;" };
            text.replace_range(start..start + 1, reference);
            return;
        }
        Some('-') => blank_after(1) || underline(line, '-') || dashes(line) || delimiter_cell(line),
        Some('+') => blank_after(1),
        Some('=') => underline(line, '='),
        Some(':') => delimiter_cell(line),
        Some('0'..='9') => {
            // an ordered list marker: the delimiter after the digits is escaped
            let digits = line.bytes().take_while(u8::is_ascii_digit).count();
            if digits <= 9 && line[digits..].starts_with(['.', ')']) && blank_after(digits + 1) {
                text.insert(start + digits, '\\');
            }
            return;
        }
        _ => false,
    };
    if escape {
        text.insert(start, '\\');
    }
}
