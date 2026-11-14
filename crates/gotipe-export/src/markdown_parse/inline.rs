use super::{
    atoms, decode,
    links::{self, Context},
    syntax, Node, Source,
};
#[derive(Clone)]
struct Delimiter {
    marker: char,
    count: usize,
    open: bool,
    close: bool,
    start: usize,
    end: usize,
}
#[derive(Clone)]
enum Token {
    Node(Box<Node>),
    Delimiter(Delimiter),
}
impl Token {
    fn node(node: Node) -> Self {
        Self::Node(Box::new(node))
    }
}
fn ws(c: Option<char>) -> bool {
    c.is_none_or(char::is_whitespace)
}
fn punctuation(c: Option<char>) -> bool {
    c.is_some_and(|c| re!(r"[\p{P}\p{S}]").is_match(&c.to_string()))
}
fn delimiter(text: &str, start: usize, count: usize) -> Delimiter {
    let marker = text.as_bytes()[start] as char;
    let before = text[..start].chars().next_back();
    let after = text[start + count..].chars().next();
    let left = !ws(after) && (!punctuation(after) || ws(before) || punctuation(before));
    let right = !ws(before) && (!punctuation(before) || ws(after) || punctuation(after));
    Delimiter {
        marker,
        count,
        start,
        end: start + count,
        open: left && (marker != '_' || !right || punctuation(before)),
        close: right && (marker != '_' || !left || punctuation(after)),
    }
}
fn to_node(token: Token, source: &Source) -> Node {
    match token {
        Token::Node(n) => *n,
        Token::Delimiter(d) => Node::text(
            "text",
            d.marker.to_string().repeat(d.count),
            source.point(d.start),
            source.point(d.end),
        ),
    }
}
fn coalesce(nodes: Vec<Node>) -> Vec<Node> {
    let mut out: Vec<Node> = vec![];
    for n in nodes {
        if let Some(last) = out
            .last_mut()
            .filter(|last| last.kind == "text" && n.kind == "text" && last.end == n.start)
        {
            last.value.push_str(&n.value);
            last.end = n.end;
        } else {
            out.push(n)
        }
    }
    out
}
fn resolve(mut tokens: Vec<Token>, source: &Source) -> Vec<Node> {
    let mut budget = source.text.len() * 12 + 100;
    let mut closer = 0;
    while closer < tokens.len() && budget > 0 {
        let Token::Delimiter(mut end) = tokens[closer].clone() else {
            closer += 1;
            continue;
        };
        if !end.close {
            closer += 1;
            continue;
        }
        let mut matched = false;
        for opener in (0..closer).rev() {
            if budget == 0 {
                break;
            }
            budget -= 1;
            let Token::Delimiter(mut start) = tokens[opener].clone() else {
                continue;
            };
            if !start.open || start.marker != end.marker {
                continue;
            }
            if start.marker == '~' && start.count != end.count {
                continue;
            }
            if start.marker != '~'
                && (start.close || end.open)
                && (start.count + end.count) % 3 == 0
                && (start.count % 3 != 0 || end.count % 3 != 0)
            {
                continue;
            }
            let size = if start.count >= 2 && end.count >= 2 {
                2
            } else {
                1
            };
            let mut node = Node::new(
                if start.marker == '~' {
                    "delete"
                } else if size == 2 {
                    "strong"
                } else {
                    "emphasis"
                },
                source.point(start.end - size),
                source.point(end.start + size),
            );
            node.children = coalesce(
                tokens[opener + 1..closer]
                    .iter()
                    .cloned()
                    .map(|t| to_node(t, source))
                    .collect(),
            );
            start.count -= size;
            start.end -= size;
            end.count -= size;
            end.start += size;
            let mut replacement = vec![];
            if start.count > 0 {
                replacement.push(Token::Delimiter(start))
            }
            replacement.push(Token::node(node));
            if end.count > 0 {
                replacement.push(Token::Delimiter(end.clone()))
            }
            let len = replacement.len();
            tokens.splice(opener..=closer, replacement);
            closer = opener + len - usize::from(end.count > 0);
            matched = true;
            break;
        }
        if !matched {
            closer += 1;
        }
    }
    coalesce(tokens.into_iter().map(|t| to_node(t, source)).collect())
}
fn decoded(nodes: Vec<Node>, context: &Context) -> Vec<Node> {
    let mut out = vec![];
    for mut node in nodes {
        if ["emphasis", "strong", "delete"].contains(&node.kind) {
            node.children = decoded(node.children, context);
            out.push(node);
            continue;
        }
        if node.kind != "text" || !node.value.contains(['@', ':']) && !node.value.contains("www.") {
            out.push(node);
            continue;
        }
        let source = Source {
            text: node.value.clone(),
            offsets: vec![],
        };
        let mut from = 0;
        let mut p = 0;
        let mut result = vec![];
        while p < source.text.len() {
            if let Some((mut found, end)) = links::autolink(&source, p, context, true) {
                if p > from {
                    result.push(Node::text(
                        "text",
                        &source.text[from..p],
                        usize::MAX,
                        usize::MAX,
                    ))
                }
                found.start = usize::MAX;
                found.end = usize::MAX;
                for c in &mut found.children {
                    c.start = usize::MAX;
                    c.end = usize::MAX
                }
                result.push(found);
                from = end;
                p = end;
            } else {
                p += source.text[p..].chars().next().unwrap().len_utf8();
            }
        }
        if result.is_empty() {
            out.push(node)
        } else {
            if from < source.text.len() {
                result.push(Node::text(
                    "text",
                    &source.text[from..],
                    usize::MAX,
                    usize::MAX,
                ))
            }
            out.extend(result)
        }
    }
    out
}
fn push(tokens: &mut Vec<Token>, source: &Source, value: &str, start: usize, end: usize) {
    if value.is_empty() {
        return;
    }
    if let Some(Token::Node(previous)) = tokens.last_mut() {
        if previous.kind == "text" && previous.end == source.point(start) {
            previous.value.push_str(value);
            previous.end = source.point(end);
            return;
        }
    }
    tokens.push(Token::node(Node::text(
        "text",
        value,
        source.point(start),
        source.point(end),
    )))
}
pub(super) fn read(source: &Source, context: &Context, depth: usize) -> Vec<Node> {
    let text = &source.text;
    if depth > 64 {
        return vec![Node::text(
            "text",
            text,
            source.point(0),
            source.point(text.len()),
        )];
    }
    let mut tokens = vec![];
    let mut p = 0;
    while p < text.len() {
        if !context.consume() {
            push(&mut tokens, source, &text[p..], p, text.len());
            break;
        }
        let c = text[p..].chars().next().unwrap();
        let after = text.get(p + c.len_utf8()..).and_then(|s| s.chars().next());
        if c == '\\' {
            if after == Some('\n') {
                tokens.push(Token::node(Node::new(
                    "break",
                    source.point(p),
                    source.point(p + 2),
                )));
                p += 2;
                while text
                    .as_bytes()
                    .get(p)
                    .is_some_and(|c| *c == b' ' || *c == b'\t')
                {
                    p += 1
                }
                continue;
            }
            if decode::punctuation(after) {
                push(&mut tokens, source, &text[p + 1..p + 2], p, p + 2);
                p += 2;
                continue;
            }
        }
        if c == '&' {
            if let Some((value, len)) = decode::reference(&text[p..]) {
                push(&mut tokens, source, &value, p, p + len);
                p += len;
                continue;
            }
        }
        if c == '`' {
            let count = text[p..].bytes().take_while(|c| *c == b'`').count();
            let mut end = p + count;
            let mut close = None;
            while end < text.len() {
                let Some(next) = text[end..].find('`') else {
                    break;
                };
                end += next;
                let n = text[end..].bytes().take_while(|c| *c == b'`').count();
                if n == count {
                    close = Some(end);
                    break;
                }
                end += n;
            }
            if let Some(close) = close {
                // CommonMark: line endings of a code span are spaces, then one space is
                // stripped from each side of content that is not all spaces
                let mut value = text[p + count..close].replace('\n', " ");
                if value.len() > 1
                    && value.starts_with(' ')
                    && value.ends_with(' ')
                    && value.chars().any(|c| c != ' ')
                {
                    value = value[1..value.len() - 1].to_owned()
                }
                let value = if context.in_cell {
                    value.replace("\\|", "|")
                } else {
                    value
                };
                end = close + count;
                tokens.push(Token::node(Node::text(
                    "inlineCode",
                    value,
                    source.point(p),
                    source.point(end),
                )));
                p = end;
                continue;
            }
            push(&mut tokens, source, &text[p..p + count], p, p + count);
            p += count;
            continue;
        }
        if c == '$' && context.atoms.inline_math {
            // A run of dollars is text; a single one may open a formula (see `math_end`).
            let run = text[p..].bytes().take_while(|b| *b == b'$').count();
            let close = Some(p).filter(|_| run == 1);
            if let Some(close) = close.and_then(|open| atoms::math_end(text, open)) {
                // A cell writes `|` as `\|`, as in inline code.
                let value = &text[p + 1..close];
                let value = if context.in_cell {
                    value.replace("\\|", "|")
                } else {
                    value.into()
                };
                tokens.push(Token::node(Node::text(
                    "inlineMath",
                    value,
                    source.point(p),
                    source.point(close + 1),
                )));
                p = close + 1;
            } else {
                push(&mut tokens, source, &text[p..p + run], p, p + run);
                p += run;
            }
            continue;
        }
        if c == ':' && !context.atoms.custom_emoji.is_empty() {
            if let Some(len) = atoms::emoji_at(text, p, &context.atoms.custom_emoji) {
                tokens.push(Token::node(Node::text(
                    "emoji",
                    &text[p..p + len],
                    source.point(p),
                    source.point(p + len),
                )));
                p += len;
                continue;
            }
        }
        if c == '[' || c == '!' && after == Some('[') {
            if let Some((node, end)) = links::read(source, p, context, depth) {
                tokens.push(Token::node(node));
                p = end;
                continue;
            }
        }
        if c == '<' {
            if let Some((node, end)) = links::autolink(source, p, context, false) {
                tokens.push(Token::node(node));
                p = end;
                continue;
            }
            if let Some(len) = syntax::inline_html(&text[p..]) {
                tokens.push(Token::node(Node::text(
                    "html",
                    &text[p..p + len],
                    source.point(p),
                    source.point(p + len),
                )));
                p += len;
                continue;
            }
        }
        if c == '*' || c == '_' || c == '~' {
            let count = text[p..].chars().take_while(|ch| *ch == c).count();
            if c != '~' || count <= 2 {
                tokens.push(Token::Delimiter(delimiter(text, p, count)))
            } else {
                push(&mut tokens, source, &text[p..p + count], p, p + count)
            }
            p += count;
            continue;
        }
        if c == ' ' || c == '\t' {
            let mut end = p + 1;
            while text
                .as_bytes()
                .get(end)
                .is_some_and(|c| *c == b' ' || *c == b'\t')
            {
                end += 1
            }
            if text.as_bytes().get(end) == Some(&b'\n') {
                // two spaces make a hard break; otherwise a soft one, which is a space
                if text[p..end].ends_with("  ") {
                    tokens.push(Token::node(Node::new(
                        "break",
                        source.point(p),
                        source.point(end + 1),
                    )))
                } else {
                    push(&mut tokens, source, " ", p, end + 1)
                }
                p = end + 1;
                while text
                    .as_bytes()
                    .get(p)
                    .is_some_and(|c| *c == b' ' || *c == b'\t')
                {
                    p += 1
                }
                continue;
            }
            if end == text.len() && !context.preserve_trailing {
                break;
            }
            push(&mut tokens, source, &text[p..end], p, end);
            p = end;
            continue;
        }
        if c == '\n' {
            // a soft line break is a space; the next line's indentation is not text
            let mut end = p + 1;
            while text
                .as_bytes()
                .get(end)
                .is_some_and(|c| *c == b' ' || *c == b'\t')
            {
                end += 1
            }
            push(&mut tokens, source, " ", p, end);
            p = end;
            continue;
        }
        let len = c.len_utf8();
        push(
            &mut tokens,
            source,
            if c == '\0' { "�" } else { &text[p..p + len] },
            p,
            p + len,
        );
        p += len;
    }
    decoded(resolve(tokens, source), context)
}
