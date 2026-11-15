//! Reads back the HTML table the writer gives a table with merged cells
//! (`markdown/table_html.rs`): a `<table>` with one `<tr>`, `<th>` or `<td>` per line, spans,
//! `text-align` and the writer's inline tags. Anything else stays raw HTML: the table read is
//! written again and must give the same bytes. As `packages/markdown/src/table-html-read.ts`.
use gotipe_core::{AttrValue, Block, BlockContent, BlockId, Mark, TextSpan};
use std::collections::HashMap;

use super::convert::string;
use crate::markdown::table_html::{has_merged_cells, table_html};

/// Marks from the outermost tag in: the order the writer nests them.
const RANK: [&str; 10] = [
    "link",
    "textColor",
    "highlight",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "superscript",
    "subscript",
    "code",
];

fn decode(raw: &str) -> Option<String> {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(index) = rest.find(['&', '<', '>', '"']) {
        out.push_str(&rest[..index]);
        rest = &rest[index..];
        if !rest.starts_with('&') {
            return None;
        }
        let end = rest.find(';')?;
        out.push(match &rest[1..end] {
            "amp" => '&',
            "lt" => '<',
            "gt" => '>',
            "quot" => '"',
            _ => return None,
        });
        rest = &rest[end + 1..];
    }
    out.push_str(rest);
    Some(out)
}

fn mark(kind: &str, attrs: &[(&str, String)]) -> Mark {
    Mark {
        mark_type: kind.into(),
        attrs: attrs
            .iter()
            .map(|(key, value)| ((*key).into(), string(value.clone())))
            .collect(),
    }
}

/// The mark a tag opens and the tag's name.
fn open_tag(tag: &str) -> Option<(Mark, &'static str)> {
    let plain = [
        ("<strong>", "bold", "strong"),
        ("<em>", "italic", "em"),
        ("<u>", "underline", "u"),
        ("<s>", "strikethrough", "s"),
        ("<sup>", "superscript", "sup"),
        ("<sub>", "subscript", "sub"),
        ("<code>", "code", "code"),
        ("<mark>", "highlight", "mark"),
    ];
    if let Some((_, kind, name)) = plain.iter().find(|(text, _, _)| *text == tag) {
        return Some((mark(kind, &[]), name));
    }
    if let Some(found) = re!(r#"^<a href="([^"]*)">$"#).captures(tag) {
        let href = decode(&found[1]).filter(|href| !href.is_empty())?;
        return Some((mark("link", &[("href", href)]), "a"));
    }
    let found = re!(r#"^<(span|mark) style="(color|background-color):([^"]*)">$"#).captures(tag)?;
    let span = &found[1] == "span";
    if span != (&found[2] == "color") || !crate::html::safe_color(&found[3]) {
        return None;
    }
    let color = vec![("color", found[3].to_owned())];
    Some(if span {
        (mark("textColor", &color), "span")
    } else {
        (mark("highlight", &color), "mark")
    })
}

/// A cell's inline HTML: text with its marks. A `<span>` without attributes holds text kept
/// verbatim (`mdRaw`, D-103): text and line breaks, no tags.
fn read_inline(html: &str) -> Option<Vec<TextSpan>> {
    let mut spans: Vec<TextSpan> = Vec::new();
    let mut stack: Vec<(Mark, &str)> = Vec::new();
    let mut verbatim = false;
    let mut i = 0;
    while i < html.len() {
        let rest = &html[i..];
        let tag = if verbatim { "</span>" } else { "<span>" };
        if rest.starts_with(tag) {
            i += tag.len();
            verbatim = !verbatim;
            continue;
        }
        if verbatim && rest.starts_with('<') && !rest.starts_with("<br>") {
            return None;
        }
        if let Some(close) = rest.strip_prefix("</") {
            let end = close.find('>')?;
            let (_, name) = stack.pop()?;
            if &close[..end] != name {
                return None;
            }
            i += end + 3;
            continue;
        }
        if rest.starts_with('<') && !rest.starts_with("<br>") {
            let end = rest.find('>')?;
            stack.push(open_tag(&rest[..=end])?);
            i += end + 1;
            continue;
        }
        // a run of text and line breaks up to the next tag
        let mut stop = i;
        while stop < html.len() {
            let tail = &html[stop..];
            if tail.starts_with("<br>") {
                stop += 4;
            } else if tail.starts_with('<') {
                break;
            } else {
                stop += tail.chars().next().map_or(1, char::len_utf8);
            }
        }
        let text = decode(&html[i..stop].replace("<br>", "\n"))?;
        let mut marks: Vec<Mark> = stack.iter().map(|(mark, _)| mark.clone()).collect();
        marks.sort_by_key(|mark| RANK.iter().position(|kind| *kind == mark.mark_type));
        if verbatim {
            marks.push(mark("mdRaw", &[]));
        }
        match spans.last_mut() {
            Some(last) if last.marks == marks => last.text.push_str(&text),
            _ => spans.push(TextSpan { text, marks }),
        }
        i = stop;
    }
    (stack.is_empty() && !verbatim).then_some(spans)
}

fn block(kind: &str, attrs: HashMap<String, AttrValue>, content: BlockContent) -> Block {
    Block {
        id: BlockId::new(),
        block_type: kind.into(),
        attrs,
        content,
        children: Vec::new(),
    }
}

/// The writer's table in `source`, or none when it is not one.
pub(super) fn read(source: &str) -> Option<Block> {
    let eol = if source.starts_with("<table>\r\n") {
        "\r\n"
    } else if source.starts_with("<table>\n") {
        "\n"
    } else {
        return None;
    };
    let second = &source[7 + eol.len()..];
    let indent = &second[..second.len() - second.trim_start_matches([' ', '\t']).len()];
    let newline = format!("{eol}{indent}");
    let lines: Vec<&str> = source.split(newline.as_str()).collect();
    if lines.first() != Some(&"<table>") || lines.last() != Some(&"</table>") {
        return None;
    }
    let cell_line = re!(
        r#"^<(th|td)((?: colspan="\d+")?(?: rowspan="\d+")?(?: style="text-align:(?:left|center|right)")?)>(.*)</(th|td)>$"#
    );
    let colspan = re!(r#"colspan="(\d+)""#);
    let rowspan = re!(r#"rowspan="(\d+)""#);
    let text_align = re!(r"text-align:([a-z]+)");
    // rows of (cell, its text-align)
    let mut rows: Vec<Vec<(Block, Option<String>)>> = Vec::new();
    let mut open = false;
    for line in &lines[1..lines.len() - 1] {
        match *line {
            "<tr>" if !open => {
                rows.push(Vec::new());
                open = true;
            }
            "</tr>" if open => open = false,
            _ if open => {
                let found = cell_line.captures(line)?;
                if found[1] != found[4] {
                    return None;
                }
                let mut attrs = HashMap::new();
                for (name, pattern) in [("colspan", colspan), ("rowspan", rowspan)] {
                    if let Some(value) = pattern.captures(&found[2]) {
                        attrs.insert(name.into(), AttrValue::Number(value[1].parse().ok()?));
                    }
                }
                let style = text_align
                    .captures(&found[2])
                    .map(|value| value[1].to_owned());
                let kind = if &found[1] == "th" {
                    "tableHeader"
                } else {
                    "tableCell"
                };
                let content = BlockContent::RichText(read_inline(&found[3])?);
                rows.last_mut()?.push((block(kind, attrs, content), style));
            }
            _ => return None,
        }
    }
    if open || rows.is_empty() {
        return None;
    }
    let number = |cell: &Block, name: &str| match cell.attrs.get(name) {
        Some(AttrValue::Number(value)) => *value as usize,
        _ => 1,
    };
    // the column each cell starts in, as HTML lays the table out
    let mut starts: Vec<Vec<usize>> = Vec::new();
    let mut occupied: Vec<usize> = Vec::new();
    let mut columns = 0;
    for (y, row) in rows.iter().enumerate() {
        let mut x = 0;
        let mut list = Vec::new();
        for (cell, _) in row {
            while occupied.get(x).is_some_and(|end| *end > y) {
                x += 1;
            }
            let span = number(cell, "colspan").max(1);
            if occupied.len() < x + span {
                occupied.resize(x + span, 0);
            }
            occupied[x..x + span].fill(y + number(cell, "rowspan").max(1));
            list.push(x);
            x += span;
            columns = columns.max(x);
        }
        starts.push(list);
    }
    // A column is aligned when every cell starting in it has a `text-align`: the most frequent
    // one (the first on a tie); a cell that differs keeps its own. A cell without one means the
    // column is not aligned, and every aligned cell in it keeps its own.
    let mut align = Vec::new();
    for x in 0..columns {
        let entries: Vec<(usize, usize)> = (0..rows.len())
            .flat_map(|y| {
                let starts = &starts[y];
                (0..rows[y].len())
                    .filter(move |i| starts[*i] == x)
                    .map(move |i| (y, i))
            })
            .collect();
        let style = |(y, i): (usize, usize)| rows[y][i].1.clone();
        let mut column: Option<String> = None;
        if !entries.is_empty() && entries.iter().all(|entry| style(*entry).is_some()) {
            let count = |value: &Option<String>| {
                entries
                    .iter()
                    .filter(|entry| &style(**entry) == value)
                    .count()
            };
            for entry in &entries {
                let value = style(*entry);
                if column.is_none() || count(&value) > count(&column) {
                    column = value;
                }
            }
        }
        for (y, i) in entries {
            if let Some(own) = rows[y][i]
                .1
                .clone()
                .filter(|own| Some(own) != column.as_ref())
            {
                rows[y][i].0.attrs.insert("align".into(), string(own));
            }
        }
        align.push(column.map_or(AttrValue::Null, string));
    }
    let mut table = block(
        "table",
        HashMap::from([("align".into(), AttrValue::Array(align))]),
        BlockContent::Empty,
    );
    table.children = rows
        .into_iter()
        .map(|row| {
            let mut result = block("tableRow", HashMap::new(), BlockContent::Empty);
            result.children = row.into_iter().map(|(cell, _)| cell).collect();
            result
        })
        .collect();
    // a table without merged cells is written as a pipe table: this HTML is someone else's
    (has_merged_cells(&table) && table_html(&table, &newline) == source).then_some(table)
}
