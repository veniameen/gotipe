//! Markdown has no syntax for merged cells, so a table with a `colspan`/`rowspan` above 1 is
//! written as an HTML `<table>` block: spans, cells and text survive. Inline marks become HTML
//! tags; a mark without a tag of its own (a mention, a custom emoji, an unknown mark) keeps only
//! its text, and text kept verbatim (`mdRaw`) stands as text in a `<span>` of its own. Each cell
//! is one line, so a blank line never ends the HTML block early. Byte for byte the TS writer
//! (`packages/markdown/src/serialization/table-html.ts`).
use gotipe_core::{AttrValue, Block, BlockContent, Mark};

use crate::html::{escape_html, safe_color, safe_href, string_or};

use crate::table_span::cell_span;

pub(crate) fn has_merged_cells(table: &Block) -> bool {
    table.children.iter().any(|row| {
        row.children
            .iter()
            .any(|cell| cell_span(cell, "colspan") > 1 || cell_span(cell, "rowspan") > 1)
    })
}

/// Tags from the innermost out; the order is fixed, not the order of a span's marks.
const ORDER: [&str; 10] = [
    "code",
    "subscript",
    "superscript",
    "strikethrough",
    "underline",
    "italic",
    "bold",
    "highlight",
    "textColor",
    "link",
];

fn color(mark: &Mark) -> Option<&str> {
    match mark.attrs.get("color") {
        Some(AttrValue::String(color)) if safe_color(color) => Some(color),
        _ => None,
    }
}

fn tags(marks: &[Mark]) -> (String, String) {
    let (mut open, mut close) = (String::new(), String::new());
    for kind in ORDER {
        let Some(mark) = marks.iter().find(|mark| mark.mark_type == kind) else {
            continue;
        };
        let (tag, attrs) = match kind {
            "code" => ("code", String::new()),
            "subscript" => ("sub", String::new()),
            "superscript" => ("sup", String::new()),
            "strikethrough" => ("s", String::new()),
            "underline" => ("u", String::new()),
            "italic" => ("em", String::new()),
            "bold" => ("strong", String::new()),
            "link" => match safe_href(&string_or(mark.attrs.get("href"), "")) {
                Some(href) => ("a", format!(" href=\"{}\"", escape_html(&href))),
                None => continue,
            },
            "textColor" => match color(mark) {
                Some(color) => ("span", format!(" style=\"color:{color}\"")),
                None => continue,
            },
            _ => (
                "mark",
                color(mark)
                    .map(|color| format!(" style=\"background-color:{color}\""))
                    .unwrap_or_default(),
            ),
        };
        open = format!("<{tag}{attrs}>{open}");
        close.push_str(&format!("</{tag}>"));
    }
    (open, close)
}

/// One cell's text. Text kept verbatim (`mdRaw`) is Markdown, which HTML does not read: it is
/// written as text inside a `<span>` of its own and read back verbatim (D-103).
fn cell_html(content: &BlockContent) -> String {
    let BlockContent::RichText(spans) = content else {
        return String::new();
    };
    let mut html = String::new();
    let mut wrap: Option<(String, String)> = None;
    let mut verbatim = false;
    for span in spans.iter().filter(|span| !span.text.is_empty()) {
        let next = tags(&span.marks);
        if wrap.as_ref().map(|(open, _)| open) != Some(&next.0) {
            if std::mem::take(&mut verbatim) {
                html.push_str("</span>");
            }
            if let Some((_, close)) = wrap.take() {
                html.push_str(&close);
            }
            html.push_str(&next.0);
            wrap = Some(next);
        }
        let raw = span.marks.iter().any(|mark| mark.mark_type == "mdRaw");
        if raw != verbatim {
            html.push_str(if raw { "<span>" } else { "</span>" });
            verbatim = raw;
        }
        let text = span.text.replace("\r\n", "\n").replace('\r', "\n");
        html.push_str(&escape_html(&text).replace('\n', "<br>"));
    }
    if verbatim {
        html.push_str("</span>");
    }
    if let Some((_, close)) = wrap {
        html.push_str(&close);
    }
    html
}

/// The table as HTML lines joined by `newline`.
pub(crate) fn table_html(table: &Block, newline: &str) -> String {
    let align: &[AttrValue] = match table.attrs.get("align") {
        Some(AttrValue::Array(values)) => values,
        _ => &[],
    };
    let mut occupied: Vec<usize> = Vec::new();
    let mut text = String::from("<table>");
    for (y, row) in table.children.iter().enumerate() {
        text.push_str(newline);
        text.push_str("<tr>");
        let mut x = 0;
        for cell in &row.children {
            while occupied.get(x).is_some_and(|end| *end > y) {
                x += 1;
            }
            let columns = cell_span(cell, "colspan");
            let rows = cell_span(cell, "rowspan");
            let side = match cell.attrs.get("align") {
                Some(AttrValue::String(own))
                    if matches!(own.as_str(), "left" | "center" | "right") =>
                {
                    Some(own.as_str())
                }
                _ => match align.get(x) {
                    Some(AttrValue::String(side)) => Some(side.as_str()),
                    _ => None,
                },
            };
            let tag = if cell.block_type == "tableHeader" {
                "th"
            } else {
                "td"
            };
            let mut attrs = String::new();
            if columns > 1 {
                attrs.push_str(&format!(" colspan=\"{columns}\""));
            }
            if rows > 1 {
                attrs.push_str(&format!(" rowspan=\"{rows}\""));
            }
            if let Some(side @ ("left" | "center" | "right")) = side {
                attrs.push_str(&format!(" style=\"text-align:{side}\""));
            }
            text.push_str(&format!(
                "{newline}<{tag}{attrs}>{}</{tag}>",
                cell_html(&cell.content)
            ));
            if occupied.len() < x + columns {
                occupied.resize(x + columns, 0);
            }
            occupied[x..x + columns].fill(y + rows);
            x += columns;
        }
        text.push_str(newline);
        text.push_str("</tr>");
    }
    text.push_str(newline);
    text.push_str("</table>");
    text
}
