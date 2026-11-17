//! Rich text of a block: inline nodes to spans with marks, including the inline atoms the
//! reader was asked for (docs/development/inline-atoms.md).
use super::{atoms, convert::string, MarkdownAtoms, Node};
use gotipe_core::{Mark, TextSpan};
#[derive(Default)]
pub(super) struct Inline {
    pub spans: Vec<TextSpan>,
    /// Atoms read so far: each gets its own `key`, renumbered in document order later.
    atoms: usize,
}
impl Inline {
    /// The mark of the atom that starts here. Its `key` keeps it apart from an equal
    /// neighbour; `atoms::number_atoms` gives the final keys once the document is read.
    fn atom(&mut self, mark: Mark) -> Mark {
        self.atoms += 1;
        mark.with_attr("key", string(self.atoms.to_string()))
    }
    fn push(&mut self, text: &str, marks: &[Mark]) {
        if text.is_empty() {
            return;
        }

        let mut marks = marks.to_vec();
        let rank = |s: &str| {
            [
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
                "textColor",
            ]
            .iter()
            .position(|t| *t == s)
            .unwrap_or(100)
        };
        marks.sort_by_key(|m| rank(&m.mark_type));
        marks.dedup();
        if let Some(last) = self.spans.last_mut().filter(|s| s.marks == marks) {
            last.text.push_str(text)
        } else {
            self.spans.push(TextSpan {
                text: text.into(),
                marks,
            })
        }
    }
    pub fn text(&self) -> String {
        self.spans.iter().map(|s| s.text.as_str()).collect()
    }
    pub fn trim(&mut self, mut count: usize) {
        while !self.spans.is_empty() && count > 0 {
            if self.spans[0].text.len() <= count {
                count -= self.spans.remove(0).text.len()
            } else {
                self.spans[0].text = self.spans[0].text[count..].into();
                count = 0;
            }
        }
    }
}
fn paired(value: &str) -> Option<(String, Mark)> {
    let tag = value.strip_prefix('<')?.strip_suffix('>')?;
    let kind = match tag.to_ascii_lowercase().as_str() {
        "u" => Some("underline"),
        "mark" => Some("highlight"),
        "sup" => Some("superscript"),
        "sub" => Some("subscript"),
        "em" | "i" => Some("italic"),
        "strong" | "b" => Some("bold"),
        "s" | "del" => Some("strikethrough"),
        _ => None,
    };
    if let Some(kind) = kind {
        return Some((tag.to_ascii_lowercase(), Mark::new(kind)));
    }
    let captures = re!(r#"(?i-u)^<(span|mark)\s+style=["']\s*(color|background(?:-color)?)\s*:\s*((?u-i:[^"';]+));?\s*["']\s*>$"#).captures(value)?;
    let tag = captures[1].to_ascii_lowercase();
    let property = captures[2].to_ascii_lowercase();
    let color = captures[3].trim();
    if !crate::html::safe_color(color)
        || (tag == "span" && property != "color")
        || (tag == "mark" && property == "color")
    {
        return None;
    }
    let mut mark = Mark::new(if tag == "span" {
        "textColor"
    } else {
        "highlight"
    });
    mark.attrs.insert("color".into(), string(color));
    Some((tag, mark))
}
/// An opening tag named `tag`, with attributes or without, as `findClose` of the TS reader reads
/// it: each one nests, so a mark ends at its own end tag, not at the end tag of a plain `<span>`
/// inside it (D-122).
fn opens(value: &str, tag: &str) -> bool {
    let Some(rest) = value.strip_prefix('<') else {
        return false;
    };
    if !rest
        .get(..tag.len())
        .is_some_and(|name| name.eq_ignore_ascii_case(tag))
    {
        return false;
    }
    let Some(inner) = rest[tag.len()..].strip_suffix('>') else {
        return false;
    };
    inner.is_empty() || inner.starts_with(char::is_whitespace) && !inner.contains('>')
}
fn plain_inline(node: &Node) -> String {
    if node.kind == "image" {
        String::new()
    } else if node.kind == "break" {
        // a line break is text: a link of a hard break alone is not empty
        "\n".into()
    } else if !node.value.is_empty() {
        node.value.clone()
    } else {
        node.children.iter().map(plain_inline).collect()
    }
}
/// "\r\n" and "\r" (of a character reference) are a line break of the text, as the
/// TypeScript reader reads them (D-94).
fn line_breaks(text: &str) -> std::borrow::Cow<'_, str> {
    if text.contains('\r') {
        text.replace("\r\n", "\n").replace('\r', "\n").into()
    } else {
        text.into()
    }
}
/// A mention's text is plain or formatted text: no HTML, images, references or other atoms.
fn plain_children(children: &[Node]) -> bool {
    children.iter().all(|child| match child.kind {
        "text" | "inlineCode" | "break" => true,
        "emphasis" | "strong" | "delete" => plain_children(&child.children),
        _ => false,
    })
}
/// What the reader needs besides the nodes: the source and the atoms it was asked for.
#[derive(Clone, Copy)]
pub(super) struct Read<'a> {
    pub source: &'a str,
    pub atoms: &'a MarkdownAtoms,
}
fn walk(children: &[Node], marks: &[Mark], read: Read, br: bool, out: &mut Inline) {
    let source = read.source;
    let line_break_pattern = re!(r"(?i-u)^<br[ \t]*/?>$");
    let mut i = 0;
    while i < children.len() {
        let n = &children[i];
        if n.kind == "html" {
            if let Some((tag, mark)) = paired(&n.value) {
                let close = format!("</{tag}>");
                let mut depth = 0;
                let mut found = None;
                for (j, item) in children.iter().enumerate().skip(i) {
                    if item.kind != "html" {
                        continue;
                    }
                    if opens(&item.value, &tag) {
                        depth += 1
                    } else if item.value.eq_ignore_ascii_case(&close) {
                        depth -= 1;
                        if depth == 0 {
                            found = Some(j);
                            break;
                        }
                    }
                }
                if let Some(end) = found.filter(|end| *end > i + 1) {
                    let mut nested = marks.to_vec();
                    nested.push(mark);
                    walk(&children[i + 1..end], &nested, read, br, out);
                    i = end + 1;
                    continue;
                }
            }
        }
        match n.kind {
            // a soft line break is a space of the text; a hard one is "\n"
            "text" => out.push(&line_breaks(&n.value), marks),
            "break" => out.push("\n", marks),
            "inlineCode" => {
                let mut nested = marks.to_vec();
                nested.push(Mark::new("code"));
                out.push(&line_breaks(&n.value), &nested)
            }
            "emphasis" | "strong" | "delete" => {
                let mut nested = marks.to_vec();
                nested.push(Mark::new(match n.kind {
                    "emphasis" => "italic",
                    "strong" => "bold",
                    _ => "strikethrough",
                }));
                walk(&n.children, &nested, read, br, out)
            }
            "link" if !plain_inline(n).is_empty() => {
                let mut nested = marks.to_vec();
                let mention = (read.atoms.mention && plain_children(&n.children))
                    .then_some(n.url.as_str())
                    .and_then(atoms::mention_of);
                if let Some((kind, id)) = mention {
                    let label = match n.title.as_deref() {
                        Some(title) if !title.is_empty() => title.to_owned(),
                        _ => atoms::mention_label(kind, &plain_inline(n)).to_owned(),
                    };
                    nested.push(
                        out.atom(
                            Mark::new("mention")
                                .with_attr("id", string(id))
                                .with_attr("kind", string(kind))
                                .with_attr("label", string(label)),
                        ),
                    );
                    walk(&n.children, &nested, read, br, out);
                } else {
                    let mut mark = Mark::new("link").with_attr("href", string(&n.url));
                    if let Some(title) = n.title.as_ref().filter(|t| !t.is_empty()) {
                        mark.attrs.insert("title".into(), string(title));
                    }
                    nested.push(mark);
                    walk(&n.children, &nested, read, br, out)
                }
            }
            // The grammar reads these two only when asked; the text is the source as written.
            "inlineMath" | "emoji" => {
                let mark = if n.kind == "inlineMath" {
                    Mark::new("inlineMath")
                } else {
                    let name = &n.value[1..n.value.len() - 1];
                    let src = read.atoms.custom_emoji.get(name).cloned();
                    Mark::new("customEmoji")
                        .with_attr("name", string(name))
                        .with_attr("src", string(src.unwrap_or_default()))
                };
                let mut nested = marks.to_vec();
                nested.push(out.atom(mark));
                out.push(&n.value, &nested);
            }
            "image" if read.atoms.inline_image && n.title.as_deref().unwrap_or("").is_empty() => {
                let mut nested = marks.to_vec();
                nested.push(
                    out.atom(
                        Mark::new("inlineImage")
                            .with_attr("src", string(&n.url))
                            .with_attr("alt", string(&n.value)),
                    ),
                );
                out.push(&atoms::image_text(&n.url, &n.value), &nested);
            }
            "html" if br && line_break_pattern.is_match(&n.value) => out.push("\n", marks),
            _ => {
                if let Some(text) = source.get(n.start..n.end) {
                    let mut nested = marks.to_vec();
                    nested.push(Mark::new("mdRaw"));
                    out.push(text, &nested)
                } else {
                    out.push(&n.plain(), marks)
                }
            }
        }
        i += 1;
    }
}
pub(super) fn inline(n: &Node, read: Read, br: bool) -> Inline {
    let mut out = Inline::default();
    walk(&n.children, &[], read, br, &mut out);
    out
}
