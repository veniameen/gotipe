//! GoTipe block layout. The serializer only receives measured drawing operations.
use super::{
    flow::{self, Row},
    fonts::{FontStyle, Fonts},
    inline::{self, Span},
    model::{DrawOp, TextStyle},
};
use crate::ConvertError;
use gotipe_core::{AttrValue, Block};
use std::sync::Arc;

pub(crate) struct Layout<'a> {
    pub fonts: &'a Fonts,
    pub size: f32,
    pub max_height: f32,
    pub next_tag: &'a std::cell::Cell<u64>,
    pub links: &'a crate::links::Targets,
}

pub(crate) fn attr<'a>(block: &'a Block, key: &str) -> &'a str {
    match block.attrs.get(key) {
        Some(AttrValue::String(value)) => value,
        _ => "",
    }
}
pub(crate) fn number(block: &Block, key: &str, fallback: usize) -> usize {
    match block.attrs.get(key) {
        Some(AttrValue::Number(n)) if n.is_finite() && *n >= 0.0 => *n as usize,
        _ => fallback,
    }
}

impl Layout<'_> {
    pub fn style(&self) -> TextStyle {
        TextStyle {
            size: self.size,
            ..TextStyle::default()
        }
    }
    pub fn text(&self, spans: &[Span], width: f32, size: f32) -> Result<Vec<Row>, ConvertError> {
        inline::wrap(self.fonts, spans, width, size, inline::Align::Start)
    }
    /// Text of a paragraph or heading, aligned by its `align` attribute.
    fn aligned(
        &self,
        block: &Block,
        spans: &[Span],
        width: f32,
        size: f32,
    ) -> Result<Vec<Row>, ConvertError> {
        let align = match block.block_type.as_str() {
            "paragraph" | "heading" => inline::Align::of(attr(block, "align")),
            _ => inline::Align::Start,
        };
        inline::wrap(self.fonts, spans, width, size, align)
    }
    pub fn blocks(
        &self,
        blocks: &[Block],
        width: f32,
        depth: usize,
    ) -> Result<Vec<Row>, ConvertError> {
        if depth > 64 {
            return Err(ConvertError::Encoding("PDF nesting limit exceeded".into()));
        }
        let mut result = Vec::new();
        for block in blocks {
            result.extend(self.block(block, width, depth)?);
        }
        Ok(result)
    }
    pub fn block(&self, block: &Block, width: f32, depth: usize) -> Result<Vec<Row>, ConvertError> {
        if depth > 64 {
            return Err(ConvertError::Encoding("PDF nesting limit exceeded".into()));
        }
        let mut style = self.style();
        let mut result = match block.block_type.as_str() {
            "paragraph" | "listItem" | "todoItem" | "tableCell" | "tableHeader" | "column"
            | "math" | "markdownRaw" => {
                if block.block_type == "tableHeader" {
                    style.font = FontStyle::SerifBold;
                }
                let source = inline::spans(block, &style, self.links);
                let mut rows = if source.iter().all(|span| span.text.is_empty())
                    && !block.children.is_empty()
                    && block.block_type != "paragraph"
                {
                    Vec::new()
                } else {
                    let mut rows = self.aligned(block, &source, width, style.size)?;
                    rows.push(Row::gap(self.size * 0.5));
                    rows
                };
                rows.extend(self.blocks(&block.children, width, depth + 1)?);
                rows
            }
            "heading" => {
                let level = number(block, "level", 1).clamp(1, 6);
                style.size *= [1.7, 1.45, 1.25, 1.1, 1.0, 0.9][level - 1];
                style.font = FontStyle::SerifBold;
                let source = inline::spans(block, &style, self.links);
                let mut rows = self.aligned(block, &source, width, style.size)?;
                let reserve = flow::height(&rows) + self.size * 2.0;
                if let Some(first) = rows.first_mut() {
                    first.keep = reserve;
                    first.ops.insert(
                        0,
                        DrawOp::Bookmark {
                            title: crate::plaintext::block_text(block),
                            level: level as u8,
                            x: 0.0,
                            y: 0.0,
                        },
                    );
                }
                rows.push(Row::gap(self.size * 0.6));
                rows.extend(self.blocks(&block.children, width, depth + 1)?);
                rows
            }
            "bulletList" | "orderedList" | "todoList" => self.list(block, width, depth)?,
            "codeBlock" => {
                let raw = crate::plaintext::block_text(block);
                let source = super::highlight::spans(&raw, attr(block, "language"), self.size);
                let mut rows = self.text(&source, width - 12.0, self.size)?;
                for row in &mut rows {
                    flow::shift(&mut row.ops, 6.0, 0.0);
                    row.ops.insert(
                        0,
                        DrawOp::Rect {
                            x: 0.0,
                            y: 0.0,
                            width,
                            height: row.height,
                            fill: Some([0.96; 3]),
                            stroke: None,
                            line_width: 0.0,
                        },
                    );
                }
                rows.push(Row::gap(self.size * 0.6));
                rows
            }
            "blockquote" | "callout" | "toggle" => self.boxed(block, width, depth)?,
            "divider" => vec![Row {
                height: self.size,
                ops: vec![DrawOp::Line {
                    x1: 0.0,
                    y1: self.size * 0.5,
                    x2: width,
                    y2: self.size * 0.5,
                    color: [0.45; 3],
                    width: 0.6,
                }],
                ..Row::default()
            }],
            "image" => self.image(block, width)?,
            "table" => super::table::layout(self, block, width, depth + 1)?,
            "tableRow" => self.blocks(&block.children, width, depth + 1)?,
            "columns" => {
                let count = block.children.len();
                if count == 0 {
                    Vec::new()
                } else {
                    let gutter = self.size;
                    let cell_width = (width - gutter * (count - 1) as f32) / count as f32;
                    if cell_width < self.size {
                        return Err(ConvertError::Encoding("PDF columns are too narrow".into()));
                    }
                    let lanes = block
                        .children
                        .iter()
                        .enumerate()
                        .map(|(i, child)| {
                            Ok((
                                i as f32 * (cell_width + gutter),
                                self.block(child, cell_width, depth + 1)?,
                            ))
                        })
                        .collect::<Result<Vec<_>, ConvertError>>()?;
                    flow::parallel(lanes, self.max_height)?
                }
            }
            "file" | "embed" => {
                // An empty placeholder has nothing to show; an unlinkable address stays text.
                let text = crate::links::attachment_label(block);
                if text.is_empty() {
                    Vec::new()
                } else {
                    if let Some(link) = self.links.link(attr(block, "url")) {
                        style.link = Some(link.encoded());
                        style.underline = true;
                    }
                    self.text(&[Span { text, style }], width, self.size)?
                }
            }
            other => return Err(ConvertError::UnsupportedBlockType(other.into())),
        };
        // Final row retains natural spacing but must not keep a following block by accident.
        if let Some(last) = result.last_mut() {
            if last.gap {
                last.keep = 0.0;
            }
        }
        super::semantics::wrap(self, block, &mut result);
        // A block an in-document link leads to marks where it starts; it travels with
        // its first row through pagination.
        if let Some(first) = result
            .first_mut()
            .filter(|_| self.links.is_linked(&block.id.0))
        {
            first.ops.insert(
                0,
                DrawOp::Anchor {
                    id: block.id.0.clone(),
                    x: 0.0,
                    y: 0.0,
                },
            );
        }
        Ok(result)
    }

    fn list(&self, block: &Block, width: f32, depth: usize) -> Result<Vec<Row>, ConvertError> {
        let mut output = Vec::new();
        let start = number(block, "start", 1).max(1);
        for (index, item) in block.children.iter().enumerate() {
            let marker = match block.block_type.as_str() {
                "orderedList" => format!("{}.", start.saturating_add(index)),
                "todoList" if matches!(item.attrs.get("checked"), Some(AttrValue::Bool(true))) => {
                    "☑".into()
                }
                "todoList" => "☐".into(),
                _ => "•".into(),
            };
            let run = self.fonts.shape(&marker, &self.style())?;
            let indent = (self.size * 1.5).max(run.width() + self.size * 0.5);
            let mut rows = self.block(item, width - indent, depth + 1)?;
            if rows.is_empty() {
                rows.push(Row {
                    height: self.size * 1.35,
                    ..Row::default()
                });
                super::semantics::wrap(self, item, &mut rows);
            }
            for row in &mut rows {
                flow::shift(&mut row.ops, indent, 0.0);
            }
            if let Some(first) = rows.first_mut() {
                // Use the text row's baseline so fallbacks and large glyphs stay aligned.
                let y = first
                    .ops
                    .iter()
                    .find_map(|op| match op {
                        DrawOp::Text { y, .. } => Some(*y),
                        _ => None,
                    })
                    .unwrap_or(self.size);
                let label = self.tag("Lbl");
                first.ops.splice(
                    1..1,
                    [
                        DrawOp::BeginTag { tag: label },
                        DrawOp::Text {
                            x: 0.0,
                            y,
                            run,
                            style: self.style(),
                        },
                        DrawOp::EndTag,
                    ],
                );
            }
            output.extend(rows);
        }
        Ok(output)
    }

    fn boxed(&self, block: &Block, width: f32, depth: usize) -> Result<Vec<Row>, ConvertError> {
        let inset = 8.0;
        let nested = Layout {
            max_height: self.max_height - inset * 2.0,
            ..*self
        };
        let mut rows = nested.text(
            &inline::spans(block, &self.style(), self.links),
            width - inset * 2.0,
            self.size,
        )?;
        rows.extend(nested.blocks(&block.children, width - inset * 2.0, depth + 1)?);
        flow::trim_gaps(&mut rows);
        let last_index = rows.len().saturating_sub(1);
        for (i, row) in rows.iter_mut().enumerate() {
            let top = if i == 0 { inset } else { 0.0 };
            let bottom = if i == last_index { inset } else { 0.0 };
            flow::shift(&mut row.ops, inset, top);
            row.height += top + bottom;
            row.ops.insert(
                0,
                DrawOp::Rect {
                    x: 0.0,
                    y: 0.0,
                    width,
                    height: row.height,
                    fill: Some([0.98; 3]),
                    stroke: None,
                    line_width: 0.0,
                },
            );
            for x in [0.0, width] {
                row.ops.push(DrawOp::Line {
                    x1: x,
                    y1: 0.0,
                    x2: x,
                    y2: row.height,
                    color: [0.6; 3],
                    width: 0.5,
                });
            }
            for y in [
                if i == 0 { Some(0.0) } else { None },
                if i == last_index {
                    Some(row.height)
                } else {
                    None
                },
            ]
            .into_iter()
            .flatten()
            {
                row.ops.push(DrawOp::Line {
                    x1: 0.0,
                    y1: y,
                    x2: width,
                    y2: y,
                    color: [0.6; 3],
                    width: 0.5,
                });
            }
        }
        rows.push(Row::gap(self.size * 0.6));
        Ok(rows)
    }

    fn image(&self, block: &Block, width: f32) -> Result<Vec<Row>, ConvertError> {
        let caption = attr(block, "caption");
        let Some(source) = crate::assets::source(block) else {
            // A placeholder without an uploaded image keeps only its caption.
            if caption.is_empty() {
                return Ok(Vec::new());
            }
            let style = self.style();
            let text = caption.into();
            let mut rows = self.text(&[Span { text, style }], width, self.size)?;
            rows.push(Row::gap(self.size * 0.5));
            return Ok(rows);
        };
        let image = crate::assets::image(source)?;
        let requested = number(block, "width", image.width as usize).clamp(1, 8192) as f32 * 0.75;
        let mut w = requested.min(width);
        let mut h = w * image.height as f32 / image.width as f32;
        let mut caption_rows = if caption.is_empty() {
            Vec::new()
        } else {
            self.text(
                &[Span {
                    text: caption.into(),
                    style: self.style(),
                }],
                width,
                self.size,
            )?
        };
        let available = (self.max_height - self.size * 0.5).max(1.0);
        let caption_tag = self.tag("Caption");
        for row in &mut caption_rows {
            super::semantics::wrap_ops(&mut row.ops, &caption_tag);
        }
        if h > available {
            w *= available / h;
            h = available;
        }
        let mut rows = vec![Row {
            height: h,
            ops: vec![DrawOp::Image {
                x: 0.0,
                y: 0.0,
                width: w,
                height: h,
                png: Arc::new(image.png),
                alt: attr(block, "alt").into(),
            }],
            keep: 0.0,
            gap: false,
        }];
        rows.append(&mut caption_rows);
        rows.push(Row::gap(self.size * 0.5));
        Ok(rows)
    }
}
