use gotipe_schema::BlockId;
use serde::{Deserialize, Serialize};

use crate::transaction::Step;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Selection {
    Cursor {
        block_id: BlockId,
        offset: usize,
    },
    Text {
        block_id: BlockId,
        from: usize,
        to: usize,
    },
    Block {
        block_id: BlockId,
    },
    Multi {
        block_ids: Vec<BlockId>,
    },
}

impl Selection {
    pub fn cursor(block_id: BlockId, offset: usize) -> Self {
        Selection::Cursor { block_id, offset }
    }

    pub fn text(block_id: BlockId, from: usize, to: usize) -> Self {
        Selection::Text { block_id, from, to }
    }

    pub fn block_id(&self) -> &BlockId {
        match self {
            Selection::Cursor { block_id, .. } => block_id,
            Selection::Text { block_id, .. } => block_id,
            Selection::Block { block_id } => block_id,
            Selection::Multi { block_ids } => &block_ids[0],
        }
    }

    pub fn as_text(&self) -> Option<(&BlockId, usize, usize)> {
        match self {
            Selection::Text { block_id, from, to } => Some((block_id, *from, *to)),
            _ => None,
        }
    }

    pub fn as_cursor(&self) -> Option<(&BlockId, usize)> {
        match self {
            Selection::Cursor { block_id, offset } => Some((block_id, *offset)),
            _ => None,
        }
    }

    /// Map selection through a set of steps, adjusting offsets as needed
    pub fn map_through(&self, steps: &[Step]) -> Selection {
        let mut result = self.clone();
        for step in steps {
            result = result.map_through_step(step);
        }
        result
    }

    fn map_through_step(&self, step: &Step) -> Selection {
        match (self, step) {
            (
                Selection::Cursor { block_id, offset },
                Step::InsertText {
                    block_id: step_block_id,
                    offset: insert_offset,
                    text,
                    ..
                },
            ) if block_id == step_block_id && *insert_offset <= *offset => Selection::Cursor {
                block_id: block_id.clone(),
                offset: offset + text.len(),
            },
            (
                Selection::Cursor { block_id, offset },
                Step::DeleteText {
                    block_id: step_block_id,
                    from,
                    to,
                },
            ) if block_id == step_block_id => {
                let deleted_len = to - from;
                let new_offset = if *offset <= *from {
                    *offset
                } else if *offset >= *to {
                    offset - deleted_len
                } else {
                    *from
                };
                Selection::Cursor {
                    block_id: block_id.clone(),
                    offset: new_offset,
                }
            }
            (
                Selection::Text { block_id, from, to },
                Step::InsertText {
                    block_id: step_block_id,
                    offset: insert_offset,
                    text,
                    ..
                },
            ) if block_id == step_block_id => {
                let len = text.len();
                let new_from = if *insert_offset <= *from {
                    from + len
                } else {
                    *from
                };
                let new_to = if *insert_offset <= *to { to + len } else { *to };
                Selection::Text {
                    block_id: block_id.clone(),
                    from: new_from,
                    to: new_to,
                }
            }
            (
                Selection::Text { block_id, from, to },
                Step::DeleteText {
                    block_id: step_block_id,
                    from: del_from,
                    to: del_to,
                },
            ) if block_id == step_block_id => {
                let deleted_len = del_to - del_from;
                let map_offset = |offset: usize| -> usize {
                    if offset <= *del_from {
                        offset
                    } else if offset >= *del_to {
                        offset - deleted_len
                    } else {
                        *del_from
                    }
                };
                Selection::Text {
                    block_id: block_id.clone(),
                    from: map_offset(*from),
                    to: map_offset(*to),
                }
            }
            // For steps that delete the block this selection references, collapse to a cursor
            (Selection::Cursor { block_id, .. }, Step::DeleteBlock { block_id: del_id })
                if block_id == del_id =>
            {
                Selection::Cursor {
                    block_id: BlockId::new(),
                    offset: 0,
                }
            }
            // Default: no change
            _ => self.clone(),
        }
    }
}

impl Default for Selection {
    fn default() -> Self {
        Selection::Cursor {
            block_id: BlockId("default".into()),
            offset: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_through_insert_text_adjusts_cursor() {
        let sel = Selection::Cursor {
            block_id: BlockId("b1".into()),
            offset: 5,
        };
        let step = Step::InsertText {
            block_id: BlockId("b1".into()),
            offset: 2,
            text: "abc".into(),
            marks: vec![],
        };
        let mapped = sel.map_through(&[step]);
        if let Selection::Cursor { offset, .. } = mapped {
            assert_eq!(offset, 8); // 5 + 3 inserted chars
        } else {
            panic!("Expected Cursor");
        }
    }

    #[test]
    fn test_map_through_delete_text_adjusts_cursor() {
        let sel = Selection::Cursor {
            block_id: BlockId("b1".into()),
            offset: 10,
        };
        let step = Step::DeleteText {
            block_id: BlockId("b1".into()),
            from: 3,
            to: 6,
        };
        let mapped = sel.map_through(&[step]);
        if let Selection::Cursor { offset, .. } = mapped {
            assert_eq!(offset, 7); // 10 - 3 deleted chars
        } else {
            panic!("Expected Cursor");
        }
    }

    #[test]
    fn test_as_text_returns_some_for_text_selection() {
        let sel = Selection::Text {
            block_id: BlockId("b1".into()),
            from: 2,
            to: 5,
        };
        let (_, from, to) = sel.as_text().unwrap();
        assert_eq!(from, 2);
        assert_eq!(to, 5);
    }

    #[test]
    fn test_as_text_returns_none_for_cursor() {
        let sel = Selection::Cursor {
            block_id: BlockId("b1".into()),
            offset: 0,
        };
        assert!(sel.as_text().is_none());
    }
}
