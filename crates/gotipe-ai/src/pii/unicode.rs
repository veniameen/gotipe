//! Unicode 16.0 classification data shared with the legacy detector contract.
const DECIMAL: &[u8] = include_bytes!("data/decimal.bin");
const SPACE: &[u8] = include_bytes!("data/space.bin");
const WORD: &[u8] = include_bytes!("data/word.bin");

fn contains(table: &[u8], ch: char) -> bool {
    let scalar = ch as u32;
    let mut low = 0;
    let mut high = table.len() / 8;
    while low < high {
        let mid = low + (high - low) / 2;
        let start = u32::from_le_bytes(table[mid * 8..mid * 8 + 4].try_into().unwrap());
        let end = u32::from_le_bytes(table[mid * 8 + 4..mid * 8 + 8].try_into().unwrap());
        if scalar < start {
            high = mid;
        } else if scalar > end {
            low = mid + 1;
        } else {
            return true;
        }
    }
    false
}
pub(super) fn digit(ch: char) -> bool {
    contains(DECIMAL, ch)
}
pub(super) fn space(ch: char) -> bool {
    contains(SPACE, ch)
}
pub(super) fn word(ch: char) -> bool {
    contains(WORD, ch)
}
