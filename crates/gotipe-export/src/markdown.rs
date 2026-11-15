use std::borrow::Cow;

use gotipe_core::{AttrValue, Block, Document};

mod autolink_escapes;
mod characters;
mod escapes;
mod hazards;
mod inline;
mod links;
mod spans;
pub(crate) mod table_html;
mod units;
mod verify;

pub use crate::markdown_parse::MarkdownAtoms;
use hazards::Top;
use inline::content_to_markdown;
use links::{destination, link_line, title_suffix};
use units::{Kind, Options};

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
    hazards::top_blocks(&doc.blocks)
        .iter()
        .map(|top| match top {
            Top::Block(block) => verified(block, &emoji),
            Top::Stars => "***\n".into(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The first rendering of a top-level block that reads back as the block (`verify.rs`).
fn verified(block: &Block, emoji: &Emoji) -> String {
    verify::first_reading_back(block, emoji, |tier| block_to_markdown(block, emoji, tier))
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

/// The children a writer shows: not omitted placeholders, nor children that write no line, as
/// in the TS writer; the blank line of one after the marker of an item without text would end
/// the item (D-117).
fn shown(block: &Block) -> impl Iterator<Item = &Block> {
    block
        .children
        .iter()
        .filter(|child| !hazards::writes_no_line(child))
}

/// The number the first item of a numbered list is written with, as `listStart` of the TS
/// writer: a whole number from 0, a string read as `parseInt` reads it, and 1 otherwise.
fn list_start(list: &Block) -> usize {
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
fn list_to_markdown(list: &Block, emoji: &Emoji, tier: u8, outer: &str) -> String {
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
        for (index, child) in hazards::children(shown(item)).iter().enumerate() {
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
            open = !hazards::closed(child);
        }
    }
    rendered
}

/// A block, then its children after a blank line, as the TS writer writes them: on the next line
/// a paragraph would continue the text before it (D-112). A block without lines of its own starts
/// with its first child.
fn block_to_markdown(block: &Block, emoji: &Emoji, tier: u8) -> String {
    if hazards::is_list(block) {
        return list_to_markdown(block, emoji, tier, "");
    }
    let mut out = own_lines(block, emoji, tier);
    for child in followers(block) {
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&block_to_markdown(&child, emoji, tier));
    }
    out
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
    for child in followers(block) {
        if out.len() > start {
            out.push('\n');
        }
        indented(&child, emoji, tier, indent, false, out);
    }
}

/// The children written after the lines of a block: a quote writes its children itself, the
/// children of a table are its rows.
fn followers(block: &Block) -> Vec<Cow<'_, Block>> {
    match block.block_type.as_str() {
        "blockquote" | "callout" | "table" => vec![],
        _ => hazards::children(shown(block)),
    }
}

/// The lines a block writes itself, each with its line ending; "" for a block without any.
fn own_lines(block: &Block, emoji: &Emoji, tier: u8) -> String {
    let options = |kind| Options {
        kind,
        tier,
        continuation: false,
        newline: "\n",
        emoji,
    };
    // a heading is one line: its line breaks are `<br>`, as the TS writer writes them; the text
    // of a callout continues the paragraph its marker line starts; a line of a quote's text
    // starts with `> `, written after each line break (a line ending of verbatim source keeps
    // the prefix it was read with, as in the TS writer)
    let quote = matches!(block.block_type.as_str(), "blockquote" | "callout");
    let content = content_to_markdown(
        &block.content,
        &Options {
            continuation: block.block_type == "callout",
            newline: if quote { "\n> " } else { "\n" },
            ..options(if block.block_type == "heading" {
                Kind::Heading
            } else {
                Kind::Block
            })
        },
    );
    // a line of text, or nothing for a block without text
    let line = |text: String| if text.is_empty() { text } else { text + "\n" };
    let attr = |name: &str| match block.attrs.get(name) {
        Some(AttrValue::String(value)) => value.as_str(),
        _ => "",
    };
    match block.block_type.as_str() {
        "heading" => {
            let level = match block.attrs.get("level") {
                Some(AttrValue::Number(n)) => *n as usize,
                _ => 1,
            }
            .clamp(1, 6);
            let marks = "#".repeat(level);
            // a heading without text is its marks alone, as the TS writer writes it
            if content.is_empty() {
                format!("{marks}\n")
            } else {
                format!("{marks} {content}\n")
            }
        }
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
            // an empty block is its two fences, as the TS writer writes it
            if raw.is_empty() {
                format!("{fence}{info}\n{fence}\n")
            } else {
                format!("{fence}{info}\n{raw}\n{fence}\n")
            }
        }
        "blockquote" => {
            let head = if content.is_empty() {
                ">".to_owned()
            } else {
                format!("> {content}")
            };
            quote_children(head, block, emoji, tier)
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
                head.push_str("\n> ");
                head.push_str(&content);
            }
            quote_children(head, block, emoji, tier)
        }
        "divider" => "---\n".into(),
        "image" => format!(
            "![{}](<{}>{})\n",
            escapes::typed(attr("alt")),
            destination(attr("src")),
            title_suffix(attr("caption"))
        ),
        "file" | "embed" => format!("{}\n", link_line(block)),
        "math" => format!("{}\n", math(&crate::plaintext::block_text(block))),
        "markdownRaw" => line(crate::plaintext::block_text(block)),
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
                // a cell's text keeps its blanks (`&#32;`, D-97); blocks inside a cell, which
                // the TS writer leaves out, follow it on the same line
                let cells = row
                    .children
                    .iter()
                    .map(|cell| {
                        let nested = shown(cell)
                            .map(|child| block_to_markdown(child, emoji, tier))
                            .collect::<String>();
                        format!(
                            "{}{}",
                            content_to_markdown(&cell.content, &options(Kind::Cell)),
                            nested.trim().replace('|', "\\|").replace('\n', "<br>")
                        )
                    })
                    .collect::<Vec<_>>();
                result.push_str(&format!("| {} |\n", cells.join(" | ")));
                if index == 0 {
                    result.push_str(&delimiters(block, cells.len()));
                }
            }
            result
        }
        // a paragraph, an item outside a list, a toggle, columns and other blocks of text
        _ => line(content),
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
fn quote_children(mut quote: String, block: &Block, emoji: &Emoji, tier: u8) -> String {
    for child in hazards::children(shown(block)) {
        quote.push_str("\n>\n");
        quote.push_str(&quoted(
            block_to_markdown(&child, emoji, tier).trim_end_matches('\n'),
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
