//! Rich text as the writer reads it: canonical marks, neighbouring spans with the same marks
//! joined and empty spans dropped (`normalizeSpans` of `packages/markdown/src/model.ts`), and
//! the atoms as Markdown carries them (`carried` of `atoms.ts`).
use gotipe_core::{AttrValue, Mark, TextSpan};
use std::collections::{BTreeMap, HashMap};

const RANKED: [&str; 10] = [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "code",
    "link",
    "highlight",
    "superscript",
    "subscript",
    "mdRaw",
];

fn rank(kind: &str) -> usize {
    RANKED
        .iter()
        .position(|ranked| *ranked == kind)
        .map_or(100, |index| index + 1)
}

/// The value as `JSON.stringify` writes it: a whole number without a fraction.
fn json(value: &AttrValue) -> String {
    match value {
        AttrValue::String(text) => serde_json::to_string(text).expect("a string is JSON"),
        AttrValue::Number(number) if number.is_finite() && number.fract() == 0.0 => {
            format!("{number:.0}")
        }
        AttrValue::Number(number) if number.is_finite() => number.to_string(),
        AttrValue::Number(_) | AttrValue::Null => "null".into(),
        AttrValue::Bool(flag) => flag.to_string(),
        AttrValue::Array(values) => {
            format!(
                "[{}]",
                values.iter().map(json).collect::<Vec<_>>().join(",")
            )
        }
        AttrValue::Object(values) => object(values.iter()),
    }
}

fn object<'a>(values: impl Iterator<Item = (&'a String, &'a AttrValue)>) -> String {
    let sorted: BTreeMap<&String, &AttrValue> = values.collect();
    let fields: Vec<String> = sorted
        .into_iter()
        .map(|(name, value)| format!("{}:{}", json(&AttrValue::String(name.clone())), json(value)))
        .collect();
    format!("{{{}}}", fields.join(","))
}

/// The stable key of a canonical mark, `stableStringify` of the TypeScript writer.
pub(super) fn key(mark: &Mark) -> String {
    let kind = json(&AttrValue::String(mark.mark_type.clone()));
    if mark.attrs.is_empty() {
        format!("{{\"type\":{kind}}}")
    } else {
        format!(
            "{{\"attrs\":{},\"type\":{kind}}}",
            object(mark.attrs.iter())
        )
    }
}

fn text_attr<'a>(mark: &'a Mark, name: &str) -> Option<&'a str> {
    match mark.attrs.get(name) {
        Some(AttrValue::String(value)) => Some(value),
        _ => None,
    }
}

/// The mark as Markdown carries it: a link's address and title; the attributes of the other
/// marks Markdown writes only where they mean something (a highlight's color).
fn canonical(mark: &Mark) -> Mark {
    if mark.mark_type == "link" {
        let mut attrs = HashMap::from([(
            "href".to_owned(),
            AttrValue::String(text_attr(mark, "href").unwrap_or("").to_owned()),
        )]);
        if let Some(title) = text_attr(mark, "title").filter(|title| !title.is_empty()) {
            attrs.insert("title".into(), AttrValue::String(title.to_owned()));
        }
        return Mark {
            mark_type: "link".into(),
            attrs,
        };
    }
    if rank(&mark.mark_type) < 100 && mark.mark_type != "highlight" {
        return Mark::new(&mark.mark_type);
    }
    mark.clone()
}

/// Canonical marks without repeats, in rank order and then by key.
fn sorted(marks: &[Mark]) -> Vec<Mark> {
    let mut out: Vec<(usize, String, Mark)> = vec![];
    for mark in marks.iter().map(canonical) {
        let key = key(&mark);
        if out.iter().all(|(_, seen, _)| *seen != key) {
            out.push((rank(&mark.mark_type), key, mark));
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    out.into_iter().map(|(_, _, mark)| mark).collect()
}

/// Canonical marks, neighbouring spans with the same marks joined, empty spans dropped.
pub(super) fn normalize(spans: &[TextSpan]) -> Vec<TextSpan> {
    let mut out: Vec<TextSpan> = vec![];
    let mut last_keys: Vec<String> = vec![];
    for span in spans.iter().filter(|span| !span.text.is_empty()) {
        let marks = sorted(&span.marks);
        let keys: Vec<String> = marks.iter().map(key).collect();
        match out.last_mut() {
            Some(previous) if keys == last_keys => previous.text.push_str(&span.text),
            _ => {
                out.push(TextSpan {
                    text: span.text.clone(),
                    marks,
                });
                last_keys = keys;
            }
        }
    }
    out
}

/// The attributes of each atom that Markdown carries.
const CARRIED: [(&str, &[&str]); 4] = [
    ("mention", &["id", "kind", "label"]),
    ("inlineMath", &[]),
    ("customEmoji", &["name", "src"]),
    ("inlineImage", &["src", "alt"]),
];

/// `spans` as Markdown carries them: atoms without `key` and the attributes it does not write,
/// a mention of a user and an image whose alt is its text when the mark does not say.
pub(super) fn carried(spans: &[TextSpan]) -> Vec<TextSpan> {
    let carry = |span: &TextSpan, mark: &Mark| -> Mark {
        let Some((_, names)) = CARRIED.iter().find(|(kind, _)| *kind == mark.mark_type) else {
            return mark.clone();
        };
        let defaults = [
            ("kind", AttrValue::String("user".into())),
            ("alt", AttrValue::String(span.text.clone())),
        ];
        let attrs = names
            .iter()
            .filter_map(|name| {
                let value = mark.attrs.get(*name).cloned().or_else(|| {
                    defaults
                        .iter()
                        .find(|(default, _)| default == name)
                        .map(|(_, value)| value.clone())
                })?;
                Some(((*name).to_owned(), value))
            })
            .collect();
        Mark {
            mark_type: mark.mark_type.clone(),
            attrs,
        }
    };
    spans
        .iter()
        .map(|span| TextSpan {
            text: span.text.clone(),
            marks: span.marks.iter().map(|mark| carry(span, mark)).collect(),
        })
        .collect()
}
