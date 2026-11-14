use gotipe_core::{AttrValue, Block, Document};

mod breaks;
mod inline;
pub(crate) mod table_html;

pub use crate::markdown_parse::MarkdownAtoms;
use inline::{content_to_markdown, line_to_markdown};

/// Convert a Document to Markdown
pub fn to_markdown(doc: &Document) -> String {
    if let Some(first) = doc.blocks.first() {
        if let (Some(AttrValue::String(source)), Some(AttrValue::String(model))) = (
            first.attrs.get("markdownDocumentSource"),
            first.attrs.get("markdownDocumentModel"),
        ) {
            let mut current = doc.clone();
            current.version = 0;
            current.blocks[0].attrs.remove("markdownDocumentSource");
            current.blocks[0].attrs.remove("markdownDocumentModel");
            if serde_json::to_value(&current)
                .ok()
                .and_then(|value| serde_json::to_string(&value).ok())
                .as_deref()
                == Some(model.as_str())
            {
                return source.clone();
            }
        }
    }
    // Names of the document's custom emoji: typed text that looks like one is escaped.
    let mut emoji = Emoji::new();
    for block in &doc.blocks {
        inline::collect_emoji(block, &mut emoji);
    }
    doc.blocks
        .iter()
        .filter(|block| !omitted(block))
        .map(|block| block_to_markdown(block, &emoji))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Registered custom emoji names and their image addresses.
type Emoji = std::collections::BTreeMap<String, String>;

/// An empty formula or an embed without an address has no Markdown at any depth, as in the
/// TS writer.
fn omitted(block: &Block) -> bool {
    match block.block_type.as_str() {
        "math" => crate::plaintext::block_text(block).is_empty(),
        "embed" => {
            !matches!(block.attrs.get("url"), Some(AttrValue::String(url)) if !url.is_empty())
        }
        // a table without a single cell, as the TS writer
        "table" => block.children.iter().all(|row| row.children.is_empty()),
        _ => false,
    }
}

/// The children a writer shows, without omitted placeholders.
fn shown(block: &Block) -> impl Iterator<Item = &Block> {
    block.children.iter().filter(|child| !omitted(child))
}

fn block_to_markdown(block: &Block, emoji: &Emoji) -> String {
    let content = content_to_markdown(&block.content, emoji);
    let nested = shown(block)
        .map(|child| block_to_markdown(child, emoji))
        .collect::<Vec<_>>()
        .join("\n");
    let attr = |name: &str| match block.attrs.get(name) {
        Some(AttrValue::String(value)) => value.as_str(),
        _ => "",
    };
    match block.block_type.as_str() {
        "paragraph" => format!("{content}\n{nested}"),
        "heading" => {
            let level = match block.attrs.get("level") {
                Some(AttrValue::Number(n)) => *n as usize,
                _ => 1,
            }
            .clamp(1, 6);
            // a heading is one line: its line breaks are `<br>`, as the TS writer writes them
            let content = line_to_markdown(&block.content, emoji);
            format!("{} {content}\n{nested}", "#".repeat(level))
        }
        "bulletList" | "orderedList" | "todoList" => {
            let start = match block.attrs.get("start") {
                Some(AttrValue::Number(n)) => *n as usize,
                _ => 1,
            };
            block
                .children
                .iter()
                .enumerate()
                .map(|(i, item)| {
                    let marker = match attr("marker") {
                        "+" => "+",
                        "*" => "*",
                        _ => "-",
                    };
                    let prefix = if block.block_type == "orderedList" {
                        format!(
                            "{}{} ",
                            start + i,
                            if attr("delimiter") == ")" { ")" } else { "." }
                        )
                    } else if block.block_type == "todoList" || item.attrs.contains_key("checked") {
                        if matches!(item.attrs.get("checked"), Some(AttrValue::Bool(true))) {
                            format!("{marker} [x] ")
                        } else {
                            format!("{marker} [ ] ")
                        }
                    } else {
                        format!("{marker} ")
                    };
                    let text = content_to_markdown(&item.content, emoji);
                    // continuation lines and nested blocks stand under the item's text; a task's
                    // `[ ] ` is part of its text, so the indent is the marker's, as the TS writer
                    let indent = if prefix.ends_with("] ") {
                        " ".repeat(marker.len() + 1)
                    } else {
                        " ".repeat(prefix.len())
                    };
                    let mut rendered =
                        format!("{prefix}{}\n", text.replace('\n', &format!("\n{indent}")));
                    for child in shown(item) {
                        for line in block_to_markdown(child, emoji).lines() {
                            rendered.push_str(&format!("{indent}{line}\n"))
                        }
                    }
                    rendered
                })
                .collect()
        }
        "listItem" | "todoItem" => format!("{content}\n{nested}"),
        "codeBlock" => {
            let raw = crate::plaintext::block_text(block);
            let fence = code_fence(&raw, 3);
            // Older documents store plain text as `plain`/`plaintext`; new ones store "".
            let plain = ["plain", "plaintext"]
                .iter()
                .any(|name| attr("language").eq_ignore_ascii_case(name));
            let language = if plain && attr("meta").is_empty() {
                ""
            } else {
                attr("language")
            };
            let mut info = language.replace(['\n', '\r', '`'], "");
            if !attr("meta").is_empty() {
                info.push(' ');
                info.push_str(&attr("meta").replace(['\n', '\r', '`'], ""));
            }
            format!("{fence}{info}\n{raw}\n{fence}\n{nested}")
        }
        "blockquote" => {
            let head = if content.is_empty() {
                ">".to_owned()
            } else {
                quoted(&content)
            };
            quote_children(head, block, emoji)
        }
        "callout" => {
            let kind = match attr("type") {
                "tip" | "success" => "TIP",
                "important" => "IMPORTANT",
                "warning" => "WARNING",
                "caution" | "error" | "danger" => "CAUTION",
                _ => "NOTE",
            };
            let mut head = format!("> [!{kind}]");
            if !content.is_empty() {
                head.push('\n');
                head.push_str(&quoted(&content));
            }
            quote_children(head, block, emoji)
        }
        "divider" => "---\n".into(),
        "image" => format!(
            "![{}](<{}>{})\n{nested}",
            inline::typed(attr("alt")),
            destination(attr("src")),
            title_suffix(attr("caption"))
        ),
        "file" | "embed" => format!("{}\n{nested}", link_line(block)),
        "math" => format!("{}\n{nested}", math(&crate::plaintext::block_text(block))),
        "markdownRaw" => format!("{}\n{nested}", crate::plaintext::block_text(block)),
        "table" if table_html::has_merged_cells(block) => {
            format!("{}\n", table_html::table_html(block, "\n"))
        }
        "table" => {
            // the header row sets the columns; an empty one takes the widest row's, as the TS
            // writer; a row without cells keeps its place with one empty cell per column
            let columns = match block.children.first().map(|row| row.children.len()) {
                Some(count) if count > 0 => count,
                _ => block
                    .children
                    .iter()
                    .map(|row| row.children.len())
                    .max()
                    .unwrap_or(0)
                    .max(1),
            };
            let mut result = String::new();
            for (index, row) in block.children.iter().enumerate() {
                if row.children.is_empty() {
                    result.push_str(&format!("| {} |\n", vec![""; columns].join(" | ")));
                    if index == 0 {
                        result.push_str(&delimiters(block, columns));
                    }
                    continue;
                }
                let cells = row
                    .children
                    .iter()
                    .map(|cell| {
                        format!(
                            "{}{}",
                            inline::cell_to_markdown(&cell.content, emoji),
                            shown(cell)
                                .map(|child| block_to_markdown(child, emoji))
                                .collect::<String>()
                        )
                        .trim()
                        .replace('|', "\\|")
                        .replace('\n', "<br>")
                    })
                    .collect::<Vec<_>>();
                result.push_str(&format!("| {} |\n", cells.join(" | ")));
                if index == 0 {
                    result.push_str(&delimiters(block, cells.len()));
                }
            }
            result
        }
        _ => format!("{content}\n{nested}"),
    }
}
/// The delimiter row of a pipe table: one `---` per column, with its alignment.
fn delimiters(table: &Block, columns: usize) -> String {
    let alignment = match table.attrs.get("align") {
        Some(AttrValue::Array(values)) => values.as_slice(),
        _ => &[],
    };
    let cells: Vec<_> = (0..columns)
        .map(|column| match alignment.get(column) {
            Some(AttrValue::String(value)) if value == "left" => ":---",
            Some(AttrValue::String(value)) if value == "right" => "---:",
            Some(AttrValue::String(value)) if value == "center" => ":---:",
            _ => "---",
        })
        .collect();
    format!("| {} |\n", cells.join(" | "))
}

/// Every line of a quote's own text behind `> `.
fn quoted(text: &str) -> String {
    text.split('\n')
        .map(|line| format!("> {line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// A quote's children follow its text after a `>` line, as in the TS writer.
fn quote_children(mut quote: String, block: &Block, emoji: &Emoji) -> String {
    for child in shown(block) {
        quote.push_str("\n>\n");
        quote.push_str(&quoted(
            block_to_markdown(child, emoji).trim_end_matches('\n'),
        ));
    }
    quote.push('\n');
    quote
}

/// GitHub and most renderers show a `$$` block as display math. TeX with a line of its own
/// `$$` uses a ```` ```math ```` fence longer than any backtick run inside; as the TS writer.
fn math(tex: &str) -> String {
    let tex = tex.replace("\r\n", "\n").replace('\r', "\n");
    if tex
        .split('\n')
        .any(|line| line.trim_matches([' ', '\t']) == "$$")
    {
        let fence = code_fence(&tex, 3);
        format!("{fence}math\n{tex}\n{fence}")
    } else {
        format!("$$\n{tex}\n$$")
    }
}

/// A file or an embed is a link line to its address, labelled by its name or the address
/// itself; byte-identical to `linkLine` in @gotipe/markdown.
fn link_line(block: &Block) -> String {
    let attr = |name: &str| match block.attrs.get(name) {
        Some(AttrValue::String(value)) => value.as_str(),
        _ => "",
    };
    let url = attr("url");
    let label = [attr("name"), attr("title"), url]
        .into_iter()
        .find(|value| !value.is_empty())
        .unwrap_or("");
    let label = label.replace("\r\n", " ").replace(['\r', '\n'], " ");
    format!("[{}]({})", escape_text(&label), link_destination(url))
}

/// `linkDestination` of @gotipe/markdown: the raw form when it is safe, `<...>` otherwise.
fn link_destination(href: &str) -> String {
    if href.is_empty() {
        return "<>".into();
    }
    let mut depth = 0i64;
    let mut balanced = true;
    for c in href.chars() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                balanced &= depth >= 0;
            }
            _ => {}
        }
    }
    let plain =
        |c: char| !(js_space(c) || matches!(c, '<' | '>' | '\\') || c <= '\u{1f}' || c == '\u{7f}');
    if balanced && depth == 0 && href.chars().all(plain) {
        return escape_entities(href);
    }
    let mut inner = String::new();
    for c in href.chars() {
        if matches!(c, '\\' | '<' | '>') {
            inner.push('\\');
        }
        inner.push(c);
    }
    let inner = escape_entities(&inner)
        .replace("\r\n", "%0A")
        .replace(['\r', '\n'], "%0A");
    format!("<{inner}>")
}

/// JavaScript `\s`: the whitespace a raw link destination may not contain.
fn js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// Escapes `&` that would start a character reference (`&amp;`, `&#38;`, `&#x26;`).
fn escape_entities(text: &str) -> String {
    let mut result = String::new();
    for (index, c) in text.char_indices() {
        if c == '&' && starts_reference(&text[index + 1..]) {
            result.push('\\');
        }
        result.push(c);
    }
    result
}

fn starts_reference(rest: &str) -> bool {
    let bytes = rest.as_bytes();
    let run = |from: usize, accept: fn(&u8) -> bool| {
        bytes[from.min(bytes.len())..]
            .iter()
            .take_while(|b| accept(b))
            .count()
    };
    let (start, length, bounds) = match bytes {
        [b'#', b'x' | b'X', ..] => (2, run(2, u8::is_ascii_hexdigit), 1..=6),
        [b'#', ..] => (1, run(1, u8::is_ascii_digit), 1..=7),
        [first, ..] if first.is_ascii_alphabetic() => {
            (0, run(0, u8::is_ascii_alphanumeric), 2..=32)
        }
        _ => return false,
    };
    bounds.contains(&length) && bytes.get(start + length) == Some(&b';')
}

fn title_suffix(title: &str) -> String {
    if title.is_empty() {
        String::new()
    } else {
        format!(
            " \"{}\"",
            title
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('&', "\\&")
        )
    }
}
fn destination(url: &str) -> String {
    url.replace('\\', "\\\\")
        .replace('<', "\\<")
        .replace('>', "\\>")
        .replace('&', "\\&")
        .replace('\n', "%0A")
        .replace('\r', "%0D")
}
fn escape_text(text: &str) -> String {
    let mut result = String::new();
    for c in text.chars() {
        if "\\`*_[]<>#!~&".contains(c) {
            result.push('\\')
        };
        result.push(c)
    }
    result
}
fn code_fence(text: &str, minimum: usize) -> String {
    let mut longest = 0;
    let mut current = 0;
    for c in text.chars() {
        if c == '`' {
            current += 1;
            longest = longest.max(current)
        } else {
            current = 0
        }
    }
    "`".repeat(minimum.max(longest + 1))
}
/// Parse supported Markdown into GoTipe blocks, retaining unknown syntax as raw content.
/// Mentions, inline formulas and inline images are read as atoms when `schema` declares
/// their marks atomic; see `from_markdown_with_atoms` for custom emoji.
pub fn from_markdown(
    md: &str,
    schema: &gotipe_core::Schema,
) -> Result<Document, crate::ConvertError> {
    from_markdown_with_atoms(md, schema, &MarkdownAtoms::from_schema(schema))
}

/// `from_markdown` reading exactly the inline atoms in `atoms`; `:name:` of a registered
/// custom emoji is one of them.
pub fn from_markdown_with_atoms(
    md: &str,
    _schema: &gotipe_core::Schema,
    atoms: &MarkdownAtoms,
) -> Result<Document, crate::ConvertError> {
    Ok(crate::markdown_parse::parse(md, atoms))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::{Block, BlockContent, BlockId, Mark, TextSpan};
    use std::collections::HashMap;

    #[test]
    fn test_paragraph_to_markdown() {
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Hello World".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        assert_eq!(to_markdown(&doc), "Hello World\n");
    }

    #[test]
    fn test_heading_to_markdown() {
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "heading".into(),
                attrs: HashMap::from([("level".into(), AttrValue::Number(2.0))]),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Title".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        assert_eq!(to_markdown(&doc), "## Title\n");
    }

    #[test]
    fn test_bold_mark_to_markdown() {
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "bold".into(),
                    marks: vec![Mark::new("bold")],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        assert!(to_markdown(&doc).contains("**bold**"));
    }

    #[test]
    fn test_deprecated_agent_callout_is_written_as_a_note_alert() {
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "callout".into(),
                attrs: HashMap::from([("type".into(), AttrValue::String("agent".into()))]),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Keep the table".into(),
                    marks: vec![],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        let md = to_markdown(&doc);
        assert_eq!(md, "> [!NOTE]\n> Keep the table\n");
        let schema = gotipe_core::defaults::default_block_editor();
        let back = from_markdown(&md, &schema).unwrap();
        assert_eq!(back.blocks[0].block_type, "callout");
        assert_eq!(
            back.blocks[0].attrs.get("type"),
            Some(&AttrValue::String("note".into()))
        );
    }

    #[test]
    fn test_from_markdown_paragraph() {
        let schema = gotipe_core::defaults::default_block_editor();
        let doc = from_markdown("Hello World", &schema).unwrap();
        assert_eq!(doc.blocks.len(), 1);
        assert_eq!(doc.blocks[0].block_type, "paragraph");
    }

    #[test]
    fn test_markdown_roundtrip() {
        let schema = gotipe_core::defaults::default_block_editor();
        let md = "# Heading\n\nParagraph text\n\n---\n";
        let doc = from_markdown(md, &schema).unwrap();
        assert!(doc.blocks.len() >= 2);
    }
}
