//! GoTipe OOXML renderer. ZIP framing belongs to the maintained codec.
mod package;
use crate::links::{Link, Targets};
use crate::ConvertError;
use gotipe_core::{AttrValue, Block, BlockContent, Document, TextSpan};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct DocxOptions {
    pub title: String,
    pub author: String,
    pub description: String,
}
struct Renderer {
    links: Vec<String>,
    images: Vec<Vec<u8>>,
    targets: Targets,
    /// Bookmark number of each linked block, in order of first use.
    bookmarks: HashMap<String, usize>,
}
fn attr<'a>(node: &'a Block, name: &str) -> &'a str {
    match node.attrs.get(name) {
        Some(AttrValue::String(s)) => s,
        _ => "",
    }
}
fn escape(value: &str) -> Result<String, ConvertError> {
    if value.chars().any(|c| !matches!(c, '\t' | '\n' | '\r' | '\u{20}'..='\u{d7ff}' | '\u{e000}'..='\u{fffd}' | '\u{10000}'..='\u{10ffff}')) {
        return Err(ConvertError::Encoding("Text contains an invalid XML character".into()));
    }
    Ok(value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
        .replace('\r', "&#13;"))
}
fn text_run(text: &str, properties: &str) -> Result<String, ConvertError> {
    let mut result = format!("<w:r><w:rPr>{properties}</w:rPr>");
    for (i, line) in text.split('\n').enumerate() {
        if i > 0 {
            result.push_str("<w:br/>");
        }
        for (j, part) in line.split('\t').enumerate() {
            if j > 0 {
                result.push_str("<w:tab/>");
            }
            result.push_str(&format!(
                "<w:t xml:space=\"preserve\">{}</w:t>",
                escape(part)?
            ));
        }
    }
    result.push_str("</w:r>");
    Ok(result)
}
// CT_RPr properties have a schema order and each occurs at most once.
type RunProperties = BTreeMap<u8, String>;
fn run(span: &TextSpan, base: &RunProperties) -> Result<String, ConvertError> {
    let mut properties = base.clone();
    for mark in &span.marks {
        let property = match mark.mark_type.as_str() {
            "bold" => (10, "<w:b/>".into()),
            "italic" => (20, "<w:i/>".into()),
            "underline" => (60, "<w:u w:val=\"single\"/>".into()),
            "strikethrough" => (30, "<w:strike/>".into()),
            "code" => (
                0,
                "<w:rFonts w:ascii=\"DejaVu Sans Mono\" w:hAnsi=\"DejaVu Sans Mono\"/>".into(),
            ),
            "superscript" => (80, "<w:vertAlign w:val=\"superscript\"/>".into()),
            "subscript" => (80, "<w:vertAlign w:val=\"subscript\"/>".into()),
            "textColor" | "highlight" => {
                let value = match mark.attrs.get("color") {
                    Some(AttrValue::String(s)) => s.as_str(),
                    _ => "yellow",
                };
                let color =
                    crate::document_checks::color_hex(value).unwrap_or_else(|| "ffff00".into());
                if mark.mark_type == "textColor" {
                    (40, format!("<w:color w:val=\"{color}\"/>"))
                } else {
                    (70, format!("<w:shd w:val=\"clear\" w:fill=\"{color}\"/>"))
                }
            }
            _ => continue,
        };
        properties.insert(property.0, property.1);
    }
    text_run(&span.text, &properties.into_values().collect::<String>())
}
impl Renderer {
    fn new(blocks: &[Block]) -> Self {
        Renderer {
            links: Vec::new(),
            images: Vec::new(),
            targets: Targets::new(blocks),
            bookmarks: HashMap::new(),
        }
    }
    /// A hyperlink to an absolute web/mail address or to a block of this document;
    /// other references stay text.
    fn link(&mut self, href: &str, content: String) -> Result<String, ConvertError> {
        match self.targets.link(href) {
            Some(Link::External(target)) => {
                escape(target)?;
                self.links.push(target.to_string());
                Ok(format!(
                    "<w:hyperlink r:id=\"link{}\">{content}</w:hyperlink>",
                    self.links.len()
                ))
            }
            Some(Link::Internal(id)) => {
                let number = self.bookmark(id);
                Ok(format!(
                    "<w:hyperlink w:anchor=\"gotipe_{number}\">{content}</w:hyperlink>"
                ))
            }
            None => Ok(content),
        }
    }
    fn bookmark(&mut self, id: &str) -> usize {
        let next = self.bookmarks.len() + 1;
        *self.bookmarks.entry(id.to_owned()).or_insert(next)
    }
    /// An empty bookmark where a linked block starts; Word accepts it between blocks.
    fn anchor(&mut self, node: &Block) -> String {
        if !self.targets.is_linked(&node.id.0) {
            return String::new();
        }
        let number = self.bookmark(&node.id.0);
        format!(
            "<w:bookmarkStart w:id=\"{number}\" w:name=\"gotipe_{number}\"/><w:bookmarkEnd w:id=\"{number}\"/>"
        )
    }
    fn paragraph(
        &mut self,
        node: &Block,
        depth: usize,
        prefix: &str,
    ) -> Result<String, ConvertError> {
        let mut ppr = String::new();
        let mut rpr = RunProperties::new();
        if node.block_type == "heading" {
            let level = match node.attrs.get("level") {
                Some(AttrValue::Number(n)) => *n as usize,
                _ => 1,
            }
            .clamp(1, 6);
            ppr.push_str(&format!("<w:pStyle w:val=\"Heading{level}\"/>"));
            rpr.insert(10, "<w:b/>".into());
            rpr.insert(50, format!("<w:sz w:val=\"{}\"/>", 48 - level * 4));
        }
        ppr.push_str(&format!("<w:ind w:left=\"{}\"/>", depth.min(20) * 360));
        if node.block_type == "codeBlock" {
            rpr.insert(
                0,
                "<w:rFonts w:ascii=\"DejaVu Sans Mono\" w:hAnsi=\"DejaVu Sans Mono\"/>".into(),
            );
        }
        let mut result = format!("<w:p><w:pPr>{ppr}</w:pPr>");
        if !prefix.is_empty() {
            result.push_str(&text_run(prefix, "")?);
        }
        match &node.content {
            BlockContent::RichText(spans) => {
                for span in spans {
                    let content = run(span, &rpr)?;
                    let href = span
                        .marks
                        .iter()
                        .find(|m| m.mark_type == "link")
                        .and_then(|m| m.attrs.get("href"));
                    match href {
                        Some(AttrValue::String(href)) => {
                            result.push_str(&self.link(href, content)?)
                        }
                        _ => result.push_str(&content),
                    }
                }
            }
            BlockContent::Raw(raw) => {
                result.push_str(&text_run(raw, &rpr.into_values().collect::<String>())?)
            }
            BlockContent::Empty => {}
        }
        result.push_str("</w:p>");
        Ok(result)
    }
    fn table(&mut self, node: &Block, depth: usize) -> Result<String, ConvertError> {
        let columns = node
            .children
            .iter()
            .map(|row| {
                row.children
                    .iter()
                    .map(|cell| match cell.attrs.get("colspan") {
                        Some(AttrValue::Number(n)) => (*n as usize).clamp(1, 100),
                        _ => 1,
                    })
                    .sum::<usize>()
            })
            .max()
            .unwrap_or(1);
        let mut result = String::from(
            "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr><w:tblGrid>",
        );
        for _ in 0..columns {
            result.push_str("<w:gridCol/>");
        }
        result.push_str("</w:tblGrid>");
        for row in &node.children {
            result.push_str("<w:tr>");
            result.push_str(&self.anchor(row));
            for cell in &row.children {
                if matches!(cell.attrs.get("rowspan"), Some(AttrValue::Number(n)) if *n > 1.0) {
                    return Err(ConvertError::Encoding(
                        "DOCX table row spans require explicit continuation cells".into(),
                    ));
                }
                result.push_str("<w:tc><w:tcPr>");
                if let Some(AttrValue::Number(n)) = cell.attrs.get("colspan") {
                    result.push_str(&format!(
                        "<w:gridSpan w:val=\"{}\"/>",
                        (*n as usize).clamp(1, 100)
                    ));
                }
                result.push_str("</w:tcPr>");
                result.push_str(&self.anchor(cell));
                result.push_str(&self.paragraph(cell, 0, "")?);
                result.push_str(&self.elements(&cell.children, depth)?);
                if cell
                    .children
                    .last()
                    .is_some_and(|child| child.block_type == "table")
                {
                    result.push_str("<w:p/>");
                }
                result.push_str("</w:tc>");
            }
            result.push_str("</w:tr>");
        }
        result.push_str("</w:tbl>");
        Ok(result)
    }
    fn image(&mut self, node: &Block, source: &str) -> Result<String, ConvertError> {
        let image = crate::assets::image(source)?;
        let requested = match node.attrs.get("width") {
            Some(AttrValue::Number(n)) if n.is_finite() && *n > 0.0 => *n,
            _ => image.width as f64,
        };
        let width = requested.clamp(1.0, 560.0);
        let cx = (width * 9525.0) as u64;
        let cy = (width * image.height as f64 / image.width as f64 * 9525.0) as u64;
        self.images.push(image.png);
        let id = self.images.len();
        let alt = escape(attr(node, "alt"))?;
        Ok(format!(
            r#"<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{id}" name="Image {id}" descr="{alt}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{id}" name="image{id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image{id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"#
        ))
    }
    fn elements(&mut self, nodes: &[Block], depth: usize) -> Result<String, ConvertError> {
        let mut result = String::new();
        for node in nodes {
            result.push_str(&self.anchor(node));
            match node.block_type.as_str() {
                "table" => result.push_str(&self.table(node, depth)?),
                "bulletList" | "orderedList" | "todoList" => {
                    let start = match node.attrs.get("start") {
                        Some(AttrValue::Number(n)) => *n as usize,
                        _ => 1,
                    };
                    for (i, item) in node.children.iter().enumerate() {
                        let prefix = match node.block_type.as_str() {
                            "orderedList" => format!("{}. ", start.saturating_add(i)),
                            "todoList"
                                if matches!(
                                    item.attrs.get("checked"),
                                    Some(AttrValue::Bool(true))
                                ) =>
                            {
                                "☑ ".into()
                            }
                            "todoList" => "☐ ".into(),
                            _ => "• ".into(),
                        };
                        result.push_str(&self.anchor(item));
                        result.push_str(&self.paragraph(item, depth, &prefix)?);
                        result.push_str(&self.elements(&item.children, depth + 1)?);
                    }
                }
                "columns" | "column" => {
                    if !node.is_empty() {
                        result.push_str(&self.paragraph(node, depth, "")?);
                    }
                    result.push_str(&self.elements(&node.children, depth)?);
                }
                "divider" => {
                    result.push_str(&format!("<w:p>{}</w:p>", text_run("────────────────", "")?))
                }
                "image" => {
                    // A placeholder without an uploaded image keeps only its caption.
                    if let Some(source) = crate::assets::source(node) {
                        result.push_str(&self.image(node, source)?);
                    }
                    if !attr(node, "caption").is_empty() {
                        result.push_str(&format!(
                            "<w:p>{}</w:p>",
                            text_run(attr(node, "caption"), "")?
                        ));
                    }
                }
                "file" | "embed" => {
                    let label = crate::links::attachment_label(node);
                    if !label.is_empty() {
                        let content = self.link(attr(node, "url"), text_run(&label, "")?)?;
                        result.push_str(&format!("<w:p>{content}</w:p>"));
                    }
                }
                "paragraph" | "heading" | "codeBlock" | "blockquote" | "callout" | "toggle"
                | "math" | "markdownRaw" | "listItem" | "todoItem" => {
                    result.push_str(&self.paragraph(node, depth, "")?);
                    result.push_str(&self.elements(
                        &node.children,
                        depth + usize::from(node.block_type == "blockquote"),
                    )?);
                }
                other => return Err(ConvertError::UnsupportedBlockType(other.into())),
            }
        }
        Ok(result)
    }
}
pub fn to_docx(doc: &Document, options: &DocxOptions) -> Result<Vec<u8>, ConvertError> {
    crate::document_checks::validate_marks(&doc.blocks)?;
    crate::assets::check_document_images(&doc.blocks)?;
    let mut renderer = Renderer::new(&doc.blocks);
    let body = renderer.elements(&doc.blocks, 0)?;
    package::pack(&body, &renderer.links, &renderer.images, options)
}
