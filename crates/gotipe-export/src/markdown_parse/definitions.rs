use super::{decode, links, source::width, Line, Node};
use std::collections::HashSet;
fn title_lines(first: &str, lines: &[Line], mut next: usize) -> (usize, bool) {
    let Some(open) = first.chars().next().filter(|c| "\"'(".contains(*c)) else {
        return (next, false);
    };
    let close = if open == '(' { ')' } else { open };
    let mut text = first;
    let mut offset = 1;
    loop {
        while offset < text.len() {
            let c = text[offset..].chars().next().unwrap();
            if c == '\\' && decode::punctuation(text[offset + 1..].chars().next()) {
                offset += 2;
                continue;
            }
            if c == close {
                return (next, text[offset + c.len_utf8()..].trim().is_empty());
            }
            if open == '(' && c == '(' {
                return (next, false);
            }
            offset += c.len_utf8();
        }
        if next >= lines.len() || lines[next].blank() {
            return (next, false);
        }
        text = &lines[next].text;
        next += 1;
        offset = 0;
    }
}
pub(super) fn read(
    lines: &[Line],
    index: usize,
    references: &mut HashSet<String>,
) -> Option<(Node, usize)> {
    let line = &lines[index];
    if !re!(r"^ {0,3}\[").is_match(&line.text) {
        return None;
    }
    let label_end = re!(r"(^|[^\\])\]");
    let mut label_text = line.text.clone();
    let mut end = index + 1;
    while !label_end.is_match(&label_text)
        && label_text.encode_utf16().count() < 1005
        && end < lines.len()
        && !lines[end].blank()
    {
        label_text.push('\n');
        label_text.push_str(&lines[end].text);
        end += 1;
    }
    let m = re!(r"(?s)^ {0,3}\[((?:\\.|[^\[\]\\]){1,999})\]:[ \t]*(.*)$").captures(&label_text)?;
    let label = &m[1];
    if label.trim().is_empty() || label.encode_utf16().count() > 999 {
        return None;
    }
    let footnote = label.starts_with('^');
    if footnote {
        while end < lines.len() {
            if width(&lines[end].text, lines[end].column) >= 4
                || lines[end].blank()
                    && end + 1 < lines.len()
                    && width(&lines[end + 1].text, lines[end + 1].column) >= 4
            {
                end += 1
            } else {
                break;
            }
        }
    } else {
        let mut value = m[2].to_string();
        if value.is_empty() && end < lines.len() && !lines[end].blank() {
            value = lines[end].text.trim_start().into();
            end += 1
        }
        let (_, dest_end) = links::destination(&value, 0)?;
        if dest_end == 0 {
            return None;
        }
        let tail = &value[dest_end..];
        if !tail.is_empty() && !tail.starts_with([' ', '\t']) {
            return None;
        }
        if !tail.trim().is_empty() {
            let (next, valid) = title_lines(tail.trim_start(), lines, end);
            if !valid {
                return None;
            }
            end = next
        } else if end < lines.len() && re!(r#"^[ \t]*["'(]"#).is_match(&lines[end].text) {
            let (next, valid) = title_lines(lines[end].text.trim_start(), lines, end + 1);
            if valid {
                end = next
            }
        }
    }
    references.insert(decode::label(label));
    Some((
        Node::text(
            if footnote {
                "footnoteDefinition"
            } else {
                "definition"
            },
            lines[index..end]
                .iter()
                .map(|l| l.text.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
            line.text_start(),
            lines[end - 1].end,
        ),
        end,
    ))
}
