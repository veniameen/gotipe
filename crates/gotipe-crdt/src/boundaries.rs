//! Where a replica's own operations may be split between update frames: only
//! after the last operation of a local transaction. A peer validates what it
//! projects, so it must never receive half of a transaction.
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default)]
pub(crate) struct Boundaries {
    /// Own clocks `start..=end` after each of which a frame may end. A run of
    /// one-operation transactions, such as typing, shares one range.
    ranges: BTreeMap<u64, u64>,
    /// The own clock that ended the last transaction.
    sealed: u64,
    /// The first own clock after `sealed`, while a transaction is open.
    open: Option<u64>,
}

impl Boundaries {
    /// Records an own operation. One that is not part of a sealed transaction
    /// (an open one, or one restored from a local copy) stays joined to the
    /// operations after it.
    pub fn observe(&mut self, clock: u64) {
        if clock > self.sealed && self.open.is_none_or(|open| clock < open) {
            self.open = Some(clock);
        }
    }
    /// Ends the open transaction at `last`, the newest own clock.
    pub fn seal(&mut self, last: u64) {
        let Some(first) = self.open.take() else {
            return;
        };
        match self.ranges.iter_mut().next_back() {
            // One operation directly after the previous transaction extends its range.
            Some((_, end)) if first == last && *end == self.sealed => *end = last,
            _ => {
                self.ranges.insert(last, last);
            }
        }
        self.sealed = last;
    }
    /// Forgets the ends at or below `clock`: a peer that confirmed `clock` has
    /// everything up to it, so no frame starts there again.
    pub fn forget_through(&mut self, clock: u64) {
        let spanning = self
            .ranges
            .range(..=clock)
            .next_back()
            .map(|(_, end)| *end)
            .filter(|end| *end > clock);
        self.ranges = self.ranges.split_off(&clock.saturating_add(1));
        if let Some(end) = spanning {
            self.ranges.insert(clock + 1, end);
        }
    }
    /// Whether a frame may end after the own operation at `clock`.
    pub fn ends_after(&self, clock: u64) -> bool {
        self.ranges
            .range(..=clock)
            .next_back()
            .is_some_and(|(_, end)| clock <= *end)
    }
}

#[cfg(test)]
mod tests {
    use super::Boundaries;

    #[test]
    fn transactions_end_only_after_their_last_operation() {
        let mut boundaries = Boundaries::default();
        for clock in [1, 2, 3] {
            boundaries.observe(clock);
            boundaries.seal(clock);
        }
        // A remote operation took clock 4; a three-operation transaction follows.
        for clock in [5, 6, 7] {
            boundaries.observe(clock);
        }
        boundaries.seal(7);
        boundaries.observe(8);
        boundaries.seal(8);
        let cuts: Vec<_> = (1..=9).filter(|c| boundaries.ends_after(*c)).collect();
        assert_eq!(cuts, [1, 2, 3, 7, 8]);
        assert_eq!(boundaries.ranges.len(), 2);
    }

    #[test]
    fn confirmed_ends_are_forgotten() {
        let mut boundaries = Boundaries::default();
        for clock in [1, 2, 3, 9] {
            boundaries.observe(clock);
            boundaries.seal(clock);
        }
        boundaries.forget_through(2);
        let own = [1, 2, 3, 9];
        let cuts: Vec<_> = own
            .into_iter()
            .filter(|c| boundaries.ends_after(*c))
            .collect();
        assert_eq!(cuts, [3, 9]);
        boundaries.forget_through(9);
        assert!(boundaries.ranges.is_empty());
        // Typing goes on after everything was confirmed.
        boundaries.observe(10);
        boundaries.seal(10);
        assert!(boundaries.ends_after(10));
    }

    #[test]
    fn unsealed_operations_stay_joined() {
        let mut boundaries = Boundaries::default();
        boundaries.observe(3);
        assert!(!boundaries.ends_after(3));
        boundaries.seal(4);
        assert!(!boundaries.ends_after(3));
        assert!(boundaries.ends_after(4));
    }
}
