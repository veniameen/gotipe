use super::*;
use regex::Regex;

fn reference(text: &str, kind: &PiiType, regex: &Regex) -> Vec<(usize, usize, String)> {
    regex
        .find_iter(text)
        .filter(|m| {
            let digits: String = m
                .as_str()
                .chars()
                .filter(|ch| ch.is_ascii_digit())
                .collect();
            match kind {
                PiiType::Email => true,
                PiiType::Phone => digits.len() >= 10,
                PiiType::CreditCard => luhn_check(&digits),
            }
        })
        .map(|m| {
            (
                text[..m.start()].encode_utf16().count(),
                text[..m.end()].encode_utf16().count(),
                m.as_str().into(),
            )
        })
        .collect()
}
fn patterns() -> [(PiiType, Regex); 3] {
    [
        (
            PiiType::Email,
            Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap(),
        ),
        (
            PiiType::Phone,
            Regex::new(r"(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}").unwrap(),
        ),
        (
            PiiType::CreditCard,
            Regex::new(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b").unwrap(),
        ),
    ]
}
fn compare(detector: &PiiDetector, patterns: &[(PiiType, Regex)], text: &str) {
    for (kind, regex) in patterns {
        let actual: Vec<_> = detector
            .matches(text, kind.clone())
            .into_iter()
            .map(|m| (m.start, m.end, m.matched_text))
            .collect();
        assert_eq!(actual, reference(text, kind, regex), "{kind:?}: {text:?}");
    }
}
#[test]
fn finite_scanner_matches_legacy_patterns_across_unicode_and_format_variants() {
    let detector = PiiDetector::new();
    let patterns = patterns();
    for separator in [
        "", "-", ".", " ", "\t", "\r", "\n", "\u{85}", "\u{a0}", "\u{1680}", "\u{2000}",
        "\u{2009}", "\u{2028}", "\u{202f}", "\u{205f}", "\u{3000}",
    ] {
        for prefix in ["", "1", "+1", "+1 ", "+1-"] {
            for (open, close) in [("", ""), ("(", ")"), ("(", ""), ("", ")")] {
                compare(
                    &detector,
                    &patterns,
                    &format!("Ж😀 {prefix}{open}555{close}{separator}123{separator}4567 trailing"),
                );
                compare(
                    &detector,
                    &patterns,
                    &format!("{prefix}{open}٥55{close}{separator}123{separator}4567"),
                );
            }
        }
        compare(
            &detector,
            &patterns,
            &format!("card 4111{separator}1111{separator}1111{separator}1111; end"),
        );
    }
    for boundary in [
        "", " ", "Ж", "中", "😀", "_", "\u{301}", "\u{200c}", "Ⅷ", "²", ".", "@",
    ] {
        compare(
            &detector,
            &patterns,
            &format!("{boundary}4111111111111111{boundary}"),
        );
    }
    for email in [
        "a@b.co",
        "a@.co",
        "a@..co",
        "foo+bar@sub.example.co.uk",
        "...a@b.com123",
        "a@b.com-tail",
        "foo@bar",
        "a@b.c",
        "a@@b.com",
        "x@x.co@y.com",
        "hello@example.com.",
        "a@a..zz",
    ] {
        compare(&detector, &patterns, &format!("Ж😀 {email} {email}"));
    }
    let alphabet: Vec<_> = "abcXYZ09@._%+-() \t\n٣４Ж😀\u{301}\u{200c}"
        .chars()
        .collect();
    let mut seed = 17u64;
    for _ in 0..500 {
        let mut text = String::new();
        for _ in 0..160 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            text.push(alphabet[(seed >> 32) as usize % alphabet.len()]);
        }
        compare(&detector, &patterns, &text);
    }
}
#[test]
fn unicode_property_ranges_match_the_legacy_classifier() {
    let decimal = Regex::new(r"^\d$").unwrap();
    let space = Regex::new(r"^\s$").unwrap();
    let word = Regex::new(r"^\w$").unwrap();
    let mut scalars: Vec<u32> = (0..=0x10ffff).step_by(257).collect();
    for data in [
        include_bytes!("data/decimal.bin").as_slice(),
        include_bytes!("data/space.bin").as_slice(),
        include_bytes!("data/word.bin").as_slice(),
    ] {
        for bytes in data.as_chunks::<4>().0 {
            let value = u32::from_le_bytes(*bytes);
            scalars.extend([value.saturating_sub(1), value, value + 1]);
        }
    }
    for scalar in scalars {
        if let Some(ch) = char::from_u32(scalar) {
            let text = ch.to_string();
            assert_eq!(unicode::digit(ch), decimal.is_match(&text));
            assert_eq!(unicode::space(ch), space.is_match(&text));
            assert_eq!(unicode::word(ch), word.is_match(&text));
        }
    }
}
