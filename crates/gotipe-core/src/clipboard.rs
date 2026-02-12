use serde::{Deserialize, Serialize};

use gotipe_schema::{Block, BlockContent, BlockId, Document, TextSpan};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardData {
    pub plain_text: String,
    pub html: Option<String>,
    pub internal_json: Option<String>,
}

/// Parse pasted plain text into a Document with paragraph blocks
pub fn parse_paste_plain(text: &str) -> Document {
    let blocks: Vec<Block> = text
        .split('\n')
        .filter(|line| !line.is_empty())
        .map(|line| Block {
            id: BlockId::new(),
            block_type: "paragraph".into(),
            attrs: std::collections::HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: line.to_string(),
                marks: vec![],
            }]),
            children: vec![],
        })
        .collect();

    Document { blocks, version: 0 }
}

/// Serialize a block to plain text
pub fn block_to_plain_text(block: &Block) -> String {
    match &block.content {
        BlockContent::RichText(spans) => spans.iter().map(|s| s.text.as_str()).collect(),
        BlockContent::Raw(s) => s.clone(),
        BlockContent::Empty => String::new(),
    }
}

/// Serialize selected blocks to plain text
pub fn blocks_to_plain_text(blocks: &[Block]) -> String {
    blocks
        .iter()
        .map(block_to_plain_text)
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_paste_plain_single_line() {
        let doc = parse_paste_plain("Hello World");
        assert_eq!(doc.blocks.len(), 1);
        assert_eq!(doc.blocks[0].text_length(), 11);
    }

    #[test]
    fn test_parse_paste_plain_multiple_lines() {
        let doc = parse_paste_plain("Line 1\nLine 2\nLine 3");
        assert_eq!(doc.blocks.len(), 3);
    }

    #[test]
    fn test_parse_paste_plain_empty_lines_filtered() {
        let doc = parse_paste_plain("Line 1\n\nLine 3");
        assert_eq!(doc.blocks.len(), 2);
    }

    #[test]
    fn test_block_to_plain_text() {
        let block = Block {
            id: BlockId::new(),
            block_type: "paragraph".into(),
            attrs: std::collections::HashMap::new(),
            content: BlockContent::RichText(vec![
                TextSpan {
                    text: "Hello ".into(),
                    marks: vec![],
                },
                TextSpan {
                    text: "World".into(),
                    marks: vec![],
                },
            ]),
            children: vec![],
        };
        assert_eq!(block_to_plain_text(&block), "Hello World");
    }

    #[test]
    fn test_clipboard_data_roundtrip() {
        let data = ClipboardData {
            plain_text: "Hello".into(),
            html: Some("<p>Hello</p>".into()),
            internal_json: None,
        };
        let json = serde_json::to_string(&data).unwrap();
        let restored: ClipboardData = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.plain_text, "Hello");
    }
}
