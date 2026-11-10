use super::{Change, Position};
use crate::clock::valid_clock;

fn position_clocks(position: &Position) -> bool {
    position.0.iter().all(|part| valid_clock(&part.id))
}
pub(crate) fn valid_change_clocks(change: &Change) -> bool {
    match change {
        Change::SetOperationActive { target, .. }
        | Change::DeleteChar { target, .. }
        | Change::SetMark { target, .. } => valid_clock(target),
        Change::CreateBlock { position, .. }
        | Change::MoveBlock { position, .. }
        | Change::InsertChar { position, .. } => position_clocks(position),
        Change::MoveTextRange {
            from, to, prefix, ..
        } => {
            from.as_ref().is_none_or(position_clocks)
                && to.as_ref().is_none_or(position_clocks)
                && position_clocks(prefix)
        }
        _ => true,
    }
}
