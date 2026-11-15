use super::{
    blocks::Reader,
    source::width,
    syntax::{interrupts, list_marker, thematic, Marker},
    Line, Node,
};
fn compatible(a: &Marker, b: &Marker) -> bool {
    a.ordered == b.ordered && a.marker == b.marker
}

/// How the content of an item or a quote reads a lazy line, as `lazyReading` of the TS reader.
#[derive(PartialEq, Debug)]
pub(super) enum Lazy {
    /// Text of a paragraph open before it: the only block a lazy line continues in CommonMark.
    Text,
    /// The start of the item's block at this index.
    Start(usize),
    /// Code, a table, a block nested deeper.
    Other,
}

const DEFINITIONS: [&str; 2] = ["definition", "footnoteDefinition"];

/// How `nodes`, the content of an item, read a lazy line that starts at `offset`. A definition
/// is read out of paragraph text, so a line right after one continues that text, whatever block
/// it starts here.
pub(super) fn lazy_reading(nodes: &[Node], offset: usize, top: bool) -> Lazy {
    let Some(at) = nodes
        .partition_point(|node| node.start <= offset)
        .checked_sub(1)
    else {
        return Lazy::Other;
    };
    let node = &nodes[at];
    if node.start == offset {
        if at > 0 && DEFINITIONS.contains(&nodes[at - 1].kind) {
            return Lazy::Text;
        }
        return if top { Lazy::Start(at) } else { Lazy::Other };
    }
    if node.end < offset {
        return Lazy::Other;
    }
    match node.kind {
        // blocks read from paragraph text: a lazy line is never the first line of an ATX heading
        "paragraph" | "heading" | "definition" | "footnoteDefinition" => Lazy::Text,
        "list" | "listItem" | "blockquote" => lazy_reading(&node.children, offset, false),
        _ => Lazy::Other,
    }
}

pub(super) fn read(
    reader: &mut Reader,
    lines: &[Line],
    start: usize,
    depth: usize,
) -> (Node, usize) {
    let task_marker = re!(r"^\[([ xX])\](?:[ \t]|$)");
    let initial = list_marker(&lines[start].text, 0).unwrap();
    let mut node = Node::new(
        "list",
        lines[start].start + lines[start].text.bytes().take_while(|c| *c == b' ').count(),
        lines[start].end,
    );
    node.ordered = initial.ordered;
    node.number = initial.start;
    let mut cursor = start;
    while cursor < lines.len() {
        let first = &lines[cursor];
        let Some(marker) = list_marker(&first.text, first.column)
            .filter(|m| compatible(&initial, m) && !thematic(&first.text))
        else {
            break;
        };
        let mut item_lines = vec![first
            .strip(marker.marker_width)
            .indent(marker.indent - marker.marker_width)];
        let spread_before = node.spread;
        // the first line of each run of lazy lines: its index in the item and in `lines`
        let mut lazy_runs: Vec<(usize, usize)> = vec![];
        let mut run = false;
        let mut next = cursor + 1;
        let mut separated = false;
        let mut item_spread = false;
        let mut item_end = first.end;
        while next < lines.len() {
            let line = &lines[next];
            if line.blank() {
                let mut after = next + 1;
                while after < lines.len() && lines[after].blank() {
                    after += 1
                }
                if after == lines.len() {
                    break;
                }
                let following = &lines[after];
                if list_marker(&following.text, 0).is_some_and(|m| {
                    compatible(&initial, &m) && width(&following.text, 0) < marker.indent
                }) {
                    node.spread = true;
                    next = after;
                    break;
                }
                if item_lines.iter().all(Line::blank) || width(&following.text, 0) < marker.indent {
                    break;
                }
                separated = true;
                item_spread = true;
                let mut empty = line.clone();
                empty.text.clear();
                empty.start = line.end;
                item_lines.push(empty);
                next += 1;
                continue;
            }
            if width(&line.text, 0) >= marker.indent {
                item_lines.push(line.indent(marker.indent));
                item_end = line.end;
                run = false;
                next += 1;
                continue;
            }
            if list_marker(&line.text, 0).is_some() || separated || interrupts(line) {
                break;
            }
            // lazy continuation of the item's initial paragraph, checked once the item is read
            if !run {
                lazy_runs.push((item_lines.len(), next));
            }
            run = true;
            let mut lazy = line.indent(width(&line.text, line.column));
            lazy.lazy = true;
            item_lines.push(lazy);
            item_end = line.end;
            next += 1;
        }
        let task = task_marker.captures(&item_lines[0].text);
        let prefix = task.as_ref().map_or(0, |m| m.get(0).unwrap().len());
        let checked = task.as_ref().map(|m| m[1].eq_ignore_ascii_case("x"));
        let mut content = reader.blocks(&item_lines, depth + 1, prefix);
        // A lazy line continues the paragraph the item has open. Where the item reads it
        // otherwise — after an empty item or a heading, in code or a table — the item ends
        // before it, as in CommonMark (D-101); its blocks before that line read the same
        // without it.
        for (at, stray) in lazy_runs {
            let reading = lazy_reading(&content, item_lines[at].start, true);
            if reading == Lazy::Text {
                continue;
            }
            item_lines.truncate(at);
            match reading {
                Lazy::Start(index) => content.truncate(index),
                _ => content = reader.blocks(&item_lines, depth + 1, prefix),
            }
            item_end = item_lines.last().map_or(first.end, |line| line.end);
            item_spread = false;
            node.spread = spread_before;
            next = stray;
            break;
        }
        if checked.is_some() && content.is_empty() {
            content.push(Node::new(
                "paragraph",
                item_lines[0].start,
                item_lines[0].end,
            ));
        }
        let mut item = Node::new(
            "listItem",
            first.start + first.text.bytes().take_while(|c| *c == b' ').count(),
            item_end,
        );
        item.checked = checked;
        item.spread = item_spread;
        item.children = content;
        node.children.push(item);
        node.end = item_end;
        cursor = next;
    }
    (node, cursor)
}
