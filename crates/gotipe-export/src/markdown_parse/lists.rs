use super::{
    blocks::Reader,
    source::width,
    syntax::{interrupts, list_marker, thematic, Marker},
    Line, Node,
};
fn compatible(a: &Marker, b: &Marker) -> bool {
    a.ordered == b.ordered && a.marker == b.marker
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
                next += 1;
                continue;
            }
            if list_marker(&line.text, 0).is_some() || separated || interrupts(line) {
                break;
            }
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
