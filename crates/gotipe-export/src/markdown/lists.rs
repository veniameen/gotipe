//! Lists, written item by item, and the blocks under an item, each line after the item's
//! indentation, as the TS writer writes them (`renderList` of `serialization/blocks.ts`).
use gotipe_core::{AttrValue, Block};

use super::{
    block_to_markdown, followers, hazards,
    inline::content_to_markdown,
    own_lines, shown,
    units::{Kind, Options},
    Emoji,
};

/// The number the first item of a numbered list is written with, as `listStart` of the TS
/// writer: a whole number from 0, a string read as `parseInt` reads it, and 1 otherwise.
pub(super) fn list_start(list: &Block) -> usize {
    let start = match list.attrs.get("start") {
        Some(AttrValue::Number(number)) => *number,
        Some(AttrValue::String(text)) => parse_int(text),
        None | Some(AttrValue::Null) => 1.0,
        Some(_) => f64::NAN,
    };
    if start.is_finite() && start >= 0.0 {
        start.trunc() as usize
    } else {
        1
    }
}

/// `Number.parseInt(text, 10)` of JavaScript: leading blanks, a sign, then decimal digits.
fn parse_int(text: &str) -> f64 {
    let text =
        text.trim_start_matches(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}');
    let (negative, rest) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text.strip_prefix('+').unwrap_or(text)),
    };
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    match rest[..digits].parse::<f64>() {
        Ok(value) if negative => -value,
        Ok(value) => value,
        Err(_) => f64::NAN,
    }
}

/// A list, each line after `outer`, the indentation of the items around it. A nested list is
/// written the same way, not indented afterwards, so the blank line before a list that cannot
/// interrupt the text of its item stays empty at any depth, as in the TS writer.
pub(super) fn list_to_markdown(list: &Block, emoji: &Emoji, tier: u8, outer: &str) -> String {
    let attr = |name: &str| match list.attrs.get(name) {
        Some(AttrValue::String(value)) => value.as_str(),
        _ => "",
    };
    let start = list_start(list);
    let marker = match attr("marker") {
        "+" => "+",
        "*" => "*",
        _ => "-",
    };
    // a loose list has a blank line between its items and before the children of an item, as in
    // the TS writer (D-113)
    let spread = matches!(list.attrs.get("spread"), Some(AttrValue::Bool(true)));
    let mut rendered = String::new();
    for (i, item) in list.children.iter().enumerate() {
        if spread && i > 0 {
            rendered.push('\n');
        }
        let prefix = if list.block_type == "orderedList" {
            let delimiter = if attr("delimiter") == ")" { ")" } else { "." };
            format!("{}{delimiter} ", start + i)
        } else if list.block_type == "todoList" || item.attrs.contains_key("checked") {
            if matches!(item.attrs.get("checked"), Some(AttrValue::Bool(true))) {
                format!("{marker} [x] ")
            } else {
                format!("{marker} [ ] ")
            }
        } else {
            format!("{marker} ")
        };
        // a task's text follows its `[ ] ` on the marker's line; continuation lines and nested
        // blocks stand under the item's text, and as `[ ] ` is part of a task's text, its indent
        // is the marker's, as the TS writer
        let task = prefix.ends_with("] ");
        let width = if task { marker.len() + 1 } else { prefix.len() };
        let indent = format!("{outer}{}", " ".repeat(width));
        let newline = format!("\n{indent}");
        let options = Options {
            kind: if task { Kind::Midline } else { Kind::Block },
            tier,
            continuation: false,
            newline: &newline,
            emoji,
        };
        let text = content_to_markdown(&item.content, &options);
        // an item without text is its marker alone, as the TS writer writes it
        rendered.push_str(outer);
        rendered.push_str(if text.is_empty() {
            prefix.trim_end()
        } else {
            &prefix
        });
        rendered.push_str(&text);
        rendered.push('\n');
        let lines = task || !text.is_empty();
        // a line before the child that a line without a blank one before it would continue
        let mut open = lines;
        let children = hazards::children(shown(item));
        for (index, child) in children.iter().enumerate() {
            // a list that cannot interrupt the text of the item, or the `[ ]` of a task, starts
            // after a blank line, as a block that would continue the text before it (D-116);
            // right after the marker of an item without text a blank line would end the item
            // (D-117)
            let apart = (spread && (lines || index > 0))
                || ((lines || open) && hazards::cannot_interrupt(child))
                || (open && hazards::continues_text(child));
            if apart {
                rendered.push('\n');
            }
            // a divider right under a line of the item is `***`: `---` would underline the text
            // above it as a heading (D-115)
            let stars = !apart && child.block_type == "divider";
            indented(child, emoji, tier, &indent, stars, &mut rendered);
            if index + 1 < children.len() {
                close_indented(child, emoji, tier, &indent, &mut rendered);
            }
            open = !hazards::closed(child);
        }
    }
    rendered
}

/// The closing line of `child` under a list item, each line after `indent` (`close`).
fn close_indented(child: &Block, emoji: &Emoji, tier: u8, indent: &str, out: &mut String) {
    if !hazards::copies_opener(child) {
        return;
    }
    let markdown = block_to_markdown(child, emoji, tier);
    let end = markdown.strip_suffix('\n').map_or(markdown.len(), str::len);
    let line = crate::markdown_parse::structure::closing_line(&markdown[..end]);
    for text in line.split(['\r', '\n']).filter(|text| !text.is_empty()) {
        out.push_str(indent);
        out.push_str(text);
        out.push('\n');
    }
}

/// `block` as a child of a list item, each line after `indent`, as `block_to_markdown` writes it;
/// the blank line before a child stays empty, as the TS writer leaves it (`blankLine`). With
/// `stars` a divider is `***`.
fn indented(block: &Block, emoji: &Emoji, tier: u8, indent: &str, stars: bool, out: &mut String) {
    if hazards::is_list(block) {
        out.push_str(&list_to_markdown(block, emoji, tier, indent));
        return;
    }
    let start = out.len();
    let own = match block.block_type.as_str() {
        "divider" if stars => "***\n".to_owned(),
        _ => own_lines(block, emoji, tier),
    };
    for line in own.lines() {
        out.push_str(indent);
        out.push_str(line);
        out.push('\n');
    }
    let children = followers(block);
    for (index, child) in children.iter().enumerate() {
        if out.len() > start {
            out.push('\n');
        }
        indented(child, emoji, tier, indent, false, out);
        if index + 1 < children.len() {
            close_indented(child, emoji, tier, indent, out);
        }
    }
}
