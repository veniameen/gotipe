use std::{collections::HashMap, sync::OnceLock};
pub(super) fn punctuation(c: Option<char>) -> bool {
    c.is_some_and(|c| c.is_ascii_punctuation())
}
pub(super) fn reference(text: &str) -> Option<(String, usize)> {
    let m =
        re!(r"^&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});").find(text)?;
    let raw = m.as_str();
    let body = &raw[1..raw.len() - 1];
    let value = if let Some(num) = body.strip_prefix('#') {
        let value = if num.starts_with(['x', 'X']) {
            u32::from_str_radix(&num[1..], 16).ok()?
        } else {
            num.parse().ok()?
        };
        let replacement = [
            (128, 0x20ac),
            (130, 0x201a),
            (131, 0x0192),
            (132, 0x201e),
            (133, 0x2026),
            (134, 0x2020),
            (135, 0x2021),
            (136, 0x02c6),
            (137, 0x2030),
            (138, 0x0160),
            (139, 0x2039),
            (140, 0x0152),
            (142, 0x017d),
            (145, 0x2018),
            (146, 0x2019),
            (147, 0x201c),
            (148, 0x201d),
            (149, 0x2022),
            (150, 0x2013),
            (151, 0x2014),
            (152, 0x02dc),
            (153, 0x2122),
            (154, 0x0161),
            (155, 0x203a),
            (156, 0x0153),
            (158, 0x017e),
            (159, 0x0178),
        ];
        let value = replacement
            .iter()
            .find(|(k, _)| *k == value)
            .map_or(value, |(_, v)| *v);
        char::from_u32(if value == 0 { 0xfffd } else { value })
            .unwrap_or('\u{fffd}')
            .to_string()
    } else {
        static NAMED: OnceLock<HashMap<String, String>> = OnceLock::new();
        NAMED
            .get_or_init(|| {
                serde_json::from_str(include_str!("entities.json")).expect("entity data")
            })
            .get(body)
            .cloned()
            .unwrap_or_else(|| raw.into())
    };
    Some((value, m.end()))
}
pub(super) fn string(text: &str) -> String {
    let mut out = String::new();
    let mut p = 0;
    while p < text.len() {
        let c = text[p..].chars().next().unwrap();
        if c == '\\' && punctuation(text[p + 1..].chars().next()) {
            let c = text[p + 1..].chars().next().unwrap();
            out.push(c);
            p += 2;
        } else if c == '&' {
            if let Some((value, len)) = reference(&text[p..]) {
                out.push_str(&value);
                p += len
            } else {
                out.push(c);
                p += 1
            }
        } else {
            out.push(c);
            p += c.len_utf8()
        }
    }
    out
}
pub(super) fn label(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
        .to_uppercase()
}
