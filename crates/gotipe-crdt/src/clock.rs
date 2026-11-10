//! Wire clocks use the exact integer range shared by Rust, Go and JavaScript.
use crate::ops::OpId;
use gotipe_core::TransformError;

pub const MAX_LAMPORT: u64 = 9_007_199_254_740_991;

pub(crate) fn next_id(clock: u64, peer: &str) -> Result<OpId, TransformError> {
    let next = clock
        .checked_add(1)
        .filter(|value| *value <= MAX_LAMPORT)
        .ok_or_else(exhausted)?;
    Ok(OpId::new(next, peer))
}
pub(crate) fn reserve(clock: u64, count: usize) -> Result<(), TransformError> {
    clock
        .checked_add(count as u64)
        .filter(|value| *value <= MAX_LAMPORT)
        .map(|_| ())
        .ok_or_else(exhausted)
}
fn exhausted() -> TransformError {
    TransformError::InvalidStep(
        "Collaboration clock exhausted; cannot allocate an exact operation identity".into(),
    )
}
pub(crate) fn valid_clock(id: &OpId) -> bool {
    id.lamport <= MAX_LAMPORT
}
