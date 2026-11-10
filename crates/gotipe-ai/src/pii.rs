mod scanner;
mod unicode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PiiType {
    Email,
    Phone,
    CreditCard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiiMatch {
    pub pii_type: PiiType,
    pub start: usize,
    pub end: usize,
    pub matched_text: String,
}

/// PII detector for pre-processing text before sending to AI
pub struct PiiDetector;

impl PiiDetector {
    pub fn new() -> Self {
        Self
    }

    /// Detect email addresses. Positions use UTF-16 code units for browser consumers.
    pub fn detect_email(&self, text: &str) -> Vec<PiiMatch> {
        self.matches(text, PiiType::Email)
    }

    /// Detect likely phone numbers in the supported formatted-number patterns.
    pub fn detect_phone(&self, text: &str) -> Vec<PiiMatch> {
        self.matches(text, PiiType::Phone)
    }

    /// Detect credit card numbers with Luhn validation.
    pub fn detect_credit_card(&self, text: &str) -> Vec<PiiMatch> {
        self.matches(text, PiiType::CreditCard)
    }

    fn ranges(&self, text: &str, kind: &PiiType) -> Vec<std::ops::Range<usize>> {
        scanner::ranges(text, kind)
            .into_iter()
            .filter(|range| {
                let digits: String = text[range.clone()]
                    .chars()
                    .filter(|ch| ch.is_ascii_digit())
                    .collect();
                match kind {
                    PiiType::Email => true,
                    PiiType::Phone => digits.len() >= 10,
                    PiiType::CreditCard => luhn_check(&digits),
                }
            })
            .collect()
    }

    fn matches(&self, text: &str, kind: PiiType) -> Vec<PiiMatch> {
        self.ranges(text, &kind)
            .into_iter()
            .map(|range| PiiMatch {
                pii_type: kind.clone(),
                start: text[..range.start].encode_utf16().count(),
                end: text[..range.end].encode_utf16().count(),
                matched_text: text[range].into(),
            })
            .collect()
    }

    /// Detect all supported types, ordered by their UTF-16 start position.
    pub fn detect_all(&self, text: &str) -> Vec<PiiMatch> {
        let mut matches = Vec::new();
        matches.extend(self.detect_email(text));
        matches.extend(self.detect_phone(text));
        matches.extend(self.detect_credit_card(text));
        matches.sort_by_key(|m| m.start);
        matches
    }

    /// Redact the union of matches, so overlapping phone/card matches cannot
    /// duplicate placeholders or expose a suffix of a longer sensitive value.
    pub fn redact_pii(&self, text: &str) -> String {
        let mut ranges = Vec::new();
        for kind in [PiiType::Email, PiiType::Phone, PiiType::CreditCard] {
            ranges.extend(self.ranges(text, &kind));
        }
        ranges.sort_by_key(|range| range.start);
        let mut merged: Vec<std::ops::Range<usize>> = Vec::new();
        for range in ranges {
            if let Some(last) = merged.last_mut().filter(|last| range.start <= last.end) {
                last.end = last.end.max(range.end);
            } else {
                merged.push(range);
            }
        }
        let mut output = String::with_capacity(text.len());
        let mut end = 0;
        for range in merged {
            output.push_str(&text[end..range.start]);
            output.push_str("[REDACTED]");
            end = range.end;
        }
        output.push_str(&text[end..]);
        output
    }
}

impl Default for PiiDetector {
    fn default() -> Self {
        Self::new()
    }
}

/// Luhn algorithm for credit card validation
fn luhn_check(digits: &str) -> bool {
    if digits.len() < 13 || digits.len() > 19 {
        return false;
    }

    let sum: u32 = digits
        .chars()
        .rev()
        .enumerate()
        .map(|(i, c)| {
            let mut d = c.to_digit(10).unwrap_or(0);
            if i % 2 == 1 {
                d *= 2;
                if d > 9 {
                    d -= 9;
                }
            }
            d
        })
        .sum();

    sum.is_multiple_of(10)
}

#[cfg(test)]
mod differential_tests;
#[cfg(test)]
mod tests;
