use gotipe_core::{Block, BlockContent, Document};

pub fn to_plaintext(doc: &Document) -> String {
    doc.blocks
        .iter()
        .map(|block| block_to_plain(block, 0))
        .collect::<Vec<_>>()
        .join("\n")
}

fn block_to_plain(block: &Block, indent: usize) -> String {
    let prefix = "  ".repeat(indent);
    let text = match &block.content {
        BlockContent::RichText(spans) => spans.iter().map(|s| s.text.as_str()).collect::<String>(),
        BlockContent::Raw(s) => s.clone(),
        BlockContent::Empty => String::new(),
    };

    let mut result = format!("{prefix}{text}");

    for child in &block.children {
        result.push('\n');
        result.push_str(&block_to_plain(child, indent + 1));
    }

    result
}

pub(crate) fn block_text(block: &Block) -> String {
    match &block.content {
        BlockContent::RichText(spans) => spans.iter().map(|span| span.text.as_str()).collect(),
        BlockContent::Raw(text) => text.clone(),
        BlockContent::Empty => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::{BlockId, TextSpan};
    use std::collections::HashMap;

    #[test]
    fn test_plaintext_simple() {
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
        assert_eq!(to_plaintext(&doc), "Hello World");
    }

    #[test]
    fn test_plaintext_multiple_blocks() {
        let doc = Document {
            blocks: vec![
                Block {
                    id: BlockId::new(),
                    block_type: "paragraph".into(),
                    attrs: HashMap::new(),
                    content: BlockContent::RichText(vec![TextSpan {
                        text: "Line 1".into(),
                        marks: vec![],
                    }]),
                    children: vec![],
                },
                Block {
                    id: BlockId::new(),
                    block_type: "paragraph".into(),
                    attrs: HashMap::new(),
                    content: BlockContent::RichText(vec![TextSpan {
                        text: "Line 2".into(),
                        marks: vec![],
                    }]),
                    children: vec![],
                },
            ],
            version: 0,
        };
        assert_eq!(to_plaintext(&doc), "Line 1\nLine 2");
    }
}
