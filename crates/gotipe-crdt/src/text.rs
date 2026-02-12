use gotipe_core::Mark;
use serde::{Deserialize, Serialize};

use crate::ops::OpId;

/// A single character in the CRDT text (Fugue/RGA-based)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrdtChar {
    pub id: OpId,
    pub value: char,
    pub marks: Vec<Mark>,
    pub deleted: bool,
    pub left_origin: Option<OpId>,
    pub right_origin: Option<OpId>,
}

/// Rich text CRDT — Fugue/RGA-based with mark support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RichTextCrdt {
    chars: Vec<CrdtChar>,
    peer_id: String,
    lamport: u64,
}

impl RichTextCrdt {
    pub fn new(peer_id: &str) -> Self {
        RichTextCrdt {
            chars: Vec::new(),
            peer_id: peer_id.into(),
            lamport: 0,
        }
    }

    /// Insert a character at a visible position
    pub fn insert(&mut self, pos: usize, ch: char, marks: Vec<Mark>) -> OpId {
        self.lamport += 1;
        let id = OpId::new(self.lamport, &self.peer_id);

        let real_index = self.visible_to_real_index(pos);
        let left_origin = if real_index > 0 {
            Some(self.chars[real_index - 1].id.clone())
        } else {
            None
        };
        let right_origin = if real_index < self.chars.len() {
            Some(self.chars[real_index].id.clone())
        } else {
            None
        };

        let crdt_char = CrdtChar {
            id: id.clone(),
            value: ch,
            marks,
            deleted: false,
            left_origin,
            right_origin,
        };

        self.chars.insert(real_index, crdt_char);
        id
    }

    /// Delete the character at a visible position
    pub fn delete(&mut self, pos: usize) -> Option<OpId> {
        let real_index = self.visible_to_real_index(pos);
        if real_index < self.chars.len() && !self.chars[real_index].deleted {
            self.chars[real_index].deleted = true;
            self.lamport += 1;
            Some(self.chars[real_index].id.clone())
        } else {
            None
        }
    }

    /// Insert a remote character (conflict resolution via Fugue ordering)
    pub fn insert_remote(&mut self, crdt_char: CrdtChar) {
        self.lamport = self.lamport.max(crdt_char.id.lamport) + 1;

        // Find insertion position based on left/right origins (Fugue algorithm)
        let insert_pos = self.find_insert_position(&crdt_char);
        self.chars.insert(insert_pos, crdt_char);
    }

    /// Delete a remote character by its OpId
    pub fn delete_remote(&mut self, target_id: &OpId) {
        if let Some(ch) = self.chars.iter_mut().find(|c| &c.id == target_id) {
            ch.deleted = true;
        }
    }

    /// Add a mark to a visible range
    pub fn add_mark(&mut self, from: usize, to: usize, mark: Mark) {
        let mut visible_pos = 0;
        for ch in &mut self.chars {
            if ch.deleted {
                continue;
            }
            if visible_pos >= from
                && visible_pos < to
                && !ch.marks.iter().any(|m| m.mark_type == mark.mark_type)
            {
                ch.marks.push(mark.clone());
            }
            visible_pos += 1;
            if visible_pos >= to {
                break;
            }
        }
    }

    /// Remove a mark type from a visible range
    pub fn remove_mark(&mut self, from: usize, to: usize, mark_type: &str) {
        let mut visible_pos = 0;
        for ch in &mut self.chars {
            if ch.deleted {
                continue;
            }
            if visible_pos >= from && visible_pos < to {
                ch.marks.retain(|m| m.mark_type != mark_type);
            }
            visible_pos += 1;
            if visible_pos >= to {
                break;
            }
        }
    }

    /// Get the visible text as spans (grouped by marks)
    pub fn to_spans(&self) -> Vec<gotipe_core::TextSpan> {
        let mut spans: Vec<gotipe_core::TextSpan> = Vec::new();
        for ch in &self.chars {
            if ch.deleted {
                continue;
            }
            if let Some(last) = spans.last_mut() {
                if last.marks == ch.marks {
                    last.text.push(ch.value);
                    continue;
                }
            }
            spans.push(gotipe_core::TextSpan {
                text: ch.value.to_string(),
                marks: ch.marks.clone(),
            });
        }
        spans
    }

    /// Get visible length
    pub fn len(&self) -> usize {
        self.chars.iter().filter(|c| !c.deleted).count()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Convert visible position to real array index
    fn visible_to_real_index(&self, visible_pos: usize) -> usize {
        let mut visible = 0;
        for (i, ch) in self.chars.iter().enumerate() {
            if visible == visible_pos {
                return i;
            }
            if !ch.deleted {
                visible += 1;
            }
        }
        self.chars.len()
    }

    /// Find the correct insertion position for a remote character using Fugue ordering
    fn find_insert_position(&self, new_char: &CrdtChar) -> usize {
        // Find left origin position
        let left_pos = match &new_char.left_origin {
            Some(left_id) => self.chars.iter().position(|c| &c.id == left_id),
            None => None,
        };

        // Find right origin position
        let right_pos = match &new_char.right_origin {
            Some(right_id) => self.chars.iter().position(|c| &c.id == right_id),
            None => None,
        };

        let start = left_pos.map(|p| p + 1).unwrap_or(0);
        let end = right_pos.unwrap_or(self.chars.len());

        // Within the range [start, end), find the correct position
        // using Fugue conflict resolution: sort by OpId
        let mut pos = start;
        while pos < end {
            if self.chars[pos].id > new_char.id {
                break;
            }
            pos += 1;
        }

        pos
    }
}

impl std::fmt::Display for RichTextCrdt {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for ch in &self.chars {
            if !ch.deleted {
                write!(f, "{}", ch.value)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_and_read() {
        let mut text = RichTextCrdt::new("peer_a");
        text.insert(0, 'H', vec![]);
        text.insert(1, 'i', vec![]);
        assert_eq!(text.to_string(), "Hi");
        assert_eq!(text.len(), 2);
    }

    #[test]
    fn test_delete() {
        let mut text = RichTextCrdt::new("peer_a");
        text.insert(0, 'A', vec![]);
        text.insert(1, 'B', vec![]);
        text.insert(2, 'C', vec![]);
        text.delete(1); // delete 'B'
        assert_eq!(text.to_string(), "AC");
    }

    #[test]
    fn test_marks_preserved_after_delete() {
        let mut text = RichTextCrdt::new("peer_a");
        text.insert(0, 'A', vec![Mark::new("bold")]);
        text.insert(1, 'B', vec![]);
        text.insert(2, 'C', vec![Mark::new("bold")]);
        text.delete(1); // delete 'B'
        let spans = text.to_spans();
        // 'A' (bold) + 'C' (bold) should merge into one span
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].text, "AC");
    }

    #[test]
    fn test_add_mark_to_range() {
        let mut text = RichTextCrdt::new("peer_a");
        for ch in "Hello".chars() {
            let pos = text.len();
            text.insert(pos, ch, vec![]);
        }
        text.add_mark(0, 5, Mark::new("bold"));
        let spans = text.to_spans();
        assert_eq!(spans.len(), 1);
        assert!(spans[0].marks.iter().any(|m| m.mark_type == "bold"));
    }

    #[test]
    fn test_remove_mark_from_range() {
        let mut text = RichTextCrdt::new("peer_a");
        for ch in "Hello".chars() {
            let pos = text.len();
            text.insert(pos, ch, vec![Mark::new("bold")]);
        }
        text.remove_mark(0, 5, "bold");
        let spans = text.to_spans();
        assert!(spans.iter().all(|s| s.marks.is_empty()));
    }

    #[test]
    fn test_concurrent_inserts_converge() {
        // Simulate two peers inserting at the same position
        let mut text_a = RichTextCrdt::new("peer_a");
        let mut text_b = RichTextCrdt::new("peer_b");

        // Both start with "AC"
        text_a.insert(0, 'A', vec![]);
        text_a.insert(1, 'C', vec![]);

        // Copy to peer_b
        text_b.insert_remote(text_a.chars[0].clone());
        text_b.insert_remote(text_a.chars[1].clone());

        // peer_a inserts 'X' between A and C
        text_a.insert(1, 'X', vec![]);
        // peer_b inserts 'Y' between A and C
        text_b.insert(1, 'Y', vec![]);

        // Exchange the newly inserted characters (at index 1 in each array)
        text_a.insert_remote(text_b.chars[1].clone());
        text_b.insert_remote(text_a.chars[1].clone());

        // Both should converge to the same string
        assert_eq!(text_a.to_string(), text_b.to_string());
    }
}
