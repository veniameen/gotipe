use regex::Regex;
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
pub struct PiiDetector {
    email_regex: Regex,
    phone_regex: Regex,
    credit_card_regex: Regex,
}

impl PiiDetector {
    pub fn new() -> Self {
        PiiDetector {
            email_regex: Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
                .expect("valid email regex"),
            phone_regex: Regex::new(r"(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}")
                .expect("valid phone regex"),
            credit_card_regex: Regex::new(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b")
                .expect("valid credit card regex"),
        }
    }

    /// Detect email addresses in text
    pub fn detect_email(&self, text: &str) -> Vec<PiiMatch> {
        self.email_regex
            .find_iter(text)
            .map(|m| PiiMatch {
                pii_type: PiiType::Email,
                start: m.start(),
                end: m.end(),
                matched_text: m.as_str().into(),
            })
            .collect()
    }

    /// Detect phone numbers in text (international formats)
    pub fn detect_phone(&self, text: &str) -> Vec<PiiMatch> {
        self.phone_regex
            .find_iter(text)
            .filter(|m| {
                let digits: String = m.as_str().chars().filter(|c| c.is_ascii_digit()).collect();
                digits.len() >= 10
            })
            .map(|m| PiiMatch {
                pii_type: PiiType::Phone,
                start: m.start(),
                end: m.end(),
                matched_text: m.as_str().into(),
            })
            .collect()
    }

    /// Detect credit card numbers (with Luhn validation)
    pub fn detect_credit_card(&self, text: &str) -> Vec<PiiMatch> {
        self.credit_card_regex
            .find_iter(text)
            .filter(|m| {
                let digits: String = m.as_str().chars().filter(|c| c.is_ascii_digit()).collect();
                luhn_check(&digits)
            })
            .map(|m| PiiMatch {
                pii_type: PiiType::CreditCard,
                start: m.start(),
                end: m.end(),
                matched_text: m.as_str().into(),
            })
            .collect()
    }

    /// Detect all PII types
    pub fn detect_all(&self, text: &str) -> Vec<PiiMatch> {
        let mut matches = Vec::new();
        matches.extend(self.detect_email(text));
        matches.extend(self.detect_phone(text));
        matches.extend(self.detect_credit_card(text));
        matches.sort_by_key(|m| m.start);
        matches
    }

    /// Redact all PII from text, replacing with [REDACTED]
    pub fn redact_pii(&self, text: &str) -> String {
        let matches = self.detect_all(text);
        if matches.is_empty() {
            return text.to_string();
        }

        let mut result = String::with_capacity(text.len());
        let mut last_end = 0;

        for m in &matches {
            if m.start > last_end {
                result.push_str(&text[last_end..m.start]);
            }
            result.push_str("[REDACTED]");
            last_end = m.end;
        }

        if last_end < text.len() {
            result.push_str(&text[last_end..]);
        }

        result
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
mod tests {
    use super::*;

    #[test]
    fn test_detect_email() {
        let detector = PiiDetector::new();
        let matches = detector.detect_email("Contact us at hello@example.com for more info");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].matched_text, "hello@example.com");
        assert_eq!(matches[0].pii_type, PiiType::Email);
    }

    #[test]
    fn test_detect_phone() {
        let detector = PiiDetector::new();
        let matches = detector.detect_phone("Call +1 (555) 123-4567 for support");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].pii_type, PiiType::Phone);
    }

    #[test]
    fn test_detect_credit_card() {
        let detector = PiiDetector::new();
        // Valid Luhn: 4111 1111 1111 1111
        let matches = detector.detect_credit_card("Card: 4111 1111 1111 1111");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].pii_type, PiiType::CreditCard);
    }

    #[test]
    fn test_invalid_credit_card_rejected() {
        let detector = PiiDetector::new();
        // Invalid Luhn
        let matches = detector.detect_credit_card("Card: 1234 5678 9012 3456");
        assert_eq!(matches.len(), 0);
    }

    #[test]
    fn test_redact_pii() {
        let detector = PiiDetector::new();
        let text = "Email: hello@example.com and card: 4111 1111 1111 1111";
        let redacted = detector.redact_pii(text);
        assert!(redacted.contains("[REDACTED]"));
        assert!(!redacted.contains("hello@example.com"));
    }

    #[test]
    fn test_no_pii_returns_unchanged() {
        let detector = PiiDetector::new();
        let text = "Just some regular text with no PII";
        assert_eq!(detector.redact_pii(text), text);
    }

    #[test]
    fn test_luhn_check() {
        assert!(luhn_check("4111111111111111")); // Visa test card
        assert!(luhn_check("5500000000000004")); // Mastercard test card
        assert!(!luhn_check("1234567890123456"));
    }
}
