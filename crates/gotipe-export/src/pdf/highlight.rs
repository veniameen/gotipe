//! Bounded lexical presentation for code blocks. It never executes or rewrites code.
use super::{fonts::FontStyle, inline::Span, model::TextStyle};

const KEYWORDS:&str="as async await break case catch class const continue def default defer delete do else enum except export extends extern false final finally fn for from func function go if impl import in interface is let match mod mut namespace new nil null None not of package pass private protected pub public raise ref return select self Self static struct super switch then this throw trait true try type typeof undefined unsafe use val var void when where while with yield";

pub(crate) fn spans(text: &str, language: &str, size: f32) -> Vec<Span> {
    let base = TextStyle {
        font: FontStyle::Mono,
        size,
        ..TextStyle::default()
    };
    let language = language.to_ascii_lowercase();
    if language.is_empty() || ["text", "txt", "plain", "plaintext"].contains(&language.as_str()) {
        return vec![Span {
            text: text.into(),
            style: base,
        }];
    }
    let hash_comments = [
        "python", "py", "ruby", "rb", "bash", "sh", "shell", "zsh", "yaml", "yml", "toml", "r",
        "perl", "julia", "elixir",
    ]
    .contains(&language.as_str());
    let sql = ["sql", "lua", "haskell", "hs"].contains(&language.as_str());
    let markup = ["html", "xml", "svg"].contains(&language.as_str());
    let stylesheet = ["css", "scss", "sass", "less"].contains(&language.as_str());
    let mut in_tag = false;
    let bytes = text.as_bytes();
    let mut index = 0;
    let mut output = Vec::<Span>::new();
    while index < bytes.len() {
        let start = index;
        let rest = &text[index..];
        let color = if (hash_comments && rest.starts_with('#'))
            || rest.starts_with("//")
            || (sql && rest.starts_with("--"))
        {
            index += rest.find('\n').unwrap_or(rest.len());
            [0.35, 0.40, 0.45]
        } else if rest.starts_with("/*") || (markup && rest.starts_with("<!--")) {
            let (open, close) = if rest.starts_with("/*") {
                (2, "*/")
            } else {
                (4, "-->")
            };
            index += rest[open..]
                .find(close)
                .map_or(rest.len(), |end| open + end + close.len());
            [0.35, 0.40, 0.45]
        } else if b"'\"`".contains(&bytes[index]) {
            let quote = bytes[index];
            index += 1;
            while index < bytes.len() {
                if bytes[index] == b'\\' {
                    index = (index + 2).min(bytes.len());
                } else if bytes[index] == quote {
                    index += 1;
                    break;
                } else {
                    index += 1;
                }
            }
            [0.12, 0.42, 0.22]
        } else if bytes[index].is_ascii_digit() {
            index += 1;
            while index < bytes.len()
                && (bytes[index].is_ascii_alphanumeric() || b"._".contains(&bytes[index]))
            {
                index += 1;
            }
            [0.55, 0.25, 0.08]
        } else if bytes[index].is_ascii_alphabetic() || bytes[index] == b'_' {
            index += 1;
            while index < bytes.len()
                && (bytes[index].is_ascii_alphanumeric() || bytes[index] == b'_')
            {
                index += 1;
            }
            let word = &text[start..index];
            if markup && in_tag {
                [0.10, 0.30, 0.65]
            } else if stylesheet {
                [0.45, 0.20, 0.55]
            } else if KEYWORDS
                .split_ascii_whitespace()
                .any(|keyword| keyword == word)
                || (sql
                    && [
                        "SELECT", "FROM", "WHERE", "INSERT", "INTO", "UPDATE", "DELETE", "JOIN",
                        "CREATE", "TABLE", "AS", "AND", "OR", "NULL",
                    ]
                    .contains(&word.to_ascii_uppercase().as_str()))
            {
                [0.35, 0.20, 0.65]
            } else {
                [0.1; 3]
            }
        } else {
            if markup && bytes[index] == b'<' {
                in_tag = true;
            }
            let tag_symbol = markup && in_tag;
            if markup && bytes[index] == b'>' {
                in_tag = false;
            }
            index += rest.chars().next().map_or(1, char::len_utf8);
            if tag_symbol {
                [0.35, 0.20, 0.65]
            } else {
                [0.1; 3]
            }
        };
        while !text.is_char_boundary(index) {
            index += 1;
        }
        let token = &text[start..index];
        if let Some(last) = output.last_mut().filter(|span| span.style.color == color) {
            last.text.push_str(token);
        } else {
            let mut style = base.clone();
            style.color = color;
            output.push(Span {
                text: token.into(),
                style,
            });
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn presentation_preserves_all_source_bytes() {
        for source in [
            "const привет = '😀'; // comment\n",
            "def greet():\n  return \"é\" # note",
            "<x a=\"✓\">中文</x>",
            "\"\\😀\"",
            "/* unfinished",
        ] {
            let highlighted = spans(source, "typescript", 12.0);
            assert_eq!(
                highlighted
                    .iter()
                    .map(|s| s.text.as_str())
                    .collect::<String>(),
                source
            );
        }
    }
}
