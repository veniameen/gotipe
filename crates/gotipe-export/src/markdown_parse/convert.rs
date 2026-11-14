use super::{
    rich::{inline, Inline, Read},
    Node,
};
use gotipe_core::{AttrValue, Block, BlockContent, BlockId};
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
pub(super) fn string(value: impl Into<String>) -> AttrValue {
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
pub(super) fn block(n: &Node, read: Read) -> Block {
    let source = read.source;
    match n.kind {
        "paragraph" => {
            if n.children.len() == 1 {
                let only = &n.children[0];
                // An empty title keeps an inline image alone in its paragraph (atoms.rs).
                let inline_image = read.atoms.inline_image && only.title.as_deref() == Some("");
                if only.kind == "image" && !inline_image {
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
            rich("paragraph", inline(n, read, false))
        }
        "heading" => {
            let mut block = rich("heading", inline(n, read, true));
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
        "blockquote" => quote(n, read).unwrap_or_else(|| raw(n, source)),
        "list" => list(n, read).unwrap_or_else(|| raw(n, source)),
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
                            inline(c, read, true),
                        );
                        cell.attrs.clear();
                        cell
                    })
                    .collect();
                table.children.push(result)
            }
            table
        }
        // the writer's HTML table of merged cells comes back as a table
        "html" => source
            .get(n.start..n.end)
            .and_then(super::table_html::read)
            .unwrap_or_else(|| raw(n, source)),
        _ => raw(n, source),
    }
}
fn quote(n: &Node, read: Read) -> Option<Block> {
    let source = read.source;
    let para = n
        .children
        .first()
        .filter(|p| n.children.len() == 1 && p.kind == "paragraph")?;
    let mut r = inline(para, read, false);
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
fn nested_lists(item: &Node, from: usize, read: Read) -> Option<Vec<Block>> {
    item.children[from.min(item.children.len())..]
        .iter()
        .map(|nested| {
            if nested.kind == "list" {
                list(nested, read)
            } else {
                None
            }
        })
        .collect()
}
fn list(n: &Node, read: Read) -> Option<Block> {
    let source = read.source;
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
                let mut task = rich("todoItem", inline(p, read, false));
                task.children = nested_lists(item, 1, read)?;
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
            rich("listItem", inline(p, read, false))
        } else {
            node("listItem", BlockContent::RichText(vec![]))
        };
        child.children = nested_lists(item, index, read)?;
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
