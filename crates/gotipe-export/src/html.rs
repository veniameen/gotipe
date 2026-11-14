//! Canonical HTML. For the same document and options the output is byte-identical to
//! `serializeHtml` in @gotipe/core, which `editor.getHTML()` uses on both engines;
//! `tests/fixtures/html-parity.json` holds the cases both test suites check.
mod atoms;
mod js;
mod safety;
mod sanitizer;
mod styles;
mod text_style;

use gotipe_core::{AttrValue, Block, BlockContent, Document, Mark, TextSpan};

use crate::{ConvertError, ExportOptions};
use safety::escape;
pub(crate) use safety::safe_color;
// the Markdown writer's HTML table of merged cells (markdown/table_html.rs)
#[cfg(feature = "markdown")]
pub(crate) use js::string_or;
#[cfg(feature = "markdown")]
pub(crate) use safety::{escape as escape_html, safe_href};
pub use sanitizer::HtmlSanitizer;

struct Options<'a> {
    class_prefix: Option<&'a str>,
    inline_styles: bool,
}

/// Convert a Document to an HTML fragment: one element per block, separated by newlines.
pub fn to_html(doc: &Document, options: &ExportOptions) -> Result<String, ConvertError> {
    let class_prefix = options.class_prefix.as_deref();
    if let Some(prefix) = class_prefix {
        let mut bytes = prefix.bytes();
        let identifier = bytes
            .next()
            .is_some_and(|b| b.is_ascii_alphabetic() || b == b'_')
            && bytes.all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
        if !identifier {
            return Err(ConvertError::InvalidOptions(
                "classPrefix must be a non-empty CSS identifier prefix".into(),
            ));
        }
    }
    let options = Options {
        class_prefix,
        inline_styles: options.inline_styles,
    };
    Ok(join(&doc.blocks, &options))
}

fn join(blocks: &[Block], options: &Options) -> String {
    blocks
        .iter()
        .map(|block| render_block(block, options))
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_block(block: &Block, options: &Options) -> String {
    let html = block_to_html(block, options);
    if options.class_prefix.is_none() && !options.inline_styles {
        return html;
    }
    decorate(html, block, options)
}

/// Adds the block class and neutral style to the first opening tag, as the TS serializer does.
fn decorate(html: String, block: &Block, options: &Options) -> String {
    let bytes = html.as_bytes();
    if bytes.first() != Some(&b'<') || !bytes.get(1).is_some_and(u8::is_ascii_lowercase) {
        return html;
    }
    let name_end = 1 + bytes[1..]
        .iter()
        .take_while(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        .count();
    let Some(close) = html[name_end..].find('>').map(|index| index + name_end) else {
        return html;
    };
    let mut attributes = html[name_end..close].to_owned();
    if let Some(prefix) = options.class_prefix {
        let class = escape(&format!("{prefix}{}", block.block_type));
        attributes = match attribute(&attributes, " class=\"") {
            Some((start, value, end)) => format!(
                "{} class=\"{value} {class}\"{}",
                &attributes[..start],
                &attributes[end..]
            ),
            None => format!("{attributes} class=\"{class}\""),
        };
    }
    if let Some(style) = styles::block_style(&block.block_type).filter(|_| options.inline_styles) {
        attributes = match attribute(&attributes, " style=\"") {
            Some((start, value, end)) => format!(
                "{} style=\"{style};{value}\"{}",
                &attributes[..start],
                &attributes[end..]
            ),
            None => format!("{attributes} style=\"{style}\""),
        };
    }
    format!("<{}{attributes}>{}", &html[1..name_end], &html[close + 1..])
}

/// The first `{needle}value"`: its start, the value and the index after the closing quote.
fn attribute<'a>(attributes: &'a str, needle: &str) -> Option<(usize, &'a str, usize)> {
    let start = attributes.find(needle)?;
    let value_start = start + needle.len();
    let length = attributes[value_start..].find('"')?;
    Some((
        start,
        &attributes[value_start..value_start + length],
        value_start + length + 1,
    ))
}

fn block_to_html(block: &Block, options: &Options) -> String {
    let inner = match &block.content {
        BlockContent::RichText(spans) => spans_to_html(spans),
        BlockContent::Raw(text) => escape(text),
        BlockContent::Empty => String::new(),
    };
    let children = join(&block.children, options);
    // Blocks that do not hold children in the editor schema still never lose them.
    let after = if children.is_empty() {
        String::new()
    } else {
        format!("\n{children}")
    };
    let attr = |name: &str| block.attrs.get(name);
    let optional = |name: &str, html: &dyn Fn(String) -> String| {
        if js::truthy(attr(name)) {
            html(escape(&js::string_or(attr(name), "")))
        } else {
            String::new()
        }
    };
    match block.block_type.as_str() {
        "paragraph" => format!(
            "<p{}{}>{inner}</p>{after}",
            text_style::direction(block),
            text_align(block)
        ),
        "heading" => {
            let level = js::number(attr("level")).trunc();
            let level = if level == 0.0 || level.is_nan() {
                1.0
            } else {
                level
            };
            let level = level.clamp(1.0, 6.0) as u8;
            format!(
                "<h{level}{}{}>{inner}</h{level}>{after}",
                text_style::direction(block),
                text_align(block)
            )
        }
        "bulletList" => format!("<ul>\n{children}\n</ul>"),
        "orderedList" => {
            let start = js::number(attr("start"));
            let start = if js::is_integer(start) && start != 1.0 {
                format!(" start=\"{}\"", js::number_to_string(start))
            } else {
                String::new()
            };
            format!("<ol{start}>\n{children}\n</ol>")
        }
        "listItem" => format!("<li{}>{inner}{after}</li>", text_style::direction(block)),
        "todoList" => format!("<ul class=\"todo-list\">\n{children}\n</ul>"),
        "todoItem" => {
            let checked = if js::truthy(attr("checked")) {
                " checked"
            } else {
                ""
            };
            format!(
                "<li{}><input type=\"checkbox\"{checked} disabled> {inner}{after}</li>",
                text_style::direction(block)
            )
        }
        "codeBlock" => {
            // Older documents store plain text as `plain`/`plaintext`; no language class.
            let plain = attr("language").map(js::string).is_some_and(|language| {
                language.eq_ignore_ascii_case("plain") || language.eq_ignore_ascii_case("plaintext")
            });
            let language = if plain {
                String::new()
            } else {
                optional("language", &|value| format!(" class=\"language-{value}\""))
            };
            format!("<pre><code{language}>{inner}</code></pre>{after}")
        }
        "blockquote" => format!("<blockquote>{inner}{after}</blockquote>"),
        "divider" => format!("<hr>{after}"),
        "callout" => {
            let emoji = optional("emoji", &|value| {
                format!("<span class=\"callout-emoji\">{value}</span>")
            });
            format!("<div class=\"callout\">{emoji}{inner}{after}</div>")
        }
        "image" => {
            let source = js::string_or(attr("src"), "");
            let src = escape(&safety::safe_image_src(&source).unwrap_or_default());
            let alt = escape(&js::string_or(attr("alt"), ""));
            let caption = optional("caption", &|value| {
                format!("<figcaption>{value}</figcaption>")
            });
            format!("<figure><img src=\"{src}\" alt=\"{alt}\">{caption}</figure>{after}")
        }
        "table" => format!("<table>\n{children}\n</table>"),
        "tableRow" => format!("<tr>\n{children}\n</tr>"),
        "tableHeader" => format!("<th{}>{inner}{children}</th>", cell_attributes(block)),
        "tableCell" => format!("<td{}>{inner}{children}</td>", cell_attributes(block)),
        "file" | "embed" => format!("{}{after}", attachment(block)),
        "toggle" => {
            let open = if js::truthy(attr("open")) {
                " open"
            } else {
                ""
            };
            format!("<details{open}><summary>{inner}</summary>\n{children}\n</details>")
        }
        "columns" => format!("<div class=\"columns\">\n{children}\n</div>"),
        "column" => format!("<div class=\"column\">\n{children}\n</div>"),
        _ if inner.is_empty() => children,
        _ => format!("<p>{inner}</p>{children}"),
    }
}

/// A file or embed: a paragraph with a link, labelled by its name or its address.
fn attachment(block: &Block) -> String {
    let present = |value: &&AttrValue| !matches!(value, AttrValue::Null);
    let address = ["url", "src"]
        .iter()
        .filter_map(|name| block.attrs.get(*name))
        .find(present);
    let href = safety::safe_href(&js::string_or(address, ""));
    let name = ["name", "title"]
        .iter()
        .filter_map(|name| block.attrs.get(*name))
        .filter(present)
        .map(js::string)
        .find(|value| !value.is_empty());
    let label = escape(&name.or_else(|| href.clone()).unwrap_or_default());
    match href {
        Some(href) => format!("<p><a href=\"{}\">{label}</a></p>", escape(&href)),
        None => format!("<p>{label}</p>"),
    }
}

/// `align` of a paragraph or heading (the `TextAlign` extension): one of four values.
fn text_align(block: &Block) -> String {
    match block.attrs.get("align") {
        Some(AttrValue::String(align))
            if matches!(align.as_str(), "left" | "center" | "right" | "justify") =>
        {
            format!(" style=\"text-align:{align}\"")
        }
        _ => String::new(),
    }
}

fn cell_attributes(block: &Block) -> String {
    let mut html = String::new();
    for name in ["colspan", "rowspan"] {
        let value = js::number(block.attrs.get(name));
        if js::is_integer(value) && value > 1.0 && value <= 1000.0 {
            html.push_str(&format!(" {name}=\"{}\"", js::number_to_string(value)));
        }
    }
    if let Some(AttrValue::String(align)) = block.attrs.get("align") {
        if matches!(align.as_str(), "left" | "center" | "right") {
            html.push_str(&format!(" style=\"text-align:{align}\""));
        }
    }
    html
}

/// `html` inside the elements of `marks`, the first innermost. Atomic marks add none.
fn wrap_marks(mut html: String, marks: &[&Mark]) -> String {
    for mark in marks {
        let color = match mark.attrs.get("color") {
            Some(AttrValue::String(color)) if safety::safe_color(color) => Some(color),
            _ => None,
        };
        html = match mark.mark_type.as_str() {
            "bold" => format!("<strong>{html}</strong>"),
            "italic" => format!("<em>{html}</em>"),
            "underline" => format!("<u>{html}</u>"),
            "strikethrough" => format!("<s>{html}</s>"),
            "code" => format!("<code>{html}</code>"),
            "superscript" => format!("<sup>{html}</sup>"),
            "subscript" => format!("<sub>{html}</sub>"),
            "link" => {
                let href = safety::safe_href(&js::string_or(mark.attrs.get("href"), ""));
                let title = mark.attrs.get("title");
                let title = if js::truthy(title) {
                    format!(" title=\"{}\"", escape(&js::string_or(title, "")))
                } else {
                    String::new()
                };
                match href {
                    Some(href) => format!("<a href=\"{}\"{title}>{html}</a>", escape(&href)),
                    None => html,
                }
            }
            "fontFamily" => text_style::font_family(mark, &html).unwrap_or(html),
            "fontSize" => text_style::font_size(mark, &html).unwrap_or(html),
            "textColor" => match color {
                Some(color) => format!("<span style=\"color:{color}\">{html}</span>"),
                None => html,
            },
            "highlight" => match color {
                Some(color) => format!("<mark style=\"background:{color}\">{html}</mark>"),
                None => format!("<mark>{html}</mark>"),
            },
            _ => html,
        };
    }
    html
}

fn span_html(span: &TextSpan, marks: &[&Mark]) -> String {
    wrap_marks(escape(&span.text).replace('\n', "<br>"), marks)
}

fn spans_to_html(spans: &[TextSpan]) -> String {
    let mut result = String::new();
    let mut i = 0;
    while i < spans.len() {
        let atom = atoms::atom_marks(&spans[i]);
        let mut j = i + 1;
        if let Some(first) = atom.first() {
            while j < spans.len() && atoms::atom_marks(&spans[j]) == atom {
                j += 1;
            }
            result.push_str(&atoms::atom_html(&spans[i..j], first));
        } else {
            result.push_str(&span_html(
                &spans[i],
                &spans[i].marks.iter().collect::<Vec<_>>(),
            ));
        }
        i = j;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::document_from_json;

    fn html(document: serde_json::Value) -> String {
        to_html(
            &document_from_json(&document.to_string()).unwrap(),
            &ExportOptions::default(),
        )
        .unwrap()
    }

    #[test]
    fn hard_breaks_captions_and_editor_image_sources_are_kept() {
        let output = html(serde_json::json!({"blocks": [
            {"id": "p", "type": "paragraph", "content": [{"text": "a\nb"}]},
            {"id": "i", "type": "image", "attrs": {"src": "data:image/webp;base64,UklGRg==", "caption": "Подпись"}},
            {"id": "r", "type": "image", "attrs": {"src": "images/a.png", "alt": "A"}}
        ]}));
        assert_eq!(
            output,
            "<p>a<br>b</p>\n<figure><img src=\"data:image/webp;base64,UklGRg==\" alt=\"\"><figcaption>Подпись</figcaption></figure>\n<figure><img src=\"images/a.png\" alt=\"A\"></figure>"
        );
    }

    #[test]
    fn unsafe_values_are_dropped_instead_of_failing() {
        let output = html(serde_json::json!({"blocks": [
            {"id": "f", "type": "file", "attrs": {"url": "javascript:alert(1)", "name": "x"}},
            {"id": "p", "type": "paragraph", "content": [{"text": "t", "marks": [
                {"type": "link", "attrs": {"href": "vbscript:x"}},
                {"type": "textColor", "attrs": {"color": "red;position:fixed"}}
            ]}]}
        ]}));
        assert_eq!(output, "<p>x</p>\n<p>t</p>");
    }

    #[test]
    fn options_add_classes_and_styles_to_the_first_tag() {
        let document = document_from_json(
            r#"{"blocks":[{"id":"c","type":"tableCell","attrs":{"align":"right"},"content":[{"text":"x"}]}]}"#,
        )
        .unwrap();
        let options = ExportOptions {
            inline_styles: true,
            class_prefix: Some("doc-".into()),
            ..ExportOptions::default()
        };
        assert_eq!(
            to_html(&document, &options).unwrap(),
            "<td style=\"padding:0.5em;border:1px solid #a0a0a0;vertical-align:top;text-align:right\" class=\"doc-tableCell\">x</td>"
        );
        let invalid = ExportOptions {
            class_prefix: Some("1x".into()),
            ..ExportOptions::default()
        };
        assert!(matches!(
            to_html(&document, &invalid),
            Err(ConvertError::InvalidOptions(_))
        ));
    }
}
