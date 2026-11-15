use super::{
    decode, definitions, lists,
    source::{self, width},
    syntax::*,
    Line, Node,
};
use std::collections::HashSet;
pub(super) struct Reader {
    pub references: HashSet<String>,
}
impl Reader {
    fn inline(&self, kind: &'static str, lines: &[Line], start: usize, end: usize) -> Node {
        let mut n = Node::new(kind, start, end);
        n.source = Some(source::source(lines));
        n
    }
    pub fn blocks(&mut self, lines: &[Line], depth: usize, task_prefix: usize) -> Vec<Node> {
        if depth > 64 && !lines.is_empty() {
            return vec![Node::text(
                "html",
                source::source(lines).text,
                lines[0].start,
                lines.last().unwrap().end,
            )];
        }
        let fence_info = re!(r"^(\S+)(?:[ \t]+(.*))?$");
        let closing_heading = re!(r"(?:^|[ \t]+)#+[ \t]*$");
        let quote_marker = re!(r"^ {0,3}>");
        let setext_marker = re!(r"^ {0,3}(=+|-+)[ \t]*$");
        let mut nodes = vec![];
        let mut i = 0;
        while i < lines.len() {
            let line = &lines[i];
            if line.blank() {
                i += 1;
                continue;
            }
            let start = line.start + line.text.bytes().take_while(|c| *c == b' ').count();
            if let Some(open) = opening_fence(&line.text) {
                let marker = &open[1];
                let indentation = line.text.find(marker).unwrap();
                let mut content = vec![];
                let mut next = i + 1;
                while next < lines.len() {
                    let t = lines[next].text.trim_start_matches(' ');
                    let indent = lines[next].text.len() - t.len();
                    let run = t.bytes().take_while(|c| *c == marker.as_bytes()[0]).count();
                    if indent <= 3
                        && run >= marker.len()
                        && t[run..].trim_matches([' ', '\t']).is_empty()
                    {
                        break;
                    }
                    content.push(lines[next].indent(indentation).text);
                    next += 1;
                }
                let info = decode::string(open[2].trim());
                let split = fence_info.captures(&info);
                let last = if next < lines.len() {
                    let n = next;
                    next += 1;
                    n
                } else {
                    i.max(next.saturating_sub(1))
                };
                let mut node = Node::text("code", content.join("\n"), start, lines[last].end);
                node.lang = split
                    .as_ref()
                    .and_then(|m| m.get(1))
                    .map(|m| m.as_str().into());
                node.meta = split
                    .as_ref()
                    .and_then(|m| m.get(2))
                    .map(|m| m.as_str().into());
                nodes.push(node);
                i = next;
                continue;
            }
            // `$$` … `$$`: the body is taken raw, without inline parsing. Without a closing
            // line the `$$` stays ordinary paragraph text.
            if let Some(end) = math_fence(&line.text)
                .then(|| (i + 1..lines.len()).find(|&next| math_fence(&lines[next].text)))
                .flatten()
            {
                let indentation = line.text.bytes().take_while(|c| *c == b' ').count();
                let body: Vec<String> = lines[i + 1..end]
                    .iter()
                    .map(|body| body.indent(indentation).text)
                    .collect();
                nodes.push(Node::text("math", body.join("\n"), start, lines[end].end));
                i = end + 1;
                continue;
            }
            if let Some(m) = atx(&line.text) {
                let raw = m.get(2).map_or("", |m| m.as_str());
                let prefix = m.get(0).unwrap().len() - raw.len();
                let value = closing_heading.replace(raw, "");
                // only spaces and tabs end the text: a no-break space at its end is text
                let value = value.trim_end_matches([' ', '\t']);
                let content = Line::new(
                    value,
                    line.start + prefix,
                    line.start + prefix + value.len(),
                );
                let mut n = self.inline("heading", &[content], start, line.end);
                n.level = m[1].len();
                nodes.push(n);
                i += 1;
                continue;
            }
            if thematic(&line.text) {
                nodes.push(Node::new("thematicBreak", start, line.end));
                i += 1;
                continue;
            }
            if quote(&line.text) > 0 {
                let mut quoted = vec![];
                let mut next = i;
                let mut lazy = false;
                while next < lines.len() {
                    let current = &lines[next];
                    let prefix = quote(&current.text);
                    if prefix > 0 {
                        let marker = quote_marker.find(&current.text).unwrap().end();
                        let unquoted = current.strip(marker).indent(usize::from(prefix > marker));
                        let mut inner = unquoted.clone();
                        for _ in 0..64 {
                            let q = quote(&inner.text);
                            if q > 0 {
                                inner = inner.strip(q)
                            } else if let Some(l) = list_marker(&inner.text, inner.column) {
                                inner = inner.strip(l.prefix)
                            } else {
                                break;
                            }
                        }
                        lazy = !inner.blank()
                            && width(&inner.text, inner.column) < 4
                            && !interrupts(&inner);
                        quoted.push(unquoted);
                    } else if lazy && !current.blank() && !interrupts(current) {
                        let mut line = current.clone();
                        line.lazy = true;
                        quoted.push(line)
                    } else {
                        break;
                    }
                    next += 1;
                }
                let mut n = Node::new("blockquote", start, lines[next - 1].end);
                n.children = self.blocks(&quoted, depth + 1, 0);
                nodes.push(n);
                i = next;
                continue;
            }
            if list_marker(&line.text, 0).is_some() {
                let (node, next) = lists::read(self, lines, i, depth);
                nodes.push(node);
                i = next;
                continue;
            }
            if let Some(html) = html_block(&line.text, false) {
                let mut next = i + 1;
                match &html {
                    HtmlEnd::Blank => {
                        while next < lines.len() && !lines[next].blank() {
                            next += 1
                        }
                    }
                    _ => {
                        if !html.done(&line.text) {
                            while next < lines.len() {
                                let done = html.done(&lines[next].text);
                                next += 1;
                                if done {
                                    break;
                                }
                            }
                        }
                    }
                }
                let last = &lines[next - 1];
                let trailing = if !matches!(html, HtmlEnd::Blank)
                    && !html.done(&last.text)
                    && next == lines.len()
                {
                    last.eol.as_str()
                } else {
                    ""
                };
                let value = lines[i..next]
                    .iter()
                    .map(|l| l.text.as_str())
                    .collect::<Vec<_>>()
                    .join("\n")
                    + trailing;
                nodes.push(Node::text("html", value, start, last.end + trailing.len()));
                i = next;
                continue;
            }
            if let Some((node, next)) = definitions::read(lines, i, &mut self.references) {
                nodes.push(node);
                i = next;
                continue;
            }
            if width(&line.text, 0) >= 4 {
                let mut content = vec![];
                let mut next = i;
                while next < lines.len()
                    && (lines[next].blank() || width(&lines[next].text, 0) >= 4)
                {
                    content.push(lines[next].indent(4));
                    next += 1;
                }
                while content.last().is_some_and(Line::blank) {
                    content.pop();
                    next -= 1;
                }
                nodes.push(Node::text(
                    "code",
                    content
                        .iter()
                        .map(|l| l.text.as_str())
                        .collect::<Vec<_>>()
                        .join("\n"),
                    line.start + 4.min(line.text.bytes().take_while(|c| *c == b' ').count()),
                    content.last().unwrap().end,
                ));
                i = next;
                continue;
            }
            if i + 1 < lines.len() && line.text.contains('|') {
                if let Some(alignment) =
                    alignment(&lines[i + 1].text).filter(|a| a.len() == cells(&line.text).len())
                {
                    let mut node = Node::new("table", start, line.end);
                    node.align = alignment;
                    node.children.push(self.row(line, node.align.len()));
                    let mut next = i + 2;
                    while next < lines.len() && !lines[next].blank() && !interrupts(&lines[next]) {
                        node.children.push(self.row(&lines[next], node.align.len()));
                        next += 1;
                    }
                    node.end = lines[next - 1].end;
                    nodes.push(node);
                    i = next;
                    continue;
                }
            }
            let mut paragraph = vec![if i == 0 && task_prefix > 0 {
                line.strip(task_prefix)
            } else {
                line.indent(3.min(width(&line.text, 0)))
            }];
            let mut next = i + 1;
            let mut setext = 0;
            while next < lines.len() && !lines[next].blank() {
                let current = &lines[next];
                if let Some(m) = setext_marker
                    .captures(&current.text)
                    .filter(|_| !current.lazy)
                {
                    setext = if m[1].starts_with('=') { 1 } else { 2 };
                    next += 1;
                    break;
                }
                if interrupts(current) && !current.lazy {
                    break;
                }
                paragraph.push(current.indent(width(&current.text, current.column)));
                next += 1;
            }
            // a task's text may start on the next line: the empty rest of the marker line is no
            // line of the paragraph, or its line ending would start the text with a space (D-91)
            if i == 0
                && task_prefix > 0
                && setext == 0
                && paragraph.len() > 1
                && paragraph[0].blank()
            {
                paragraph.remove(0);
            }
            let mut node = self.inline(
                if setext > 0 { "heading" } else { "paragraph" },
                &paragraph,
                start,
                lines[next - 1].end,
            );
            node.level = setext;
            nodes.push(node);
            i = next;
        }
        nodes
    }
    fn row(&self, line: &Line, columns: usize) -> Node {
        let mut node = Node::new("tableRow", line.start, line.end);
        for (text, from, to) in cells(&line.text).into_iter().take(columns) {
            let content = Line::new(&text, line.start + from, line.start + to);
            let mut cell = self.inline("tableCell", &[content], line.start + from, line.start + to);
            cell.in_cell = true;
            node.children.push(cell)
        }
        while node.children.len() < columns {
            node.children
                .push(Node::new("tableCell", line.end, line.end))
        }
        node
    }
}
fn cells(text: &str) -> Vec<(String, usize, usize)> {
    let mut cells = vec![];
    let mut from = 0;
    let mut p = 0;
    while p <= text.len() {
        if text.as_bytes().get(p) == Some(&b'\\') && p + 1 < text.len() {
            p += 1;
            p += text[p..].chars().next().unwrap().len_utf8();
            continue;
        }
        if p == text.len() || text.as_bytes()[p] == b'|' {
            let raw = &text[from..p];
            let lead = raw
                .bytes()
                .take_while(|c| *c == b' ' || *c == b'\t')
                .count();
            // only spaces and tabs: a no-break space at an edge is text
            let value = raw.trim_matches([' ', '\t']);
            cells.push((value.into(), from + lead, from + lead + value.len()));
            from = p + 1;
        }
        if p == text.len() {
            break;
        }
        p += text[p..].chars().next().unwrap().len_utf8();
    }
    if re!(r"^[ \t]*\|").is_match(text) {
        cells.remove(0);
    }
    if re!(r"\|[ \t]*$").is_match(text) && !re!(r"\\\|[ \t]*$").is_match(text) {
        cells.pop();
    }
    cells
}
fn alignment(text: &str) -> Option<Vec<Option<String>>> {
    if !text.contains('|') && !re!(r"^ {0,3}:?-+:?[ \t]*$").is_match(text) {
        return None;
    }
    let cells = cells(text);
    if cells.is_empty() || cells.iter().any(|(c, _, _)| !re!(r"^:?-+:?$").is_match(c)) {
        return None;
    }
    Some(
        cells
            .iter()
            .map(|(c, _, _)| {
                if c.starts_with(':') {
                    Some(if c.ends_with(':') { "center" } else { "left" }.into())
                } else if c.ends_with(':') {
                    Some("right".into())
                } else {
                    None
                }
            })
            .collect(),
    )
}
