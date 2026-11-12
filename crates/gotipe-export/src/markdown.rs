use gotipe_core::{AttrValue, Block, BlockContent, Document, TextSpan};

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
    let mut md = String::new();
    for (i, block) in doc.blocks.iter().enumerate() {
        md.push_str(&block_to_markdown(block));
        if i < doc.blocks.len() - 1 {
            md.push('\n');
        }
    }
    md
}

fn block_to_markdown(block: &Block) -> String {
    let content = content_to_markdown(&block.content);
    let nested = block
        .children
        .iter()
        .map(block_to_markdown)
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
                    let text = content_to_markdown(&item.content);
                    let indent = " ".repeat(prefix.len());
                    let mut rendered =
                        format!("{prefix}{}\n", text.replace('\n', &format!("\n{indent}")));
                    for child in &item.children {
                        for line in block_to_markdown(child).lines() {
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
            let mut info = attr("language").replace(['\n', '\r', '`'], "");
            if !attr("meta").is_empty() {
                info.push(' ');
                info.push_str(&attr("meta").replace(['\n', '\r', '`'], ""));
            }
            format!("{fence}{info}\n{raw}\n{fence}\n{nested}")
        }
        "blockquote" => format!(
            "{}\n",
            format!("{content}\n{nested}")
                .trim_end()
                .lines()
                .map(|line| format!("> {line}"))
                .collect::<Vec<_>>()
                .join("\n")
        ),
        "callout" => {
            let kind = match attr("type") {
                "tip" | "success" => "TIP",
                "important" => "IMPORTANT",
                "warning" => "WARNING",
                "caution" | "error" | "danger" => "CAUTION",
                _ => "NOTE",
            };
            format!(
                "{}\n",
                format!("[!{kind}]\n{content}\n{nested}")
                    .trim_end()
                    .lines()
                    .map(|line| format!("> {line}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        }
        "divider" => "---\n".into(),
        "image" => format!(
            "![{}](<{}>{})\n{nested}",
            escape_text(attr("alt")),
            destination(attr("src")),
            title_suffix(attr("caption"))
        ),
        "file" | "embed" => format!(
            "[{}](<{}>)\n{nested}",
            escape_text(if attr("name").is_empty() {
                attr("url")
            } else {
                attr("name")
            }),
            destination(attr("url"))
        ),
        "math" => format!("$$\n{}\n$$\n{nested}", crate::plaintext::block_text(block)),
        "markdownRaw" => format!("{}\n{nested}", crate::plaintext::block_text(block)),
        "table" => {
            let mut result = String::new();
            for (index, row) in block.children.iter().enumerate() {
                let cells = row
                    .children
                    .iter()
                    .map(|cell| {
                        format!(
                            "{}{}",
                            content_to_markdown(&cell.content),
                            cell.children
                                .iter()
                                .map(block_to_markdown)
                                .collect::<String>()
                        )
                        .trim()
                        .replace('|', "\\|")
                        .replace('\n', "<br>")
                    })
                    .collect::<Vec<_>>();
                result.push_str(&format!("| {} |\n", cells.join(" | ")));
                if index == 0 {
                    let alignment = match block.attrs.get("align") {
                        Some(AttrValue::Array(values)) => values.as_slice(),
                        _ => &[],
                    };
                    let delimiters: Vec<_> = (0..cells.len())
                        .map(|column| match alignment.get(column) {
                            Some(AttrValue::String(value)) if value == "left" => ":---",
                            Some(AttrValue::String(value)) if value == "right" => "---:",
                            Some(AttrValue::String(value)) if value == "center" => ":---:",
                            _ => "---",
                        })
                        .collect();
                    result.push_str(&format!("| {} |\n", delimiters.join(" | ")))
                }
            }
            result
        }
        _ => format!("{content}\n{nested}"),
    }
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
fn content_to_markdown(content: &BlockContent) -> String {
    match content {
        BlockContent::RichText(spans) => spans_to_markdown(spans),
        BlockContent::Raw(raw) => raw.clone(),
        BlockContent::Empty => String::new(),
    }
}
fn spans_to_markdown(spans: &[TextSpan]) -> String {
    spans
        .iter()
        .map(|span| {
            let raw = span.marks.iter().any(|mark| mark.mark_type == "mdRaw");
            let mut text = if raw {
                span.text.clone()
            } else if span.marks.iter().any(|mark| mark.mark_type == "code") {
                let fence = code_fence(&span.text, 1);
                let padding = if span.text.starts_with('`')
                    || span.text.ends_with('`')
                    || span.text.starts_with(' ')
                        && span.text.ends_with(' ')
                        && span.text.chars().any(|c| c != ' ')
                {
                    " "
                } else {
                    ""
                };
                format!("{fence}{padding}{}{padding}{fence}", span.text)
            } else {
                escape_text(&span.text)
            };
            for mark in &span.marks {
                let (open, close) = match mark.mark_type.as_str() {
                    "bold" => ("**", "**"),
                    "italic" => ("*", "*"),
                    "strikethrough" => ("~~", "~~"),
                    "underline" => ("<u>", "</u>"),
                    "highlight" => ("<mark>", "</mark>"),
                    "superscript" => ("<sup>", "</sup>"),
                    "subscript" => ("<sub>", "</sub>"),
                    _ => ("", ""),
                };
                let colored;
                let (open, close) = if matches!(mark.mark_type.as_str(), "textColor" | "highlight") {
                    if let Some(AttrValue::String(color)) = mark.attrs.get("color").filter(|value| matches!(value, AttrValue::String(color) if crate::html::safe_color(color))) {
                        let (tag, property) = if mark.mark_type == "textColor" { ("span", "color") } else { ("mark", "background-color") };
                        colored = format!("<{tag} style=\"{property}:{color}\">");
                        (colored.as_str(), if tag == "span" { "</span>" } else { "</mark>" })
                    } else { (open, close) }
                } else { (open, close) };
                if !open.is_empty() {
                    let leading = text.len() - text.trim_start().len();
                    let end = text.trim_end().len();
                    if end > leading {
                        text = format!(
                            "{}{open}{}{close}{}",
                            &text[..leading],
                            &text[leading..end],
                            &text[end..]
                        )
                    }
                }
                if mark.mark_type == "link" {
                    if let Some(AttrValue::String(href)) = mark.attrs.get("href") {
                        let title = match mark.attrs.get("title") {
                            Some(AttrValue::String(title)) => title.as_str(),
                            _ => "",
                        };
                        text = format!("[{text}](<{}>{})", destination(href), title_suffix(title))
                    }
                }
            }
            text
        })
        .collect()
}

/// Parse supported Markdown into GoTipe blocks, retaining unknown syntax as raw content.
pub fn from_markdown(
    md: &str,
    _schema: &gotipe_core::Schema,
) -> Result<Document, crate::ConvertError> {
    Ok(crate::markdown_parse::parse(md))
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
