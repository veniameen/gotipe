//! Optional PDF export with GoTipe layout and dedicated font/PDF codecs.
use crate::ConvertError;
use gotipe_core::Document;
use serde::{Deserialize, Serialize};
mod destinations;
mod flow;
mod font_embedding;
mod fonts;
mod highlight;
mod images;
mod inline;
mod layout;
mod metadata;
mod model;
mod outlines;
mod pagination;
mod semantics;
mod table;
mod tagging;
mod text;
mod validation;
mod writer;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct PdfOptions {
    pub page_size: String,
    pub font_size: f64,
    pub margin: Margins,
    pub header_template: Option<String>,
    pub footer_template: Option<String>,
    /// BCP 47 language of the document text, e.g. `ru` or `en-GB`. Omitted: none declared.
    pub lang: Option<String>,
    /// Document title for viewers and the window title.
    pub title: Option<String>,
    pub author: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Margins {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}
impl Default for Margins {
    fn default() -> Self {
        Self {
            top: 72.0,
            right: 72.0,
            bottom: 72.0,
            left: 72.0,
        }
    }
}
impl Default for PdfOptions {
    fn default() -> Self {
        Self {
            page_size: "a4".into(),
            font_size: 12.0,
            margin: Margins::default(),
            header_template: None,
            footer_template: None,
            lang: None,
            title: None,
            author: None,
        }
    }
}

fn dimensions(options: &PdfOptions) -> Result<(f32, f32), ConvertError> {
    let invalid = |message: &str| Err(ConvertError::InvalidOptions(message.into()));
    if !options.font_size.is_finite() || !(1.0..=100.0).contains(&options.font_size) {
        return invalid("Invalid PDF font size");
    }
    let m = &options.margin;
    if [m.top, m.right, m.bottom, m.left]
        .iter()
        .any(|v| !v.is_finite() || !(0.0..=200.0).contains(v))
    {
        return invalid("Invalid PDF margin");
    }
    match options.page_size.as_str() {
        "a4" => Ok((595.2756, 841.8898)),
        "letter" => Ok((612.0, 792.0)),
        "legal" => Ok((612.0, 1008.0)),
        _ => invalid("Invalid PDF page size"),
    }
}

/// A metadata string; empty means "not set". Control characters cannot be shown or stored.
fn metadata_text<'a>(
    value: &'a Option<String>,
    name: &str,
) -> Result<Option<&'a str>, ConvertError> {
    let value = value.as_deref().filter(|value| !value.is_empty());
    if value.is_some_and(|value| value.chars().any(|c| c.is_control() && c != '\t')) {
        return Err(ConvertError::InvalidOptions(format!(
            "PDF {name} contains a control character"
        )));
    }
    Ok(value)
}

/// Validated document metadata.
fn document_metadata(options: &PdfOptions) -> Result<metadata::DocumentMetadata<'_>, ConvertError> {
    let text = metadata_text;
    let lang = text(&options.lang, "lang")?;
    let tag = |value: &str| {
        let mut subtags = value.split('-');
        let primary = subtags.next().unwrap_or("");
        value.len() <= 64
            && (1..=8).contains(&primary.len())
            && primary.bytes().all(|b| b.is_ascii_alphabetic())
            && subtags.all(|part| {
                (1..=8).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_alphanumeric())
            })
    };
    if lang.is_some_and(|lang| !tag(lang)) {
        return Err(ConvertError::InvalidOptions(
            "PDF lang must be a BCP 47 language tag such as \"en\" or \"pt-BR\"".into(),
        ));
    }
    Ok(metadata::DocumentMetadata {
        lang,
        title: text(&options.title, "title")?,
        author: text(&options.author, "author")?,
    })
}

pub fn to_pdf(doc: &Document, options: &PdfOptions) -> Result<Vec<u8>, ConvertError> {
    let (width, height) = dimensions(options)?;
    let meta = document_metadata(options)?;
    validation::document(doc)?;
    crate::assets::check_document_images(&doc.blocks)?;
    let fonts = fonts::Fonts::new()?;
    let size = options.font_size as f32;
    let content_width = width - options.margin.left as f32 - options.margin.right as f32;
    let next_tag = std::cell::Cell::new(1);
    let links = crate::links::Targets::new(&doc.blocks);
    let layout = layout::Layout {
        fonts: &fonts,
        size,
        max_height: height,
        next_tag: &next_tag,
        links: &links,
    };
    let mut decorations = Vec::new();
    let mut top = options.margin.top as f32;
    let mut bottom = height - options.margin.bottom as f32;
    for (content, header) in [
        (&options.header_template, true),
        (&options.footer_template, false),
    ] {
        if let Some(content) = content.as_ref().filter(|text| !text.is_empty()) {
            let rows = layout.text(
                &[inline::Span {
                    text: content.clone(),
                    style: layout.style(),
                }],
                content_width,
                size,
            )?;
            let extent = flow::height(&rows);
            let margin = if header {
                options.margin.top
            } else {
                options.margin.bottom
            } as f32;
            let offset = ((margin - extent) * 0.5).max(6.0);
            let start = if header {
                offset
            } else {
                height - offset - extent
            };
            let mut y = start;
            for mut row in rows {
                flow::shift(&mut row.ops, options.margin.left as f32, y);
                decorations.extend(row.ops);
                y += row.height;
            }
            if header {
                top = top.max(y + size);
            } else {
                bottom = bottom.min(start - size);
            }
        }
    }
    if bottom - top < size * 1.5 {
        return Err(ConvertError::InvalidOptions(
            "PDF header, footer and margins leave no printable content area".into(),
        ));
    }
    let layout = layout::Layout {
        max_height: bottom - top,
        ..layout
    };
    let rows = layout.blocks(&doc.blocks, content_width, 0)?;
    let geometry = flow::PageGeometry {
        width,
        height,
        left: options.margin.left as f32,
        top,
        bottom,
    };
    writer::write(
        &flow::paginate(rows, &geometry, &decorations)?,
        &fonts,
        &meta,
    )
}
