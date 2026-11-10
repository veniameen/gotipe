use crate::{pdf::PdfOptions, ConvertError};
use gotipe_core::{AttrValue, Block, BlockContent, Document, Mark};

fn quoted(text: &str) -> String {
    format!(
        "\"{}\"",
        text.replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t")
    )
}
fn attr<'a>(block: &'a Block, key: &str) -> &'a str {
    match block.attrs.get(key) {
        Some(AttrValue::String(value)) => value,
        _ => "",
    }
}
fn number(block: &Block, key: &str, fallback: usize) -> usize {
    match block.attrs.get(key) {
        Some(AttrValue::Number(n)) if n.is_finite() && *n >= 0.0 => *n as usize,
        _ => fallback,
    }
}
fn mark(text: String, mark: &Mark) -> String {
    match mark.mark_type.as_str() {
        "bold" => format!("#strong[{text}]"),
        "italic" => format!("#emph[{text}]"),
        "underline" => format!("#underline[{text}]"),
        "strikethrough" => format!("#strike[{text}]"),
        "superscript" => format!("#super[{text}]"),
        "subscript" => format!("#sub[{text}]"),
        "code" => format!("#text(font: \"DejaVu Sans Mono\")[{text}]"),
        "textColor" | "highlight" => {
            let value = match mark.attrs.get("color") {
                Some(AttrValue::String(value)) => value.as_str(),
                _ => "yellow",
            };
            let color = crate::document_checks::color_hex(value).unwrap_or_else(|| "ffff00".into());
            let function = if mark.mark_type == "textColor" {
                "text"
            } else {
                "highlight"
            };
            format!("#{function}(fill:rgb(\"#{color}\"))[{text}]")
        }
        "link" => match mark.attrs.get("href") {
            Some(AttrValue::String(url)) if crate::safe_url(url) => {
                format!("#link({})[{text}]", quoted(url))
            }
            _ => text,
        },
        _ => text,
    }
}
fn content(block: &Block) -> String {
    match &block.content {
        BlockContent::RichText(spans) => spans
            .iter()
            .map(|span| {
                let mut text = format!("#text({})", quoted(&span.text));
                for style in &span.marks {
                    text = mark(text, style)
                }
                text
            })
            .collect(),
        BlockContent::Raw(raw) => format!("#text({})", quoted(raw)),
        BlockContent::Empty => String::new(),
    }
}
fn blocks(blocks: &[Block]) -> Result<String, ConvertError> {
    blocks.iter().map(block).collect()
}
fn table(node: &Block) -> Result<String, ConvertError> {
    // Each slot records the first row no longer occupied by a preceding span.
    // Physical cell counts do not describe a table with merged cells.
    let mut occupied = Vec::<usize>::new();
    let mut columns = 0;
    let mut cells = Vec::new();
    for (y, row) in node.children.iter().enumerate() {
        let mut x = 0;
        for cell in &row.children {
            while occupied.get(x).is_some_and(|end| *end > y) {
                x += 1;
            }
            let colspan = number(cell, "colspan", 1).clamp(1, 100);
            let rowspan = number(cell, "rowspan", 1).clamp(1, 100);
            let end = x.checked_add(colspan).ok_or_else(|| {
                ConvertError::Encoding("PDF table column count is too large".into())
            })?;
            if occupied.iter().skip(x).take(colspan).any(|end| *end > y) {
                return Err(ConvertError::Encoding("Overlapping PDF table spans".into()));
            }
            occupied.resize(occupied.len().max(end), 0);
            occupied[x..end].fill(y + rowspan);
            cells.push(format!(
                "table.cell(x:{x},y:{y},colspan:{colspan},rowspan:{rowspan})[{}{}]",
                content(cell),
                blocks(&cell.children)?
            ));
            x = end;
            columns = columns.max(end);
        }
    }
    if columns == 0 {
        return Ok(String::new());
    }
    Ok(format!("#table(columns:{columns},{})\n", cells.join(",")))
}
fn block(node: &Block) -> Result<String, ConvertError> {
    let text = content(node);
    let nested = blocks(&node.children)?;
    Ok(match node.block_type.as_str() {
        "paragraph" => format!("{text}\n\n{nested}"),
        "heading" => format!(
            "#heading(level: {})[{text}]\n{nested}",
            number(node, "level", 1).clamp(1, 6)
        ),
        "bulletList" | "orderedList" | "todoList" => {
            let items = node
                .children
                .iter()
                .map(|item| {
                    Ok(format!(
                        "[{}{}{}]",
                        if node.block_type == "todoList" {
                            format!(
                                "{} {}",
                                if matches!(item.attrs.get("checked"), Some(AttrValue::Bool(true)))
                                {
                                    "☑"
                                } else {
                                    "☐"
                                },
                                content(item)
                            )
                        } else {
                            content(item)
                        },
                        if item.children.is_empty() {
                            ""
                        } else {
                            "#parbreak()"
                        },
                        blocks(&item.children)?
                    ))
                })
                .collect::<Result<Vec<_>, ConvertError>>()?
                .join(",");
            if node.block_type == "orderedList" {
                format!(
                    "#enum(start: {},{items})\n",
                    number(node, "start", 1).max(1)
                )
            } else {
                format!("#list({items})\n")
            }
        }
        "listItem" | "todoItem" | "tableCell" | "tableHeader" => format!("{text}{nested}"),
        "codeBlock" => {
            let raw = match &node.content {
                BlockContent::Raw(s) => s.clone(),
                _ => crate::plaintext::block_text(node),
            };
            format!(
                "#raw({},block:true,lang:{})\n",
                quoted(&raw),
                quoted(attr(node, "language"))
            )
        }
        "blockquote" => format!("#quote(block:true)[{text}{nested}]\n"),
        "divider" => "#line(length:100%)\n".into(),
        "image" => {
            let image = crate::assets::image(node)?;
            let width = number(node, "width", image.width as usize).clamp(1, 8192) as f64 * 0.75;
            let bytes = image
                .png
                .iter()
                .map(u8::to_string)
                .collect::<Vec<_>>()
                .join(",");
            let caption = attr(node, "caption");
            format!("#layout(size => image(bytes(({bytes})),width:calc.min(size.width,{width}pt),alt:{}))\n#text({})\n\n",quoted(attr(node,"alt")),quoted(caption))
        }
        "table" => table(node)?,
        "tableRow" => nested,
        "toggle" | "callout" => format!("#block(inset:8pt,stroke:0.5pt)[{text}{nested}]\n"),
        "columns" => format!(
            "#grid(columns:{},{})\n",
            node.children.len().max(1),
            node.children
                .iter()
                .map(|col| Ok(format!("[{}]", block(col)?)))
                .collect::<Result<Vec<_>, ConvertError>>()?
                .join(",")
        ),
        "column" => format!("{text}{nested}"),
        "math" | "markdownRaw" => format!("{text}\n{nested}"),
        "file" | "embed" => {
            let url = attr(node, "url");
            let label = if attr(node, "name").is_empty() {
                url
            } else {
                attr(node, "name")
            };
            if !crate::safe_url(url) {
                return Err(ConvertError::Encoding("Unsafe attachment URL".into()));
            }
            format!("#link({})[#text({})]\n", quoted(url), quoted(label))
        }
        other => return Err(ConvertError::UnsupportedBlockType(other.into())),
    })
}
pub(crate) fn document_source(
    doc: &Document,
    options: &PdfOptions,
) -> Result<String, ConvertError> {
    crate::document_checks::validate_marks(&doc.blocks)?;
    if !["a4", "letter", "legal"].contains(&options.page_size.as_str())
        || !options.font_size.is_finite()
        || options.font_size < 1.0
        || options.font_size > 100.0
    {
        return Err(ConvertError::Encoding(
            "Invalid PDF page size or font size".into(),
        ));
    }
    let m = &options.margin;
    if [m.top, m.right, m.bottom, m.left]
        .iter()
        .any(|v| !v.is_finite() || *v < 0.0 || *v > 200.0)
    {
        return Err(ConvertError::Encoding("Invalid PDF margin".into()));
    }
    let mut source=format!("#set page({},margin:(top:{}pt,right:{}pt,bottom:{}pt,left:{}pt))\n#set text(font:(\"Libertinus Serif\",\"Noto Emoji\"),size:{}pt)\n",quoted(&options.page_size),m.top,m.right,m.bottom,m.left,options.font_size);
    if let Some(header) = &options.header_template {
        source.push_str(&format!("#set page(header: text({}))\n", quoted(header)))
    }
    if let Some(footer) = &options.footer_template {
        source.push_str(&format!("#set page(footer: text({}))\n", quoted(footer)))
    }
    source.push_str(&blocks(&doc.blocks)?);
    Ok(source)
}
