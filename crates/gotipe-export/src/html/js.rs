//! The JavaScript value conversions the canonical TS serializer applies to attributes
//! (`String(x)`, `Number(x)`, truthiness, `trim`), so both serializers read the same
//! JSON the same way.
use gotipe_core::AttrValue;

/// ECMAScript WhiteSpace and LineTerminator: what `trim()` removes and `\s` matches.
pub(crate) fn is_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

pub(crate) fn trim(value: &str) -> &str {
    value.trim_matches(is_space)
}

/// JavaScript truthiness; a missing attribute is `undefined`.
pub(crate) fn truthy(value: Option<&AttrValue>) -> bool {
    match value {
        None | Some(AttrValue::Null) => false,
        Some(AttrValue::Bool(value)) => *value,
        Some(AttrValue::Number(value)) => *value != 0.0 && !value.is_nan(),
        Some(AttrValue::String(value)) => !value.is_empty(),
        Some(AttrValue::Array(_) | AttrValue::Object(_)) => true,
    }
}

/// `value ?? fallback` followed by `String(...)`.
pub(crate) fn string_or(value: Option<&AttrValue>, fallback: &str) -> String {
    match value {
        None | Some(AttrValue::Null) => fallback.to_owned(),
        Some(value) => string(value),
    }
}

/// `String(value)`.
pub(crate) fn string(value: &AttrValue) -> String {
    match value {
        AttrValue::String(value) => value.clone(),
        AttrValue::Number(value) => number_to_string(*value),
        AttrValue::Bool(value) => value.to_string(),
        AttrValue::Null => "null".into(),
        AttrValue::Object(_) => "[object Object]".into(),
        AttrValue::Array(values) => values
            .iter()
            .map(|value| match value {
                AttrValue::Null => String::new(),
                value => string(value),
            })
            .collect::<Vec<_>>()
            .join(","),
    }
}

/// `Number(value)`; a missing attribute is `undefined`, which is `NaN`.
pub(crate) fn number(value: Option<&AttrValue>) -> f64 {
    match value {
        None | Some(AttrValue::Object(_)) => f64::NAN,
        Some(AttrValue::Null) => 0.0,
        Some(AttrValue::Bool(value)) => f64::from(u8::from(*value)),
        Some(AttrValue::Number(value)) => *value,
        Some(AttrValue::String(value)) => string_to_number(value),
        Some(value @ AttrValue::Array(_)) => string_to_number(&string(value)),
    }
}

fn string_to_number(value: &str) -> f64 {
    let text = trim(value);
    match text {
        "" => return 0.0,
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let bytes = text.as_bytes();
    if bytes.len() > 2 && bytes[0] == b'0' {
        let radix = match bytes[1] {
            b'x' | b'X' => 16,
            b'o' | b'O' => 8,
            b'b' | b'B' => 2,
            _ => 0,
        };
        if radix != 0 {
            return text[2..]
                .chars()
                .try_fold(0.0, |total: f64, c| {
                    c.to_digit(radix)
                        .map(|digit| total * f64::from(radix) + f64::from(digit))
                })
                .unwrap_or(f64::NAN);
        }
    }
    decimal(text).unwrap_or(f64::NAN)
}

/// StrDecimalLiteral without `Infinity`: `[+-]? (digits [. digits?] | . digits) ([eE] [+-]? digits)?`.
/// The value is read by the JSON number reader serde_json already links into the editor
/// WASM, instead of a second float parser.
fn decimal(text: &str) -> Option<f64> {
    let (sign, unsigned) = match text.strip_prefix('-') {
        Some(rest) => ("-", rest),
        None => ("", text.strip_prefix('+').unwrap_or(text)),
    };
    let (mantissa, exponent) = match unsigned.find(['e', 'E']) {
        Some(index) => (&unsigned[..index], Some(&unsigned[index + 1..])),
        None => (unsigned, None),
    };
    let digits = |part: &str| part.bytes().all(|b| b.is_ascii_digit());
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    if !digits(whole) || !digits(fraction) || (whole.is_empty() && fraction.is_empty()) {
        return None;
    }
    let exponent = match exponent {
        Some(exponent) => {
            let magnitude = exponent.strip_prefix(['+', '-']).unwrap_or(exponent);
            if magnitude.is_empty() || !digits(magnitude) {
                return None;
            }
            format!("e{exponent}")
        }
        None => String::new(),
    };
    let whole = whole.trim_start_matches('0');
    let json = format!(
        "{sign}{}{}{exponent}",
        if whole.is_empty() { "0" } else { whole },
        if fraction.is_empty() {
            String::new()
        } else {
            format!(".{fraction}")
        }
    );
    // A grammatical literal only fails to read when it is out of range: JavaScript gives ±Infinity.
    Some(serde_json::from_str(&json).unwrap_or(if sign == "-" {
        f64::NEG_INFINITY
    } else {
        f64::INFINITY
    }))
}

/// `Number.prototype.toString()`: the shortest round-trip digits (from the formatter
/// serde_json already links) laid out by the ECMAScript rules.
pub(crate) fn number_to_string(value: f64) -> String {
    if value.is_nan() {
        return "NaN".into();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    let shortest = serde_json::Number::from_f64(value)
        .map(|number| number.to_string())
        .unwrap_or_default();
    let (negative, body) = match shortest.strip_prefix('-') {
        Some(body) => (true, body),
        None => (false, shortest.as_str()),
    };
    let (mantissa, exponent) = match body.split_once(['e', 'E']) {
        Some((mantissa, exponent)) => (
            mantissa,
            exponent.trim_start_matches('+').parse().unwrap_or(0),
        ),
        None => (body, 0i32),
    };
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    let joined = format!("{whole}{fraction}");
    let leading = joined.len() - joined.trim_start_matches('0').len();
    let digits = joined[leading..].trim_end_matches('0');
    if digits.is_empty() {
        return "0".into();
    }
    // The value is 0.<digits> × 10^point; `k` digits.
    let point = whole.len() as i32 - leading as i32 + exponent;
    let k = digits.len() as i32;
    let mut text = String::from(if negative { "-" } else { "" });
    if k <= point && point <= 21 {
        text.push_str(digits);
        text.push_str(&"0".repeat((point - k) as usize));
    } else if 0 < point && point <= 21 {
        text.push_str(&digits[..point as usize]);
        text.push('.');
        text.push_str(&digits[point as usize..]);
    } else if -6 < point && point <= 0 {
        text.push_str("0.");
        text.push_str(&"0".repeat(-point as usize));
        text.push_str(digits);
    } else {
        text.push_str(&digits[..1]);
        if k > 1 {
            text.push('.');
            text.push_str(&digits[1..]);
        }
        let power = point - 1;
        text.push_str(if power < 0 { "e-" } else { "e+" });
        text.push_str(&power.unsigned_abs().to_string());
    }
    text
}

/// `Number.isInteger(value)`.
pub(crate) fn is_integer(value: f64) -> bool {
    value.is_finite() && value.trunc() == value
}

#[cfg(test)]
mod tests {
    use super::*;
    use AttrValue::{Array, Bool, Null, Number, Object, String as Text};

    #[test]
    fn conversions_match_javascript() {
        let cases = [
            (Text(" 0x1F ".into()), 31.0),
            (Text("1e3".into()), 1000.0),
            (Text(".5".into()), 0.5),
            (Text("5.".into()), 5.0),
            (Text("+007.50e+1".into()), 75.0),
            (Text("-0.25".into()), -0.25),
            (Text("1e400".into()), f64::INFINITY),
            (Text("-1e400".into()), f64::NEG_INFINITY),
            (Text("".into()), 0.0),
            (Bool(true), 1.0),
            (Null, 0.0),
            (Array(vec![Number(7.0)]), 7.0),
            (Array(vec![]), 0.0),
        ];
        for (value, expected) in cases {
            assert_eq!(number(Some(&value)), expected, "{value:?}");
        }
        for value in [
            Text("inf".into()),
            Text("1_0".into()),
            Text("0x".into()),
            Text("e5".into()),
            Text("1e".into()),
            Text(".".into()),
            Array(vec![Number(1.0), Number(2.0)]),
            Object(Default::default()),
        ] {
            assert!(number(Some(&value)).is_nan(), "{value:?}");
        }
        assert!(number(None).is_nan());
        for (value, text) in [
            (5.0, "5"),
            (-0.0, "0"),
            (0.1, "0.1"),
            (1e21, "1e+21"),
            (-1e21, "-1e+21"),
            (1.5e-7, "1.5e-7"),
            (1e-7, "1e-7"),
            (0.000001, "0.000001"),
            (0.1, "0.1"),
            (2.5, "2.5"),
            (-1234.5678, "-1234.5678"),
            (1e16, "10000000000000000"),
            (123456789012345680000.0, "123456789012345680000"),
            (f64::MAX, "1.7976931348623157e+308"),
            (5e-324, "5e-324"),
        ] {
            assert_eq!(number_to_string(value), text);
        }
        assert_eq!(
            string(&Array(vec![Null, Bool(false), Text("a".into())])),
            ",false,a"
        );
        assert_eq!(trim("\u{feff}\u{a0} x \u{3000}"), "x");
        assert_eq!(trim("\u{85}x"), "\u{85}x");
        assert!(!truthy(Some(&Number(f64::NAN))) && truthy(Some(&Array(vec![]))));
    }
}
