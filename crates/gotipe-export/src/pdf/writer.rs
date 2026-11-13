//! PDF serialization of an already positioned page display list.
use std::{collections::BTreeMap, io::Write, sync::Arc};

use flate2::{write::ZlibEncoder, Compression};
use pdf_writer::{
    types::AnnotationType, Content, Filter, Finish, Name, Pdf, Rect, Ref, Str, TextStr,
};

use super::{
    font_embedding::{self, EmbeddedFont},
    fonts::Fonts,
    images,
    metadata::DocumentMetadata,
    model::{Color, DrawOp, Page, TextStyle},
    text::{Glyph, ShapedText},
};
use crate::ConvertError;

pub(super) struct Ids(i32);
impl Ids {
    pub fn new() -> Self {
        Self(1)
    }
    pub fn next(&mut self) -> Ref {
        let result = Ref::new(self.0);
        self.0 += 1;
        result
    }
}

pub(super) fn compress(data: &[u8]) -> Result<Vec<u8>, ConvertError> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|error| ConvertError::Encoding(error.to_string()))?;
    encoder
        .finish()
        .map_err(|error| ConvertError::Encoding(error.to_string()))
}

pub(crate) fn write(
    pages: &[Page],
    fonts: &Fonts,
    meta: &DocumentMetadata,
) -> Result<Vec<u8>, ConvertError> {
    if pages.is_empty() {
        return Err(ConvertError::Encoding("PDF needs at least one page".into()));
    }
    let mut pdf = Pdf::new();
    pdf.set_version(1, 7);
    let mut ids = Ids::new();
    let catalog = ids.next();
    let tree = ids.next();
    let document_info = ids.next();
    {
        let mut info = pdf.document_info(document_info);
        info.creator(TextStr("GoTipe"))
            .producer(TextStr("GoTipe PDF"));
        if let Some(title) = meta.title {
            info.title(TextStr(title));
        }
        if let Some(author) = meta.author {
            info.author(TextStr(author));
        }
    }
    let embedded = font_embedding::embed(&mut pdf, &mut ids, fonts, pages)?;
    let page_refs: Vec<_> = pages.iter().map(|_| ids.next()).collect();
    let outline = super::outlines::write(&mut pdf, &mut ids, pages, &page_refs)?;
    let metadata = super::metadata::write(&mut pdf, &mut ids, pages.len(), meta);
    let destinations = super::destinations::collect(pages);
    let named = (!destinations.is_empty()).then(|| ids.next());
    let mut tagging = super::tagging::Tagging::new(&mut ids, pages.len());
    {
        let mut root = pdf.catalog(catalog);
        root.pages(tree).metadata(metadata);
        if let Some(named) = named {
            root.destinations(named);
        }
        // Without a caller-supplied language the file declares none instead of a wrong one.
        if let Some(lang) = meta.lang {
            root.lang(TextStr(lang));
        }
        if meta.title.is_some() {
            root.viewer_preferences().display_doc_title(true);
        }
        root.pair(Name(b"StructTreeRoot"), tagging.root);
        root.mark_info().marked(true);
        if let Some(outline) = outline {
            root.outlines(outline);
        }
    }
    let count = i32::try_from(pages.len())
        .map_err(|_| ConvertError::Encoding("Too many PDF pages".into()))?;
    pdf.pages(tree).kids(page_refs.iter().copied()).count(count);
    let mut rasters: BTreeMap<usize, (Ref, String)> = BTreeMap::new();
    for (page_index, (page, reference)) in pages.iter().zip(page_refs.iter().copied()).enumerate() {
        positive(page.width)?;
        positive(page.height)?;
        let content_ref = ids.next();
        let mut content = Content::new();
        let mut annotations = Vec::new();
        let mut page_images = Vec::new();
        for operation in &page.ops {
            match operation {
                DrawOp::BeginTag { tag } => tagging.begin(tag, &mut ids)?,
                DrawOp::EndTag => tagging.end()?,
                DrawOp::Bookmark { .. } | DrawOp::Anchor { .. } => {}
                DrawOp::Text { x, y, run, style } => {
                    finite(&[*x, *y, style.rise, run.width(), run.ascent(), run.descent()])?;
                    positive(style.size)?;
                    color(style.color)?;
                    // A link to a block that rendered nothing stays text, also for tagging.
                    let link = style
                        .link
                        .as_deref()
                        .filter(|link| destinations.resolves(link));
                    let unlinked;
                    let tagged = if link.is_none() && style.link.is_some() {
                        unlinked = TextStyle {
                            link: None,
                            ..style.clone()
                        };
                        &unlinked
                    } else {
                        style
                    };
                    let paint =
                        tagging.text(&mut content, page_index, reference, tagged, &mut ids)?;
                    draw_text(
                        &mut content,
                        &embedded,
                        *x,
                        page.height - *y + style.rise,
                        run,
                        style,
                    )?;
                    content.end_marked_content();
                    if let Some(link) = link {
                        let id = ids.next();
                        let baseline = page.height - *y + style.rise;
                        let mut annotation = pdf.annotation(id);
                        if let Some(key) = tagging.annotation(paint, reference, id)? {
                            annotation.struct_parent(key);
                        }
                        annotation.page(reference);
                        annotation.subtype(AnnotationType::Link).rect(Rect::new(
                            *x,
                            baseline - run.descent(),
                            *x + run.width(),
                            baseline + run.ascent(),
                        ));
                        annotation.border(0.0, 0.0, 0.0, None);
                        super::destinations::act(&mut annotation, link)?;
                        annotations.push(id);
                    }
                }
                DrawOp::Rect {
                    x,
                    y,
                    width,
                    height,
                    fill,
                    stroke,
                    line_width,
                } => {
                    content.begin_marked_content(Name(b"Artifact"));
                    finite(&[*x, *y, *width, *height, *line_width])?;
                    if *width < 0.0 || *height < 0.0 || *line_width < 0.0 {
                        return Err(ConvertError::Encoding(
                            "Negative PDF rectangle dimension".into(),
                        ));
                    }
                    if let Some(fill) = fill {
                        color(*fill)?;
                        content.set_fill_rgb(fill[0], fill[1], fill[2]);
                    }
                    if let Some(stroke) = stroke {
                        color(*stroke)?;
                        content
                            .set_stroke_rgb(stroke[0], stroke[1], stroke[2])
                            .set_line_width(*line_width);
                    }
                    content.rect(*x, page.height - *y - *height, *width, *height);
                    match (fill.is_some(), stroke.is_some()) {
                        (true, true) => {
                            content.fill_nonzero_and_stroke();
                        }
                        (true, false) => {
                            content.fill_nonzero();
                        }
                        (false, true) => {
                            content.stroke();
                        }
                        (false, false) => {
                            content.end_path();
                        }
                    }
                    content.end_marked_content();
                }
                DrawOp::Line {
                    x1,
                    y1,
                    x2,
                    y2,
                    color: shade,
                    width,
                } => {
                    content.begin_marked_content(Name(b"Artifact"));
                    finite(&[*x1, *y1, *x2, *y2])?;
                    positive(*width)?;
                    color(*shade)?;
                    line(
                        &mut content,
                        [*x1, page.height - *y1, *x2, page.height - *y2],
                        *shade,
                        *width,
                    );
                    content.end_marked_content();
                }
                DrawOp::Image {
                    x,
                    y,
                    width,
                    height,
                    png,
                    alt,
                } => {
                    finite(&[*x, *y])?;
                    positive(*width)?;
                    positive(*height)?;
                    let pointer = Arc::as_ptr(png) as usize;
                    if !rasters.contains_key(&pointer) {
                        let id = images::embed(&mut pdf, &mut ids, png)?;
                        let name = format!("Im{}", rasters.len());
                        rasters.insert(pointer, (id, name));
                    }
                    let (id, name) = &rasters[&pointer];
                    page_images.push((*id, name.clone()));
                    tagging.image(&mut content, page_index, reference, alt, &mut ids)?;
                    content.save_state().transform([
                        *width,
                        0.0,
                        0.0,
                        *height,
                        *x,
                        page.height - *y - *height,
                    ]);
                    content
                        .x_object(Name(name.as_bytes()))
                        .restore_state()
                        .end_marked_content();
                }
            }
        }
        tagging.page_end()?;
        let mut page_dict = pdf.page(reference);
        page_dict
            .media_box(Rect::new(0.0, 0.0, page.width, page.height))
            .parent(tree)
            .contents(content_ref);
        page_dict.struct_parents(page_index as i32);
        if !annotations.is_empty() {
            page_dict.annotations(annotations);
        }
        {
            let mut resources = page_dict.resources();
            {
                let mut names = resources.fonts();
                for font in embedded.values() {
                    names.pair(Name(font.resource.as_bytes()), font.reference);
                }
            }
            // Repeated image operations share one resource dictionary entry.
            page_images.sort();
            page_images.dedup();
            {
                let mut names = resources.x_objects();
                for (reference, name) in page_images {
                    names.pair(Name(name.as_bytes()), reference);
                }
            }
        }
        page_dict.finish();
        pdf.stream(content_ref, &compress(&content.finish())?)
            .filter(Filter::FlateDecode);
    }
    if let Some(named) = named {
        destinations.write(&mut pdf, named, &page_refs)?;
    }
    tagging.finish(&mut pdf, &mut ids)?;
    Ok(pdf.finish())
}

fn draw_text(
    content: &mut Content,
    fonts: &BTreeMap<usize, EmbeddedFont>,
    x: f32,
    y: f32,
    run: &ShapedText,
    style: &TextStyle,
) -> Result<(), ConvertError> {
    if let Some(fill) = style.highlight {
        color(fill)?;
        content
            .set_fill_rgb(fill[0], fill[1], fill[2])
            .rect(
                x,
                y - run.descent(),
                run.width(),
                run.ascent() + run.descent(),
            )
            .fill_nonzero();
    }
    content
        .begin_text()
        .set_fill_rgb(style.color[0], style.color[1], style.color[2]);
    let mut logical_runs: Vec<_> = run.runs.iter().collect();
    logical_runs.sort_by_key(|segment| segment.logical_start);
    for segment in logical_runs {
        let glyphs = &run.glyphs[segment.glyphs.clone()];
        if segment.rtl {
            content.begin_marked_content(Name(b"ReversedChars"));
            draw_glyphs(content, fonts, x, y, glyphs, style.size)?;
            content.end_marked_content();
        } else {
            // A whole-run ActualText collapses every word to one selection box.
            // Keep replacement text local to each complete shaping cluster, including
            // zero-advance companion glyphs, ligatures and emoji sequences.
            for cluster in glyphs.chunk_by(|left, right| left.cluster == right.cluster) {
                let original: String = cluster.iter().map(|glyph| glyph.unicode.as_str()).collect();
                content
                    .begin_marked_content_with_properties(Name(b"Span"))
                    .properties()
                    .actual_text(TextStr(&original));
                draw_glyphs(content, fonts, x, y, cluster, style.size)?;
                content.end_marked_content();
            }
        }
    }
    content.end_text();
    if style.underline {
        line(
            content,
            [
                x,
                y - style.size * 0.1,
                x + run.width(),
                y - style.size * 0.1,
            ],
            style.color,
            (style.size / 16.0).max(0.5),
        );
    }
    if style.strike {
        line(
            content,
            [
                x,
                y + style.size * 0.3,
                x + run.width(),
                y + style.size * 0.3,
            ],
            style.color,
            (style.size / 16.0).max(0.5),
        );
    }
    Ok(())
}

fn draw_glyphs(
    content: &mut Content,
    fonts: &BTreeMap<usize, EmbeddedFont>,
    x: f32,
    y: f32,
    glyphs: &[Glyph],
    size: f32,
) -> Result<(), ConvertError> {
    for glyph in glyphs {
        let font = &fonts[&glyph.face];
        let mapped = font
            .codes
            .get(&(glyph.id, glyph.unicode.clone()))
            .ok_or_else(|| ConvertError::Encoding("Missing PDF glyph remap".into()))?;
        content
            .set_font(Name(font.resource.as_bytes()), size)
            .set_text_matrix([1.0, 0.0, 0.0, 1.0, x + glyph.x, y + glyph.y])
            .show(Str(&mapped.to_be_bytes()));
    }
    Ok(())
}

fn line(content: &mut Content, points: [f32; 4], color: Color, width: f32) {
    content
        .set_stroke_rgb(color[0], color[1], color[2])
        .set_line_width(width)
        .move_to(points[0], points[1])
        .line_to(points[2], points[3])
        .stroke();
}

fn finite(values: &[f32]) -> Result<(), ConvertError> {
    if values.iter().all(|value| value.is_finite()) {
        Ok(())
    } else {
        Err(ConvertError::Encoding("Non-finite PDF coordinate".into()))
    }
}
fn positive(value: f32) -> Result<(), ConvertError> {
    finite(&[value])?;
    if value > 0.0 {
        Ok(())
    } else {
        Err(ConvertError::Encoding("Non-positive PDF dimension".into()))
    }
}
fn color(value: Color) -> Result<(), ConvertError> {
    if value.iter().all(|value| (0.0..=1.0).contains(value)) {
        Ok(())
    } else {
        Err(ConvertError::Encoding("Invalid PDF color".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_page(fonts: &Fonts, text: &str, style: TextStyle) -> Page {
        Page {
            width: 595.0,
            height: 842.0,
            ops: vec![DrawOp::Text {
                x: 40.0,
                y: 80.0,
                run: fonts.shape(text, &style).unwrap(),
                style,
            }],
        }
    }

    #[test]
    fn embeds_subsets_and_unicode_mapping_for_ligatures_rtl_and_emoji() {
        let fonts = Fonts::new().unwrap();
        let text = "Привет é e\u{301} office 😀 👩‍💻 שלום 123 مرحبا שָׁלוֹם إِنَّ لا";
        let page = text_page(&fonts, text, TextStyle::default());
        let pdf = write(&[page], &fonts, &DocumentMetadata::default()).unwrap();
        assert!(pdf.starts_with(b"%PDF-1.7"));
        let visible = String::from_utf8_lossy(&pdf);
        assert!(visible.contains("/ToUnicode"));
        assert!(visible.contains("/FontFile3"));
        assert!(visible.contains("/FontFile2"));
        assert!(visible.contains("<00E9>"));
        assert!(
            visible.contains("<00650301>"),
            "canonically equivalent source clusters retain distinct codes"
        );
        assert!(
            !visible.contains("/Type1\n"),
            "do not substitute unembedded standard fonts"
        );
        // Optional artifact output does not change the test assertions. The native acceptance
        // command runs independent Poppler parsing/extraction/rasterization on this exact file.
        if let Ok(directory) = std::env::var("GOTIPE_PDF_PROBE_DIR") {
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(std::path::Path::new(&directory).join("unicode.pdf"), pdf).unwrap();
        }
    }

    #[test]
    fn ordinary_words_do_not_share_one_actual_text_boundary() {
        let fonts = Fonts::new().unwrap();
        let page = text_page(&fonts, "TOP office NEXT", TextStyle::default());
        let mut pdf = Pdf::new();
        let embedded = font_embedding::embed(
            &mut pdf,
            &mut Ids::new(),
            &fonts,
            std::slice::from_ref(&page),
        )
        .unwrap();
        let DrawOp::Text { run, style, .. } = &page.ops[0] else {
            panic!("text fixture");
        };
        let mut content = Content::new();
        draw_text(&mut content, &embedded, 0.0, 0.0, run, style).unwrap();
        let bytes = content.finish();
        let operators = std::str::from_utf8(&bytes).unwrap();
        assert!(operators.contains("/ActualText (T)"));
        assert!(operators.contains("/ActualText (ffi)"));
        assert!(!operators.contains("TOP office NEXT"));
    }

    #[test]
    fn alpha_images_have_masks_and_reused_resources_are_not_duplicated() {
        let fonts = Fonts::new().unwrap();
        let rgba = image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 128]));
        let mut encoded = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(rgba)
            .write_to(&mut encoded, image::ImageFormat::Png)
            .unwrap();
        let png = Arc::new(encoded.into_inner());
        let page = Page {
            width: 200.0,
            height: 200.0,
            ops: vec![
                DrawOp::Image {
                    x: 20.0,
                    y: 20.0,
                    width: 40.0,
                    height: 40.0,
                    png: png.clone(),
                    alt: "red".into(),
                },
                DrawOp::Image {
                    x: 80.0,
                    y: 20.0,
                    width: 40.0,
                    height: 40.0,
                    png,
                    alt: "red".into(),
                },
            ],
        };
        let pdf = write(&[page], &fonts, &DocumentMetadata::default()).unwrap();
        let visible = String::from_utf8_lossy(&pdf);
        assert_eq!(visible.matches("/SMask").count(), 1);
        assert_eq!(visible.matches("/Subtype /Image").count(), 2);
        if let Ok(directory) = std::env::var("GOTIPE_PDF_PROBE_DIR") {
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(std::path::Path::new(&directory).join("alpha.pdf"), pdf).unwrap();
        }
    }

    #[test]
    fn rejects_unsafe_actions_and_nonfinite_geometry() {
        let fonts = Fonts::new().unwrap();
        let unsafe_style = TextStyle {
            link: Some("javascript:alert(1)".into()),
            ..TextStyle::default()
        };
        assert!(write(
            &[text_page(&fonts, "unsafe", unsafe_style)],
            &fonts,
            &DocumentMetadata::default()
        )
        .is_err());
        let mut page = text_page(&fonts, "valid", TextStyle::default());
        page.width = f32::NAN;
        assert!(write(&[page], &fonts, &DocumentMetadata::default()).is_err());
    }

    #[test]
    fn heading_bookmarks_follow_their_paginated_destinations() {
        let fonts = Fonts::new().unwrap();
        let mut first = text_page(&fonts, "First", TextStyle::default());
        first.ops.extend([
            DrawOp::Bookmark {
                title: "Первая".into(),
                level: 1,
                x: 40.0,
                y: 60.0,
            },
            DrawOp::Bookmark {
                title: "Nested".into(),
                level: 3,
                x: 40.0,
                y: 100.0,
            },
        ]);
        let mut second = text_page(&fonts, "Second", TextStyle::default());
        second.ops.push(DrawOp::Bookmark {
            title: "Second".into(),
            level: 1,
            x: 40.0,
            y: 60.0,
        });
        let pdf = write(&[first, second], &fonts, &DocumentMetadata::default()).unwrap();
        let visible = String::from_utf8_lossy(&pdf);
        assert!(visible.contains("/Outlines"));
        assert_eq!(visible.matches("/Dest").count(), 3);
        if let Ok(directory) = std::env::var("GOTIPE_PDF_PROBE_DIR") {
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(std::path::Path::new(&directory).join("bookmarks.pdf"), pdf).unwrap();
        }
    }
}
