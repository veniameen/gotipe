use std::collections::HashMap;

use crate::document::{Block, BlockContent, BlockId, Document};
use crate::mark_spec::MarkSpec;
use crate::node_spec::{ContentRule, MarksRule, NodeSpec};

/// Schema — набор правил для валидации документа
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Schema {
    pub nodes: HashMap<String, NodeSpec>,
    pub marks: HashMap<String, MarkSpec>,
}

impl Schema {
    pub fn new() -> Self {
        Schema {
            nodes: HashMap::new(),
            marks: HashMap::new(),
        }
    }

    /// Validate entire document against schema
    pub fn validate(&self, doc: &Document) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();

        for block in doc.flatten() {
            self.validate_block(block, &mut errors);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    fn validate_block(&self, block: &Block, errors: &mut Vec<ValidationError>) {
        // 1. Check block type exists in schema
        let spec = match self.nodes.get(&block.block_type) {
            Some(s) => s,
            None => {
                errors.push(ValidationError::UnknownBlockType {
                    block_id: block.id.clone(),
                    block_type: block.block_type.clone(),
                });
                return;
            }
        };

        // 2. Validate attributes — check required attrs present
        for (key, attr_spec) in &spec.attrs {
            if attr_spec.required && !block.attrs.contains_key(key) {
                errors.push(ValidationError::MissingAttribute {
                    block_id: block.id.clone(),
                    attr: key.clone(),
                });
            }
        }

        // Check for unknown attributes
        for key in block.attrs.keys() {
            if !spec.attrs.contains_key(key) {
                errors.push(ValidationError::UnknownAttribute {
                    block_id: block.id.clone(),
                    attr: key.clone(),
                });
            }
        }

        // 3. Validate content type
        match (&spec.content, &block.content) {
            (ContentRule::RichText, BlockContent::RichText(_)) => {}
            (ContentRule::RawText, BlockContent::Raw(_)) => {}
            (ContentRule::Empty, BlockContent::Empty) => {}
            _ => {
                errors.push(ValidationError::InvalidContent {
                    block_id: block.id.clone(),
                    expected: format!("{:?}", spec.content),
                });
            }
        }

        // 4. Validate marks
        if let BlockContent::RichText(spans) = &block.content {
            for span in spans {
                for mark in &span.marks {
                    // Check mark exists in schema
                    if !self.marks.contains_key(&mark.mark_type) {
                        errors.push(ValidationError::UnknownMark {
                            block_id: block.id.clone(),
                            mark_type: mark.mark_type.clone(),
                        });
                    }
                    // Check mark is allowed on this block type
                    match &spec.marks_allowed {
                        MarksRule::None => {
                            errors.push(ValidationError::MarkNotAllowed {
                                block_id: block.id.clone(),
                                mark_type: mark.mark_type.clone(),
                            });
                        }
                        MarksRule::Only(allowed) if !allowed.contains(&mark.mark_type) => {
                            errors.push(ValidationError::MarkNotAllowed {
                                block_id: block.id.clone(),
                                mark_type: mark.mark_type.clone(),
                            });
                        }
                        _ => {}
                    }
                }
            }
        }

        // 5. Validate children
        if !block.children.is_empty() && !spec.allows_children {
            errors.push(ValidationError::ChildrenNotAllowed {
                block_id: block.id.clone(),
            });
        }

        if spec.leaf && !block.children.is_empty() {
            errors.push(ValidationError::ChildrenNotAllowed {
                block_id: block.id.clone(),
            });
        }

        if let Some(child_types) = &spec.child_types {
            for child in &block.children {
                if !child_types.contains(&child.block_type) {
                    errors.push(ValidationError::InvalidChildType {
                        parent_id: block.id.clone(),
                        child_id: child.id.clone(),
                        child_type: child.block_type.clone(),
                    });
                }
            }
        }
    }
}

impl Default for Schema {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum ValidationError {
    #[error("Unknown block type '{block_type}' in block {block_id}")]
    UnknownBlockType {
        block_id: BlockId,
        block_type: String,
    },

    #[error("Missing required attribute '{attr}' in block {block_id}")]
    MissingAttribute { block_id: BlockId, attr: String },

    #[error("Unknown attribute '{attr}' in block {block_id}")]
    UnknownAttribute { block_id: BlockId, attr: String },

    #[error("Invalid content in block {block_id}, expected {expected}")]
    InvalidContent { block_id: BlockId, expected: String },

    #[error("Unknown mark '{mark_type}' in block {block_id}")]
    UnknownMark {
        block_id: BlockId,
        mark_type: String,
    },

    #[error("Mark '{mark_type}' not allowed in block {block_id}")]
    MarkNotAllowed {
        block_id: BlockId,
        mark_type: String,
    },

    #[error("Children not allowed in block {block_id}")]
    ChildrenNotAllowed { block_id: BlockId },

    #[error("Invalid child type '{child_type}' in block {parent_id}")]
    InvalidChildType {
        parent_id: BlockId,
        child_id: BlockId,
        child_type: String,
    },

    #[error("Block not found: {block_id}")]
    BlockNotFound { block_id: BlockId },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::defaults;
    use crate::document::{Block, BlockContent, Mark, TextSpan};

    fn default_schema() -> Schema {
        defaults::default_block_editor()
    }

    fn make_paragraph(text: &str) -> Block {
        Block {
            id: BlockId::new(),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: text.into(),
                marks: vec![],
            }]),
            children: vec![],
        }
    }

    #[test]
    fn test_default_schema_has_all_blocks() {
        let schema = default_schema();
        assert_eq!(schema.nodes.len(), 20);
        assert_eq!(schema.marks.len(), 9);
        assert!(schema.nodes.contains_key("paragraph"));
        assert!(schema.nodes.contains_key("heading"));
        assert!(schema.nodes.contains_key("table"));
        assert!(schema.marks.contains_key("bold"));
        assert!(schema.marks.contains_key("link"));
    }

    #[test]
    fn test_validate_valid_document() {
        let schema = default_schema();
        let doc = Document {
            blocks: vec![make_paragraph("Hello, world!")],
            version: 0,
        };
        assert!(schema.validate(&doc).is_ok());
    }

    #[test]
    fn test_validate_unknown_block_type() {
        let schema = default_schema();
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "unknown_type".into(),
                attrs: HashMap::new(),
                content: BlockContent::Empty,
                children: vec![],
            }],
            version: 0,
        };
        let errors = schema.validate(&doc).unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::UnknownBlockType { .. })));
    }

    #[test]
    fn test_validate_missing_required_attr() {
        let schema = default_schema();
        // heading requires 'level' attribute
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "heading".into(),
                attrs: HashMap::new(), // missing 'level'
                content: BlockContent::RichText(vec![]),
                children: vec![],
            }],
            version: 0,
        };
        let errors = schema.validate(&doc).unwrap_err();
        assert!(errors.iter().any(
            |e| matches!(e, ValidationError::MissingAttribute { attr, .. } if attr == "level")
        ));
    }

    #[test]
    fn test_validate_marks_not_allowed() {
        let schema = default_schema();
        // codeBlock has marks_allowed = None
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "codeBlock".into(),
                attrs: HashMap::from([(
                    "language".into(),
                    crate::AttrValue::String("rust".into()),
                )]),
                content: BlockContent::Raw("fn main() {}".into()),
                children: vec![],
            }],
            version: 0,
        };
        // Valid — codeBlock with Raw content, no marks
        assert!(schema.validate(&doc).is_ok());
    }

    #[test]
    fn test_validate_children_not_allowed() {
        let schema = default_schema();
        // paragraph does not allow children
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![]),
                children: vec![make_paragraph("child")],
            }],
            version: 0,
        };
        let errors = schema.validate(&doc).unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::ChildrenNotAllowed { .. })));
    }

    #[test]
    fn test_validate_invalid_child_type() {
        let schema = default_schema();
        // bulletList only allows listItem children
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "bulletList".into(),
                attrs: HashMap::new(),
                content: BlockContent::Empty,
                children: vec![make_paragraph("wrong child type")],
            }],
            version: 0,
        };
        let errors = schema.validate(&doc).unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::InvalidChildType { .. })));
    }

    #[test]
    fn test_validate_valid_document_with_marks() {
        let schema = default_schema();
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "bold text".into(),
                    marks: vec![Mark::new("bold")],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        assert!(schema.validate(&doc).is_ok());
    }

    #[test]
    fn test_validate_unknown_mark() {
        let schema = default_schema();
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "text".into(),
                    marks: vec![Mark::new("nonexistent_mark")],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        let errors = schema.validate(&doc).unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::UnknownMark { .. })));
    }

    #[test]
    fn test_validate_unknown_attribute() {
        let schema = default_schema();
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "paragraph".into(),
                attrs: HashMap::from([(
                    "nonexistent".into(),
                    crate::AttrValue::String("value".into()),
                )]),
                content: BlockContent::RichText(vec![]),
                children: vec![],
            }],
            version: 0,
        };
        let errors = schema.validate(&doc).unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::UnknownAttribute { .. })));
    }
}
