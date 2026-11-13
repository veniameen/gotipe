use super::Node;
use gotipe_core::{AttrValue, Block, BlockContent, BlockId, Mark, TextSpan};
use std::collections::HashMap;
fn node(kind: &str, content: BlockContent) -> Block {
    Block {
        id: BlockId::new(),
        block_type: kind.into(),
        attrs: HashMap::new(),
        content,
        children: vec![],
    }
}
fn string(value: impl Into<String>) -> AttrValue {
    AttrValue::String(value.into())
}
fn raw(n: &Node, source: &str) -> Block {
    let mut block = node(
        "markdownRaw",
        BlockContent::Raw(source.get(n.start..n.end).unwrap_or(&n.value).into()),
    );
    block.attrs.insert("kind".into(), string(n.kind));
    block
}
#[derive(Default)]
struct Inline {
    spans: Vec<TextSpan>,
    hard: bool,
    soft: bool,
}
impl Inline {
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
    fn attrs(&self) -> HashMap<String, AttrValue> {
        if self.hard && !self.soft {
            HashMap::from([("breaks".into(), string("hard"))])
        } else {
            HashMap::new()
        }
    }
    fn text(&self) -> String {
        self.spans.iter().map(|s| s.text.as_str()).collect()
    }
    fn trim(&mut self, mut count: usize) {
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
fn plain_inline(node: &Node) -> String {
    if node.kind == "image" || node.kind == "break" {
        String::new()
    } else if !node.value.is_empty() {
        node.value.clone()
    } else {
        node.children.iter().map(plain_inline).collect()
    }
}
fn walk(children: &[Node], marks: &[Mark], source: &str, br: bool, out: &mut Inline) {
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
                    if paired(&item.value).is_some_and(|(nested, _)| nested == tag) {
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
                    walk(&children[i + 1..end], &nested, source, br, out);
                    i = end + 1;
                    continue;
                }
            }
        }
        match n.kind {
            "text" => {
                out.soft |= n.value.contains('\n');
                out.push(&n.value, marks)
            }
            "break" => {
                out.hard = true;
                out.push("\n", marks)
            }
            "inlineCode" => {
                let mut nested = marks.to_vec();
                nested.push(Mark::new("code"));
                out.push(&n.value, &nested)
            }
            "emphasis" | "strong" | "delete" => {
                let mut nested = marks.to_vec();
                nested.push(Mark::new(match n.kind {
                    "emphasis" => "italic",
                    "strong" => "bold",
                    _ => "strikethrough",
                }));
                walk(&n.children, &nested, source, br, out)
            }
            "link" if !plain_inline(n).is_empty() => {
                let mut nested = marks.to_vec();
                let mut mark = Mark::new("link").with_attr("href", string(&n.url));
                if let Some(title) = n.title.as_ref().filter(|t| !t.is_empty()) {
                    mark.attrs.insert("title".into(), string(title));
                }
                nested.push(mark);
                walk(&n.children, &nested, source, br, out)
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
fn inline(n: &Node, source: &str, br: bool) -> Inline {
    let mut out = Inline::default();
    walk(&n.children, &[], source, br, &mut out);
    out
}
fn rich(kind: &str, r: Inline) -> Block {
    let attrs = r.attrs();
    let mut block = node(kind, BlockContent::RichText(r.spans));
    block.attrs = attrs;
    block
}
fn math(value: &str) -> Block {
    let mut block = node("math", BlockContent::Raw(value.into()));
    block.attrs.insert("display".into(), string("block"));
    block
}
pub(super) fn block(n: &Node, source: &str) -> Block {
    match n.kind {
        "paragraph" => {
            if n.children.len() == 1 {
                let only = &n.children[0];
                if only.kind == "image" {
                    let mut block = node("image", BlockContent::Empty);
                    block.attrs = HashMap::from([
                        ("src".into(), string(&only.url)),
                        ("alt".into(), string(&only.value)),
                        (
                            "caption".into(),
                            string(only.title.as_deref().unwrap_or("")),
                        ),
                    ]);
                    return block;
                }
                if only.kind == "link" {
                    if let Some(name) = file_name(only) {
                        let mut block = node("file", BlockContent::Empty);
                        block.attrs = HashMap::from([
                            ("url".into(), string(&only.url)),
                            ("name".into(), string(name)),
                        ]);
                        return block;
                    }
                }
            }
            rich("paragraph", inline(n, source, false))
        }
        "heading" => {
            let mut block = rich("heading", inline(n, source, true));
            block.attrs = HashMap::from([("level".into(), AttrValue::Number(n.level as f64))]);
            block
        }
        "thematicBreak" => node("divider", BlockContent::Empty),
        // A `$$` block or a ```` ```math ```` fence: the editor's formula block.
        "math" => math(&n.value),
        "code" if n.lang.as_deref() == Some("math") && n.meta.is_none() => math(&n.value),
        "code" => {
            let mut block = node("codeBlock", BlockContent::Raw(n.value.clone()));
            block
                .attrs
                .insert("language".into(), string(n.lang.as_deref().unwrap_or("")));
            if let Some(meta) = &n.meta {
                block.attrs.insert("meta".into(), string(meta));
            }
            block
        }
        "blockquote" => quote(n, source).unwrap_or_else(|| raw(n, source)),
        "list" => list(n, source).unwrap_or_else(|| raw(n, source)),
        "table" => {
            let mut table = node("table", BlockContent::Empty);
            table.attrs.insert(
                "align".into(),
                AttrValue::Array(
                    n.align
                        .iter()
                        .map(|a| a.as_ref().map_or(AttrValue::Null, string))
                        .collect(),
                ),
            );
            for (index, row) in n.children.iter().enumerate() {
                let mut result = node("tableRow", BlockContent::Empty);
                result.children = row
                    .children
                    .iter()
                    .map(|c| {
                        let mut cell = rich(
                            if index == 0 {
                                "tableHeader"
                            } else {
                                "tableCell"
                            },
                            inline(c, source, true),
                        );
                        cell.attrs.clear();
                        cell
                    })
                    .collect();
                table.children.push(result)
            }
            table
        }
        _ => raw(n, source),
    }
}
fn quote(n: &Node, source: &str) -> Option<Block> {
    let para = n
        .children
        .first()
        .filter(|p| n.children.len() == 1 && p.kind == "paragraph")?;
    let mut r = inline(para, source, false);
    let first = para.children.first();
    let text = r.text();
    if let Some(first) = first.filter(|f| f.kind == "text") {
        if let Some(m) =
            re!(r"(?i-u)^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)").captures(&text)
        {
            if source
                .get(first.start..)
                .is_some_and(|s| s.starts_with("[!"))
                && r.spans
                    .first()
                    .is_some_and(|s| s.marks.is_empty() && s.text.len() >= m[0].len())
            {
                r.trim(m[0].len());
                let mut block = rich("callout", r);
                block
                    .attrs
                    .insert("type".into(), string(m[1].to_lowercase()));
                block
                    .attrs
                    .insert("alert".into(), string(m[1].to_uppercase()));
                return Some(block);
            }
        }
    }
    Some(rich("blockquote", r))
}
fn task(item: &Node, source: &str) -> Option<bool> {
    item.checked.or_else(|| {
        let p = item.children.first().filter(|p| {
            item.children.len() == 1
                && p.kind == "paragraph"
                && p.children.len() == 1
                && p.children[0].kind == "text"
        })?;
        match source.get(p.children[0].start..p.children[0].end)? {
            "[ ]" => Some(false),
            "[x]" | "[X]" => Some(true),
            _ => None,
        }
    })
}
/// The lists nested in an item after its first `from` children; `None` when anything else is.
fn nested_lists(item: &Node, from: usize, source: &str) -> Option<Vec<Block>> {
    item.children[from.min(item.children.len())..]
        .iter()
        .map(|nested| {
            if nested.kind == "list" {
                list(nested, source)
            } else {
                None
            }
        })
        .collect()
}
fn list(n: &Node, source: &str) -> Option<Block> {
    if n.children.is_empty() {
        return None;
    }
    let states: Vec<_> = n.children.iter().map(|i| task(i, source)).collect();
    let all = states.iter().all(Option::is_some);
    if !all && states.iter().any(Option::is_some) || all && n.ordered {
        return None;
    }
    let spread = n.spread || n.children.iter().any(|i| i.spread);
    let first = n.children[0].start;
    let mut result = node(
        if all {
            "todoList"
        } else if n.ordered {
            "orderedList"
        } else {
            "bulletList"
        },
        BlockContent::Empty,
    );
    result
        .attrs
        .insert("spread".into(), AttrValue::Bool(spread));
    for (index, item) in n.children.iter().enumerate() {
        if all {
            let mut child = if item.checked.is_none() {
                node("todoItem", BlockContent::RichText(vec![]))
            } else {
                // a task is one paragraph, then the lists nested under it
                let p = item.children.first().filter(|p| p.kind == "paragraph")?;
                let mut task = rich("todoItem", inline(p, source, false));
                task.children = nested_lists(item, 1, source)?;
                task
            };
            child.attrs.insert(
                "checked".into(),
                AttrValue::Bool(states[index] == Some(true)),
            );
            result.children.push(child);
            continue;
        }
        let mut index = 0;
        let mut child = if let Some(p) = item.children.first().filter(|p| p.kind == "paragraph") {
            index = 1;
            rich("listItem", inline(p, source, false))
        } else {
            node("listItem", BlockContent::RichText(vec![]))
        };
        child.children = nested_lists(item, index, source)?;
        result.children.push(child);
    }
    if n.ordered {
        result
            .attrs
            .insert("start".into(), AttrValue::Number(n.number as f64));
        let p = first
            + source[first..]
                .bytes()
                .take_while(u8::is_ascii_digit)
                .count();
        if let Some(c) = source
            .as_bytes()
            .get(p)
            .filter(|c| **c == b'.' || **c == b')')
        {
            result
                .attrs
                .insert("delimiter".into(), string((*c as char).to_string()));
        }
    } else if let Some(c) = source
        .as_bytes()
        .get(first)
        .filter(|c| **c == b'-' || **c == b'*' || **c == b'+')
    {
        result
            .attrs
            .insert("marker".into(), string((*c as char).to_string()));
    }
    Some(result)
}
fn file_name(n: &Node) -> Option<String> {
    if n.title.as_ref().is_some_and(|t| !t.is_empty())
        || n.url.is_empty()
        || re!(r"^[A-Za-z][A-Za-z0-9+.-]*:").is_match(&n.url)
        || n.url.starts_with('#')
        || n.url.starts_with("//")
        || n.children.len() != 1
        || n.children[0].kind != "text"
    {
        return None;
    }
    let name = &n.children[0].value;
    let base = n.url.split(['?', '#']).next()?.rsplit('/').next()?;
    let mut bytes = Vec::new();
    let mut p = 0;
    let mut valid = true;
    while p < base.len() {
        if base.as_bytes()[p] == b'%' {
            let hex = base.as_bytes().get(p + 1..p + 3);
            if let Some(hex) = hex.filter(|digits| digits.iter().all(u8::is_ascii_hexdigit)) {
                let value =
                    u8::from_str_radix(std::str::from_utf8(hex).expect("ASCII hexadecimal"), 16)
                        .expect("two hexadecimal digits");
                bytes.push(value);
                p += 3;
                continue;
            }
            valid = false;
            break;
        }
        bytes.push(base.as_bytes()[p]);
        p += 1;
    }
    let decoded = if valid {
        String::from_utf8(bytes).unwrap_or_else(|_| base.into())
    } else {
        base.into()
    };
    if !name.is_empty() && *name == decoded {
        Some(name.clone())
    } else {
        None
    }
}
