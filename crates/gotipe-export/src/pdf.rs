//! Optional PDF export with GoTipe layout and dedicated font/PDF codecs.
use crate::ConvertError;
use gotipe_core::Document;
use serde::{Deserialize, Serialize};
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
#[serde(default, rename_all = "camelCase")]
pub struct PdfOptions {
    pub page_size: String,
    pub font_size: f64,
    pub margin: Margins,
    pub header_template: Option<String>,
    pub footer_template: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
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
        }
    }
}

fn dimensions(options: &PdfOptions) -> Result<(f32, f32), ConvertError> {
    if !options.font_size.is_finite() || !(1.0..=100.0).contains(&options.font_size) {
        return Err(ConvertError::Encoding(
            "Invalid PDF page size or font size".into(),
        ));
    }
    let m = &options.margin;
    if [m.top, m.right, m.bottom, m.left]
        .iter()
        .any(|v| !v.is_finite() || !(0.0..=200.0).contains(v))
    {
        return Err(ConvertError::Encoding("Invalid PDF margin".into()));
    }
    match options.page_size.as_str() {
        "a4" => Ok((595.2756, 841.8898)),
        "letter" => Ok((612.0, 792.0)),
        "legal" => Ok((612.0, 1008.0)),
        _ => Err(ConvertError::Encoding(
            "Invalid PDF page size or font size".into(),
        )),
    }
}

pub fn to_pdf(doc: &Document, options: &PdfOptions) -> Result<Vec<u8>, ConvertError> {
    let (width, height) = dimensions(options)?;
    validation::document(doc)?;
    let fonts = fonts::Fonts::new()?;
    let size = options.font_size as f32;
    let content_width = width - options.margin.left as f32 - options.margin.right as f32;
    let next_tag = std::cell::Cell::new(1);
    let layout = layout::Layout {
        fonts: &fonts,
        size,
        max_height: height,
        next_tag: &next_tag,
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
        return Err(ConvertError::Encoding(
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
    writer::write(&flow::paginate(rows, &geometry, &decorations)?, &fonts)
}
