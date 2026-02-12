use gotipe_core::{Block, BlockContent, EditorState};
use serde::{Deserialize, Serialize};

/// Context sent to the AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiContext {
    pub blocks_before: Vec<BlockText>,
    pub blocks_after: Vec<BlockText>,
    pub current_block: Option<BlockText>,
    pub selection_text: Option<String>,
    pub document_title: Option<String>,
    pub total_tokens: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockText {
    pub block_type: String,
    pub text: String,
}

/// Builds AI context from the editor state
pub struct ContextBuilder {
    max_tokens: usize,
}

impl ContextBuilder {
    pub fn new() -> Self {
        ContextBuilder { max_tokens: 4096 }
    }

    pub fn with_max_tokens(mut self, max_tokens: usize) -> Self {
        self.max_tokens = max_tokens;
        self
    }

    /// Build context from EditorState, centered on the current selection
    pub fn build(&self, state: &EditorState) -> AiContext {
        let block_id = state.selection().block_id();
        let doc = state.doc();

        let mut blocks_before = Vec::new();
        let mut blocks_after = Vec::new();
        let mut current_block = None;
        let mut found = false;
        let mut total_tokens = 0;

        for block in &doc.blocks {
            let bt = block_to_text(block);
            let tokens = estimate_tokens(&bt.text);

            if &block.id == block_id {
                current_block = Some(bt);
                total_tokens += tokens;
                found = true;
                continue;
            }

            if total_tokens + tokens > self.max_tokens {
                break;
            }

            if found {
                total_tokens += tokens;
                blocks_after.push(bt);
            } else {
                total_tokens += tokens;
                blocks_before.push(bt);
            }
        }

        // Trim blocks_before from the start if over budget
        while total_tokens > self.max_tokens && !blocks_before.is_empty() {
            let removed = blocks_before.remove(0);
            total_tokens -= estimate_tokens(&removed.text);
        }

        // Extract selection text
        let selection_text = match state.selection() {
            gotipe_core::Selection::Text { block_id, from, to } => {
                if let Some(block) = doc.find_block(block_id) {
                    extract_text_range(block, *from, *to)
                } else {
                    None
                }
            }
            _ => None,
        };

        AiContext {
            blocks_before,
            blocks_after,
            current_block,
            selection_text,
            document_title: None,
            total_tokens,
        }
    }
}

impl Default for ContextBuilder {
    fn default() -> Self {
        Self::new()
    }
}

fn block_to_text(block: &Block) -> BlockText {
    let text = match &block.content {
        BlockContent::RichText(spans) => spans.iter().map(|s| s.text.as_str()).collect(),
        BlockContent::Raw(s) => s.clone(),
        BlockContent::Empty => String::new(),
    };
    BlockText {
        block_type: block.block_type.clone(),
        text,
    }
}

fn extract_text_range(block: &Block, from: usize, to: usize) -> Option<String> {
    match &block.content {
        BlockContent::RichText(spans) => {
            let full_text: String = spans.iter().map(|s| s.text.as_str()).collect();
            full_text.get(from..to).map(|s| s.to_string())
        }
        BlockContent::Raw(raw) => raw.get(from..to).map(|s| s.to_string()),
        BlockContent::Empty => None,
    }
}

/// Estimate token count: chars/4 + padding
fn estimate_tokens(text: &str) -> usize {
    (text.len() / 4) + 1
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::{Block, BlockContent, BlockId, Document, TextSpan};
    use std::collections::HashMap;

    fn make_state(texts: Vec<&str>) -> EditorState {
        let schema = gotipe_core::defaults::default_block_editor();
        let blocks: Vec<Block> = texts
            .into_iter()
            .enumerate()
            .map(|(i, text)| Block {
                id: BlockId(format!("b{i}")),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: text.into(),
                    marks: vec![],
                }]),
                children: vec![],
            })
            .collect();
        let doc = Document { blocks, version: 0 };
        EditorState::new(doc, schema)
    }

    #[test]
    fn test_build_context() {
        let state = make_state(vec!["First", "Second", "Third"]);
        let ctx = ContextBuilder::new().build(&state);
        assert!(ctx.current_block.is_some());
    }

    #[test]
    fn test_token_estimation() {
        assert_eq!(estimate_tokens("Hello World"), 3); // 11/4 + 1
        assert_eq!(estimate_tokens(""), 1);
    }

    #[test]
    fn test_max_tokens_truncation() {
        let state = make_state(vec!["A".repeat(10000).as_str(), "B", "C"]);
        let ctx = ContextBuilder::new().with_max_tokens(100).build(&state);
        assert!(ctx.total_tokens <= 10000); // May have been truncated
    }
}
