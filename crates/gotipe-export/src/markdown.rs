use gotipe_core::{AttrValue, Block, BlockContent, Document, Mark, TextSpan};

/// Convert a Document to Markdown
pub fn to_markdown(doc: &Document) -> String {
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
    match block.block_type.as_str() {
        "paragraph" => {
            let content = content_to_markdown(&block.content);
            format!("{content}\n")
        }
        "heading" => {
            let level = match block.attrs.get("level") {
                Some(AttrValue::Number(n)) => *n as usize,
                _ => 1,
            };
            let hashes = "#".repeat(level.clamp(1, 6));
            let content = content_to_markdown(&block.content);
            format!("{hashes} {content}\n")
        }
        "bulletList" => {
            let mut items = String::new();
            for child in &block.children {
                let content = content_to_markdown(&child.content);
                items.push_str(&format!("- {content}\n"));
            }
            items
        }
        "orderedList" => {
            let start = match block.attrs.get("start") {
                Some(AttrValue::Number(n)) => *n as usize,
                _ => 1,
            };
            let mut items = String::new();
            for (i, child) in block.children.iter().enumerate() {
                let num = start + i;
                let content = content_to_markdown(&child.content);
                items.push_str(&format!("{num}. {content}\n"));
            }
            items
        }
        "codeBlock" => {
            let lang = match block.attrs.get("language") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "",
            };
            let content = match &block.content {
                BlockContent::Raw(s) => s.clone(),
                _ => String::new(),
            };
            format!("```{lang}\n{content}\n```\n")
        }
        "blockquote" => {
            let content = content_to_markdown(&block.content);
            let lines: Vec<String> = content.lines().map(|l| format!("> {l}")).collect();
            format!("{}\n", lines.join("\n"))
        }
        "divider" => "---\n".into(),
        "image" => {
            let src = match block.attrs.get("src") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "",
            };
            let alt = match block.attrs.get("alt") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "",
            };
            format!("![{alt}]({src})\n")
        }
        "math" => {
            let content = match &block.content {
                BlockContent::Raw(s) => s.clone(),
                _ => String::new(),
            };
            format!("$$\n{content}\n$$\n")
        }
        _ => {
            let content = content_to_markdown(&block.content);
            format!("{content}\n")
        }
    }
}

fn content_to_markdown(content: &BlockContent) -> String {
    match content {
        BlockContent::RichText(spans) => spans_to_markdown(spans),
        BlockContent::Raw(s) => s.clone(),
        BlockContent::Empty => String::new(),
    }
}

fn spans_to_markdown(spans: &[TextSpan]) -> String {
    let mut md = String::new();
    for span in spans {
        let mut text = span.text.clone();
        for mark in &span.marks {
            text = wrap_mark_md(&text, mark);
        }
        md.push_str(&text);
    }
    md
}

fn wrap_mark_md(text: &str, mark: &Mark) -> String {
    match mark.mark_type.as_str() {
        "bold" => format!("**{text}**"),
        "italic" => format!("*{text}*"),
        "strikethrough" => format!("~~{text}~~"),
        "code" => format!("`{text}`"),
        "link" => {
            let href = match mark.attrs.get("href") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "#",
            };
            format!("[{text}]({href})")
        }
        _ => text.to_string(),
    }
}

/// Parse Markdown to Document (using comrak for CommonMark + GFM)
pub fn from_markdown(
    md: &str,
    _schema: &gotipe_core::Schema,
) -> Result<Document, crate::ConvertError> {
    use comrak::{parse_document, Arena, Options};

    let arena = Arena::new();
    let mut options = Options::default();
    options.extension.strikethrough = true;
    options.extension.table = true;

    let root = parse_document(&arena, md, &options);
    let mut blocks = Vec::new();

    for child in root.children() {
        if let Some(block) = node_to_block(child) {
            blocks.push(block);
        }
    }

    Ok(Document { blocks, version: 0 })
}

fn node_to_block<'a>(
    node: &'a comrak::arena_tree::Node<'a, std::cell::RefCell<comrak::nodes::Ast>>,
) -> Option<Block> {
    use comrak::nodes::NodeValue;
    use gotipe_core::{Block, BlockId};

    let ast = node.data.borrow();
    match &ast.value {
        NodeValue::Paragraph => {
            let text = collect_text(node);
            Some(Block {
                id: BlockId::new(),
                block_type: "paragraph".into(),
                attrs: std::collections::HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text,
                    marks: vec![],
                }]),
                children: vec![],
            })
        }
        NodeValue::Heading(heading) => {
            let text = collect_text(node);
            Some(Block {
                id: BlockId::new(),
                block_type: "heading".into(),
                attrs: std::collections::HashMap::from([(
                    "level".into(),
                    AttrValue::Number(heading.level as f64),
                )]),
                content: BlockContent::RichText(vec![TextSpan {
                    text,
                    marks: vec![],
                }]),
                children: vec![],
            })
        }
        NodeValue::CodeBlock(code) => Some(Block {
            id: BlockId::new(),
            block_type: "codeBlock".into(),
            attrs: std::collections::HashMap::from([(
                "language".into(),
                AttrValue::String(code.info.clone()),
            )]),
            content: BlockContent::Raw(code.literal.clone()),
            children: vec![],
        }),
        NodeValue::ThematicBreak => Some(Block {
            id: BlockId::new(),
            block_type: "divider".into(),
            attrs: std::collections::HashMap::new(),
            content: BlockContent::Empty,
            children: vec![],
        }),
        NodeValue::BlockQuote => {
            let text = collect_text(node);
            Some(Block {
                id: BlockId::new(),
                block_type: "blockquote".into(),
                attrs: std::collections::HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text,
                    marks: vec![],
                }]),
                children: vec![],
            })
        }
        _ => None,
    }
}

fn collect_text<'a>(
    node: &'a comrak::arena_tree::Node<'a, std::cell::RefCell<comrak::nodes::Ast>>,
) -> String {
    use comrak::nodes::NodeValue;
    let mut text = String::new();
    for child in node.children() {
        let ast = child.data.borrow();
        match &ast.value {
            NodeValue::Text(t) => text.push_str(t),
            NodeValue::SoftBreak | NodeValue::LineBreak => text.push(' '),
            NodeValue::Code(c) => text.push_str(&c.literal),
            _ => text.push_str(&collect_text(child)),
        }
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::{Block, BlockContent, BlockId, TextSpan};
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
