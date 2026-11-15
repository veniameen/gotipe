//! The block structure of text that the writer checks what it writes against, as `@gotipe/markdown`
//! reads it (`readBlockNodes`): what a block that runs on to the end of the file needs to end
//! (D-106), and where the items of a list begin and end (D-107). Inline text is not read.
use super::{blocks::Reader, source, syntax, Node};
use std::collections::HashSet;

fn nodes(text: &str) -> Vec<Node> {
    Reader {
        references: HashSet::new(),
    }
    .blocks(&source::lines(text, 0), 0, 0)
}

/// Where the block that ends `text` starts when it takes in a paragraph after a blank line: a
/// fence or HTML that ends only at its own end and has none runs on to the end of the file.
fn runs_on_from(text: &str) -> Option<usize> {
    let probe = text.len() + 2;
    nodes(&format!("{text}\n\nx"))
        .last()
        .map(|node| node.start)
        .filter(|&start| start < probe)
}

/// The line that ends `text`, a block written where another block follows it (`closingLine` of
/// `serialization/closing.ts`): a block that the end of its file ended reads the next block as its
/// part. A fence gets the fence of its opening line, and HTML its end (`-->`, `?>`, `]]>`, `>`,
/// `</pre>`…) on a line of its own; "" for a block that ends by itself.
pub(crate) fn closing_line(text: &str) -> String {
    let opener = re!(r"(?:^|[\r\n]) {0,3}(?:`{3}|~{3}|<)");
    let Some(start) = opener.is_match(text).then(|| runs_on_from(text)).flatten() else {
        return String::new();
    };
    let opening = text[start..].split(['\r', '\n']).next().unwrap_or("");
    // a line feed after the lone `\r` that ends the text would join it into one line ending
    let line_break = if text.ends_with('\r') { "\r" } else { "\n" };
    let closer = if let Some(fence) = syntax::opening_fence(opening) {
        format!("{line_break}{}", &fence[1])
    } else if let Some(syntax::HtmlEnd::Literal(end, _)) = syntax::html_block(opening, false) {
        let eol = if text.ends_with(['\r', '\n']) {
            ""
        } else {
            "\n"
        };
        format!("{eol}{end}")
    } else {
        return String::new();
    };
    if runs_on_from(&format!("{text}{closer}")).is_none() {
        closer
    } else {
        String::new()
    }
}

/// Where the items of the one list that `text` holds begin and end; `None` for other blocks.
pub(crate) fn list_items(text: &str) -> Option<Vec<(usize, usize)>> {
    match nodes(text).as_slice() {
        [list] if list.kind == "list" => Some(
            list.children
                .iter()
                .map(|item| (item.start, item.end))
                .collect(),
        ),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_block_the_end_of_the_file_ended_gets_its_end() {
        assert_eq!(closing_line("```\nx"), "\n```");
        assert_eq!(closing_line("~~~~ js\nx\n"), "\n~~~~");
        assert_eq!(closing_line("<pre>\nx\n"), "</pre>");
        assert_eq!(closing_line("<PRE>\nx"), "\n</pre>");
        assert_eq!(closing_line("<!-- x"), "\n-->");
        assert_eq!(closing_line("<?php x\r\n"), "?>");
        assert_eq!(closing_line("<![CDATA[ x"), "\n]]>");
        assert_eq!(closing_line("```\rx\r"), "\r```");
        assert_eq!(closing_line("<!DOCTYPE x"), "\n>");
    }

    #[test]
    fn a_block_that_ends_by_itself_gets_nothing() {
        for text in [
            "```\nx\n```",
            "<pre>x</pre>",
            "<div>\nx",
            "    ```\n    x",
            "- a\n  ```\n  x",
            "> ```\n> x",
            "$$\nx",
            "a <b>",
        ] {
            assert_eq!(closing_line(text), "", "{text:?}");
        }
    }

    #[test]
    fn the_items_of_a_list_are_where_their_markers_are() {
        assert_eq!(list_items("- a\n\n  b\n- c"), Some(vec![(0, 8), (9, 12)]));
        assert_eq!(list_items("1. a\n2) b"), None);
        assert_eq!(list_items("a"), None);
    }
}
