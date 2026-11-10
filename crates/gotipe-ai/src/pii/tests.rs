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

#[test]
fn offsets_match_dom_utf16_positions_after_non_ascii_text() {
    let detector = PiiDetector::new();
    let matches = detector.detect_email("Ж😀 hello@example.com");
    assert_eq!(matches[0].start, 4);
    assert_eq!(matches[0].end, 21);
    assert_eq!(
        detector.redact_pii("Ж😀 hello@example.com"),
        "Ж😀 [REDACTED]"
    );
}
#[test]
fn overlapping_matches_redact_once_and_keep_surrounding_text() {
    let detector = PiiDetector::new();
    assert_eq!(
        detector.redact_pii("before 4111111111111111 after"),
        "before [REDACTED] after"
    );
}
