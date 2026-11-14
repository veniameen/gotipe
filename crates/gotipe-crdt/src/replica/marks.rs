//! Marks of one character in application order — the order of the local engine
//! (`gotipe-core::transform::marks`): a mark of a type already present is replaced
//! in place, any other is appended. Replay applies operations in identity order,
//! so every replica derives the same list from the same operation set.
use gotipe_core::Mark;

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct MarkList(Vec<(String, Mark)>);

impl MarkList {
    pub fn from_marks(marks: &[Mark]) -> Self {
        let mut list = Self::default();
        for mark in marks {
            list.set(&mark.mark_type, Some(mark));
        }
        list
    }
    /// `SetMark`: `None` removes the type, a mark replaces it in place or is appended.
    pub fn set(&mut self, mark_type: &str, mark: Option<&Mark>) {
        let existing = self.0.iter().position(|(key, _)| key == mark_type);
        match (existing, mark) {
            (Some(index), Some(mark)) => self.0[index].1 = mark.clone(),
            (Some(index), None) => {
                self.0.remove(index);
            }
            (None, Some(mark)) => self.0.push((mark_type.into(), mark.clone())),
            (None, None) => {}
        }
    }
    pub fn marks(&self) -> Vec<Mark> {
        self.0.iter().map(|(_, mark)| mark.clone()).collect()
    }
    /// `set` calls, in order, after which this list projects exactly `desired`.
    /// Marks which keep their place form the longest prefix of `desired` found in
    /// the current order; every other mark is removed and the rest is appended.
    pub fn changes_to(&self, desired: &[Mark]) -> Vec<(String, Option<Mark>)> {
        let desired = Self::from_marks(desired);
        if *self == desired {
            return vec![];
        }
        let mut kept = 0;
        let mut cursor = 0;
        for (key, _) in &desired.0 {
            match self.0[cursor..].iter().position(|(k, _)| k == key) {
                Some(offset) => {
                    cursor += offset + 1;
                    kept += 1;
                }
                None => break,
            }
        }
        let (stay, append) = desired.0.split_at(kept);
        let mut changes: Vec<_> = self
            .0
            .iter()
            .filter(|(key, _)| !stay.iter().any(|(k, _)| k == key))
            .map(|(key, _)| (key.clone(), None))
            .collect();
        for (key, mark) in stay {
            if self.0.iter().any(|(k, m)| k == key && m != mark) {
                changes.push((key.clone(), Some(mark.clone())));
            }
        }
        changes.extend(
            append
                .iter()
                .map(|(key, mark)| (key.clone(), Some(mark.clone()))),
        );
        changes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mark(kind: &str) -> Mark {
        Mark::new(kind)
    }
    fn colored(value: &str) -> Mark {
        let mut mark = Mark::new("color");
        mark.attrs
            .insert("color".into(), gotipe_core::AttrValue::String(value.into()));
        mark
    }
    fn apply(list: &MarkList, desired: &[Mark]) -> (MarkList, usize) {
        let changes = list.changes_to(desired);
        let mut next = list.clone();
        for (key, mark) in &changes {
            next.set(key, mark.as_ref());
        }
        (next, changes.len())
    }

    #[test]
    fn changes_reproduce_the_desired_order_with_the_fewest_writes() {
        let cases: Vec<(Vec<Mark>, Vec<Mark>, usize)> = vec![
            (vec![], vec![mark("italic"), mark("bold")], 2),
            (vec![mark("italic")], vec![mark("italic"), mark("bold")], 1),
            (vec![mark("italic"), mark("bold")], vec![mark("bold")], 1),
            // A reorder removes and appends only the mark that moved back.
            (
                vec![mark("bold"), mark("italic")],
                vec![mark("italic"), mark("bold")],
                2,
            ),
            // New attributes replace the mark where it stands.
            (
                vec![colored("red"), mark("bold")],
                vec![colored("blue"), mark("bold")],
                1,
            ),
            (
                vec![mark("a"), mark("b"), mark("c")],
                vec![mark("c"), mark("a"), mark("d")],
                4,
            ),
            (vec![mark("bold")], vec![mark("bold")], 0),
        ];
        for (current, desired, writes) in cases {
            let (next, count) = apply(&MarkList::from_marks(&current), &desired);
            assert_eq!(next.marks(), desired, "from {current:?}");
            assert_eq!(count, writes, "from {current:?} to {desired:?}");
        }
    }
}
