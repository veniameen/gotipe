//! GFM autolink literals: `www.…`, `http://…`, `https://…` and e-mail addresses in plain text.
//! A literal is found where the source writes its start as it is: an escape or a character
//! reference in its `www.`, its `scheme://` or its `@` keeps the words text (`www\.a.b`), while
//! the rest of an address may hold them (`https://a.b/c\_d` is one link). The writer escapes
//! that start in typed text that a reader would take for an address (D-97).
//! `packages/markdown/src/grammar/autolinks.ts` is the TypeScript copy.
use std::collections::HashMap;

/// An autolink literal found at a byte offset of a text.
pub(crate) struct LiteralLink {
    /// Where it ends: the text of the link is `text[start..end]`.
    pub end: usize,
    pub url: String,
    /// The character whose escape keeps the words text: the `.` after `www`, the `:` of the
    /// scheme or the `@` of an address.
    pub trigger: usize,
}

/// Whether `c` continues a word: a literal starts at the start of a word only.
pub(crate) fn word(c: char) -> bool {
    c == '_' || {
        let mut buffer = [0; 4];
        re!(r"^[\p{L}\p{N}]$").is_match(c.encode_utf8(&mut buffer))
    }
}

/// What ends an address: JavaScript `\s`, `<` and `>`, as the TypeScript reader ends it.
fn url_end(c: char) -> bool {
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
                | '<'
                | '>'
    )
}

fn local(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || b".!#$%&'*+/=?^_`{|}~-".contains(&byte)
}

/// What lookups share, computed once per text.
struct Prepared {
    /// Per byte offset: where the run of address characters from it ends.
    ends: Vec<usize>,
    /// Per end offset: where the run of trailing punctuation that ends there starts.
    trails: Vec<usize>,
    /// How many `(` and `)` there are before each offset.
    opens: Vec<usize>,
    closes: Vec<usize>,
}

/// Autolink literals of one text, looked up offset by offset. `literal(i)` says whether the
/// source writes the byte at `i` as it is (not as an escape or a reference); it may change
/// between lookups. What lookups share is computed once, so a scan of the whole text is linear
/// (D-96).
pub(crate) struct AutolinkScanner<'a> {
    text: &'a str,
    prepared: Option<Prepared>,
    /// For every offset, where the run of e-mail local-part bytes from it ends.
    local_end: Option<Vec<usize>>,
    /// The end of the e-mail domain after each `@` (`None`: no domain), filled when asked.
    domains: HashMap<usize, Option<usize>>,
}

impl<'a> AutolinkScanner<'a> {
    pub fn new(text: &'a str) -> Self {
        Self {
            text,
            prepared: None,
            local_end: None,
            domains: HashMap::new(),
        }
    }

    /// The literal that starts at byte `p`, when the character before it (`before`, `None` at
    /// the start of text) does not continue a word.
    pub fn at(
        &mut self,
        p: usize,
        before: Option<char>,
        literal: &dyn Fn(usize) -> bool,
    ) -> Option<LiteralLink> {
        if before.is_some_and(word) {
            return None;
        }
        if matches!(self.text.as_bytes().get(p), Some(b'w' | b'h' | b'H')) {
            // a scheme in any case, `www.` in lower case
            if let Some(prefix) = re!(r"^(?:[Hh][Tt][Tt][Pp][Ss]?://|www\.)").find(&self.text[p..])
            {
                if let Some(url) = self.url(p, prefix.as_str(), literal) {
                    return Some(url);
                }
            }
        }
        self.email(p, literal)
    }

    fn prepare(text: &str) -> Prepared {
        let n = text.len();
        let mut ends = vec![n; n + 1];
        let mut trails = vec![0; n + 1];
        let mut opens = vec![0; n + 1];
        let mut closes = vec![0; n + 1];
        let mut next = n;
        for (at, c) in text.char_indices().rev() {
            if url_end(c) {
                next = at;
            }
            ends[at..at + c.len_utf8()].fill(next);
        }
        for (i, byte) in text.bytes().enumerate() {
            trails[i + 1] = if b"?!.,:*_~".contains(&byte) {
                trails[i]
            } else {
                i + 1
            };
            opens[i + 1] = opens[i] + usize::from(byte == b'(');
            closes[i + 1] = closes[i] + usize::from(byte == b')');
        }
        Prepared {
            ends,
            trails,
            opens,
            closes,
        }
    }

    fn url(
        &mut self,
        p: usize,
        prefix: &str,
        literal: &dyn Fn(usize) -> bool,
    ) -> Option<LiteralLink> {
        if !(p..p + prefix.len()).all(literal) {
            return None;
        }
        let text = self.text;
        let prepared = self.prepared.get_or_insert_with(|| Self::prepare(text));
        let mut end = prepared.ends[p];
        if end <= p + prefix.len() {
            return None;
        }
        // trailing punctuation is not part of the address
        end = p.max(prepared.trails[end]);
        // a closing parenthesis is part of it only when it balances an opening one
        let opens = prepared.opens[end] - prepared.opens[p];
        let mut closes = prepared.closes[end] - prepared.closes[p];
        let bytes = text.as_bytes();
        while closes > opens && bytes[end - 1] == b')' {
            end -= 1;
            closes -= 1;
        }
        // nor is a character reference at its end
        if end > p && bytes[end - 1] == b';' {
            let mut start = end - 1;
            while start > p && bytes[start - 1].is_ascii_alphanumeric() {
                start -= 1;
            }
            if start < end - 1 && start > p && bytes[start - 1] == b'&' {
                end = start - 1;
            }
        }
        // what is left must still be an address: `www.!` and `http://.` are text
        if end - p <= prefix.len() {
            return None;
        }
        let www = prefix == "www.";
        let label = &text[p..end];
        Some(LiteralLink {
            end,
            url: if www {
                format!("http://{label}")
            } else {
                label.to_owned()
            },
            trigger: p + if www { 3 } else { prefix.find(':')? },
        })
    }

    fn email(&mut self, p: usize, literal: &dyn Fn(usize) -> bool) -> Option<LiteralLink> {
        let bytes = self.text.as_bytes();
        if !bytes.get(p).copied().is_some_and(local) {
            return None;
        }
        let ends = self.local_end.get_or_insert_with(|| {
            let mut ends = vec![bytes.len(); bytes.len() + 1];
            for i in (0..bytes.len()).rev() {
                ends[i] = if local(bytes[i]) { ends[i + 1] } else { i };
            }
            ends
        });
        let at = ends[p];
        if bytes.get(at) != Some(&b'@') || !literal(at) {
            return None;
        }
        let text = self.text;
        let end = *self.domains.entry(at).or_insert_with(|| {
            re!(r"^[A-Za-z0-9](?:[A-Za-z0-9.-]*\.)[A-Za-z]{2,}")
                .find(&text[at + 1..])
                .map(|domain| at + 1 + domain.end())
        });
        let end = end?;
        Some(LiteralLink {
            end,
            url: format!("mailto:{}", &text[p..end]),
            trigger: at,
        })
    }
}
