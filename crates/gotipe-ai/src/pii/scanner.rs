//! Bounded matching for the three supported PII patterns. No regex engine runs
//! in production; the old expressions remain differential fixtures in tests.
use super::{unicode, PiiType};
use std::ops::Range;

pub(super) fn ranges(text: &str, kind: &PiiType) -> Vec<Range<usize>> {
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut matches = Vec::new();
    let mut index = 0;
    while index < chars.len() {
        let (end, skip) = match kind {
            PiiType::Email => email(&chars, index),
            PiiType::Phone => (phone(&chars, index), index + 1),
            PiiType::CreditCard => (card(&chars, index), index + 1),
        };
        if let Some(end) = end {
            matches.push(chars[index].0..chars.get(end).map_or(text.len(), |p| p.0));
            index = end;
        } else {
            index = skip;
        }
    }
    matches
}
fn local(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || "._%+-".contains(ch)
}
fn domain(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '.' || ch == '-'
}
fn email(chars: &[(usize, char)], start: usize) -> (Option<usize>, usize) {
    let mut at = start;
    while chars.get(at).is_some_and(|p| local(p.1)) {
        at += 1;
    }
    let skip = at.max(start + 1);
    if at == start || chars.get(at).map(|p| p.1) != Some('@') {
        return (None, skip);
    }
    let domain_start = at + 1;
    let mut end = domain_start;
    while chars.get(end).is_some_and(|p| domain(p.1)) {
        end += 1;
    }
    for dot in (domain_start + 1..end).rev() {
        if chars[dot].1 != '.' {
            continue;
        }
        let mut tail = dot + 1;
        while tail < end && chars[tail].1.is_ascii_alphabetic() {
            tail += 1;
        }
        if tail >= dot + 3 {
            return (Some(tail), skip);
        }
    }
    (None, skip)
}
fn digits(chars: &[(usize, char)], start: usize, count: usize) -> Option<usize> {
    let end = start.checked_add(count)?;
    chars
        .get(start..end)
        .filter(|run| run.iter().all(|p| unicode::digit(p.1)))
        .map(|_| end)
}
fn separator(ch: char) -> bool {
    ch == '-' || ch == '.' || unicode::space(ch)
}
fn optional_char(
    chars: &[(usize, char)],
    start: usize,
    predicate: impl Fn(char) -> bool,
) -> Vec<usize> {
    if chars.get(start).is_some_and(|p| predicate(p.1)) {
        vec![start + 1, start]
    } else {
        vec![start]
    }
}
fn countries(chars: &[(usize, char)], start: usize) -> Vec<usize> {
    let digit = if chars[start].1 == '+' {
        start + 1
    } else {
        start
    };
    let mut options = if chars.get(digit).map(|p| p.1) == Some('1') {
        optional_char(chars, digit + 1, separator)
    } else {
        vec![]
    };
    options.push(start);
    options
}
fn areas(chars: &[(usize, char)], start: usize) -> Vec<usize> {
    let mut options = Vec::new();
    for open in optional_char(chars, start, |ch| ch == '(') {
        if let Some(end) = digits(chars, open, 3) {
            for close in optional_char(chars, end, |ch| ch == ')') {
                options.extend(optional_char(chars, close, separator));
            }
        }
    }
    options.push(start);
    options
}
fn phone(chars: &[(usize, char)], start: usize) -> Option<usize> {
    for country in countries(chars, start) {
        for area in areas(chars, country) {
            if let Some(end) = digits(chars, area, 3) {
                for separator_end in optional_char(chars, end, separator) {
                    if let Some(end) = digits(chars, separator_end, 4) {
                        return Some(end);
                    }
                }
            }
        }
    }
    None
}
fn card(chars: &[(usize, char)], start: usize) -> Option<usize> {
    if start > 0 && unicode::word(chars[start - 1].1) {
        return None;
    }
    let mut end = start;
    for group in 0..4 {
        end = digits(chars, end, 4)?;
        if group < 3
            && chars
                .get(end)
                .is_some_and(|p| p.1 == '-' || unicode::space(p.1))
        {
            end += 1;
        }
    }
    if chars.get(end).is_some_and(|p| unicode::word(p.1)) {
        None
    } else {
        Some(end)
    }
}
