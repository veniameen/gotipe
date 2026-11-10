use crate::ops::OpId;
use serde::{Deserialize, Serialize};

const BASE: u32 = 65536;

/// Dense lexicographic positions. The operation ID distinguishes concurrent inserts.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct PositionPart {
    pub digit: u32,
    pub id: OpId,
}
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Position(pub Vec<PositionPart>);

impl Position {
    pub(crate) fn initial(index: usize) -> Self {
        Self(vec![PositionPart {
            digit: index as u32 + 1,
            id: OpId::zero("@base"),
        }])
    }

    pub(crate) fn in_run(&self, index: usize, id: &OpId) -> Self {
        let mut parts = self.0.clone();
        parts.push(PositionPart {
            digit: index as u32,
            id: id.clone(),
        });
        Self(parts)
    }

    pub(crate) fn between(left: Option<&Self>, right: Option<&Self>, id: &OpId) -> Self {
        let mut result = Vec::new();
        let mut depth = 0;
        let mut right_parts = right.map(|p| p.0.as_slice());
        loop {
            let low = left
                .and_then(|p| p.0.get(depth))
                .cloned()
                .unwrap_or(PositionPart {
                    digit: 0,
                    id: OpId::zero(""),
                });
            let high = right_parts
                .and_then(|p| p.get(depth))
                .cloned()
                .unwrap_or(PositionPart {
                    digit: BASE.max(low.digit.saturating_add(2)),
                    id: OpId::zero(""),
                });
            if u64::from(high.digit) > u64::from(low.digit) + 1 {
                result.push(PositionPart {
                    digit: low.digit + (high.digit - low.digit) / 2,
                    id: id.clone(),
                });
                return Self(result);
            }
            if low != high {
                right_parts = None;
            }
            result.push(low);
            depth += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inserts_between_concurrent_positions_and_dense_neighbors() {
        let a = Position::between(None, None, &OpId::new(1, "a"));
        let b = Position::between(None, None, &OpId::new(1, "b"));
        let mut left = a.clone();
        for n in 2..100 {
            let next = Position::between(Some(&left), Some(&b), &OpId::new(n, "c"));
            assert!(left < next && next < b);
            left = next;
        }
        let head = Position::between(None, Some(&a), &OpId::new(1, "z"));
        assert!(head < a);
    }
}
