use gotipe_core::Document;

use crate::ConvertError;

pub fn to_json(doc: &Document) -> String {
    serde_json::to_string_pretty(doc).unwrap_or_else(|_| "{}".into())
}

pub fn from_json(json_str: &str) -> Result<Document, ConvertError> {
    serde_json::from_str(json_str).map_err(|e| ConvertError::ParseError(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::{Block, BlockContent, BlockId, TextSpan};
    use std::collections::HashMap;

    #[test]
    fn test_json_roundtrip() {
        let doc = Document {
            blocks: vec![Block {
                id: BlockId("b1".into()),
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

        let json = to_json(&doc);
        let restored = from_json(&json).unwrap();
        assert_eq!(restored.blocks.len(), 1);
        assert_eq!(restored.blocks[0].text_length(), 11);
    }
}
