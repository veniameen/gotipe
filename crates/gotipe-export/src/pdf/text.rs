//! Unicode bidi, grapheme-safe fallback and OpenType shaping. Layout owns line breaks.
use std::{collections::BTreeMap, ops::Range};

use harfrust::{Buffer, BufferFlags, Direction, Script, ShapeOptions, ShaperFont};
use unicode_bidi::BidiInfo;
use unicode_segmentation::UnicodeSegmentation;

use super::{fonts::Fonts, model::TextStyle};
use crate::ConvertError;

#[derive(Clone, Debug)]
pub(super) struct Glyph {
    pub face: usize,
    pub id: u16,
    pub x: f32,
    pub y: f32,
    pub unicode: String,
    /// Shaping segment identity and source-byte cluster within that segment.
    pub cluster: (usize, u32),
}

#[derive(Clone, Debug)]
pub(super) struct GlyphRun {
    pub glyphs: Range<usize>,
    pub logical_start: usize,
    pub rtl: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct ShapedText {
    pub text: String,
    pub(super) glyphs: Vec<Glyph>,
    pub(super) runs: Vec<GlyphRun>,
    width: f32,
    ascent: f32,
    descent: f32,
}

impl ShapedText {
    pub fn width(&self) -> f32 {
        self.width
    }
    pub fn ascent(&self) -> f32 {
        self.ascent
    }
    pub fn descent(&self) -> f32 {
        self.descent
    }
}

impl Fonts {
    pub fn shape(&self, text: &str, style: &TextStyle) -> Result<ShapedText, ConvertError> {
        self.shape_inner(text, style, None)
    }

    /// Shape one uniform bidi run after a caller orders styled ranges for a line.
    pub fn shape_direction(
        &self,
        text: &str,
        style: &TextStyle,
        rtl: bool,
    ) -> Result<ShapedText, ConvertError> {
        self.shape_inner(text, style, Some(rtl))
    }

    fn shape_inner(
        &self,
        text: &str,
        style: &TextStyle,
        direction: Option<bool>,
    ) -> Result<ShapedText, ConvertError> {
        if !style.size.is_finite() || style.size <= 0.0 {
            return Err(ConvertError::Encoding("Invalid PDF text size".into()));
        }
        let primary = &self.faces[Self::primary(style.font)];
        let mut result = ShapedText {
            text: text.into(),
            glyphs: Vec::new(),
            runs: Vec::new(),
            width: 0.0,
            ascent: primary.ascent(style.size),
            descent: primary.descent(style.size),
        };
        let source = text.replace('\t', "    ");
        if let Some(rtl) = direction {
            self.shape_run(&source, 0..source.len(), rtl, style, &mut result)?;
        } else {
            let bidi = BidiInfo::new(&source, None);
            for paragraph in &bidi.paragraphs {
                let (levels, runs) = bidi.visual_runs(paragraph, paragraph.range.clone());
                for range in runs {
                    self.shape_run(
                        &source,
                        range.clone(),
                        levels[range.start].is_rtl(),
                        style,
                        &mut result,
                    )?;
                }
            }
        }
        Ok(result)
    }

    fn shape_run(
        &self,
        source: &str,
        range: Range<usize>,
        rtl: bool,
        style: &TextStyle,
        result: &mut ShapedText,
    ) -> Result<(), ConvertError> {
        let start_glyph = result.glyphs.len();
        let logical_start = range.start;
        let mut segments: Vec<(Range<usize>, usize, Script)> = Vec::new();
        for (offset, grapheme) in source[range.clone()].grapheme_indices(true) {
            let start = range.start + offset;
            let face = self.select(grapheme, style.font)?;
            let script = grapheme
                .chars()
                .map(|ch| harfrust::unicode::script(ch as u32))
                .find(|&script| script != Script::COMMON && script != Script::INHERITED)
                .or_else(|| segments.last().map(|segment| segment.2))
                .unwrap_or(Script::COMMON);
            if let Some((last, last_face, last_script)) = segments.last_mut() {
                if *last_face == face && (*last_script == script || *last_script == Script::COMMON)
                {
                    last.end = start + grapheme.len();
                    *last_script = script;
                    continue;
                }
            }
            segments.push((start..start + grapheme.len(), face, script));
        }
        if rtl {
            segments.reverse();
        }
        for (range, face, script) in segments {
            self.shape_segment(&source[range], face, script, rtl, style, result)?;
        }
        result.runs.push(GlyphRun {
            glyphs: start_glyph..result.glyphs.len(),
            logical_start,
            rtl,
        });
        Ok(())
    }

    fn shape_segment(
        &self,
        source: &str,
        face_index: usize,
        script: Script,
        rtl: bool,
        style: &TextStyle,
        result: &mut ShapedText,
    ) -> Result<(), ConvertError> {
        let face = &self.faces[face_index];
        let font = ShaperFont::new(&face.font);
        let mut buffer = Buffer::new();
        buffer.push_str(source);
        // The default hidden glyph is a space with zero shaped advance, but PDF
        // selection uses its nominal font width. Remove only default ignorables;
        // HarfRust merges their source clusters, retaining selectors in ActualText.
        buffer.set_flags(BufferFlags::REMOVE_DEFAULT_IGNORABLES);
        buffer.set_direction(if rtl {
            Direction::RightToLeft
        } else {
            Direction::LeftToRight
        });
        buffer.set_script(Some(script));
        buffer.guess_segment_properties();
        harfrust::shape(&font, &mut buffer, ShapeOptions::new())
            .map_err(|error| ConvertError::Encoding(format!("PDF shaping: {error}")))?;
        if !buffer.allocation_successful() {
            return Err(ConvertError::Encoding(
                "PDF shaping allocation limit".into(),
            ));
        }
        let mut clusters: Vec<usize> = buffer
            .glyph_infos()
            .iter()
            .map(|info| info.cluster as usize)
            .collect();
        clusters.push(source.len());
        clusters.sort_unstable();
        clusters.dedup();
        let scale = face.scale(style.size);
        let mut representatives: BTreeMap<u32, (usize, u32)> = BTreeMap::new();
        let segment_start = result.glyphs.len();
        for (index, (info, position)) in buffer
            .glyph_infos()
            .iter()
            .zip(buffer.glyph_positions())
            .enumerate()
        {
            let width = position.x_advance.unsigned_abs();
            let best = representatives
                .entry(info.cluster)
                .or_insert((index, width));
            if width > best.1 {
                *best = (index, width);
            }
        }
        for (index, (info, position)) in buffer
            .glyph_infos()
            .iter()
            .zip(buffer.glyph_positions())
            .enumerate()
        {
            let id = u16::try_from(info.glyph_id)
                .map_err(|_| ConvertError::Encoding("PDF glyph id overflow".into()))?;
            let start = info.cluster as usize;
            let end = clusters
                .get(clusters.partition_point(|&offset| offset <= start))
                .copied()
                .unwrap_or(source.len());
            let unicode = source
                .get(start..end)
                .ok_or_else(|| ConvertError::Encoding("Invalid PDF glyph cluster".into()))?;
            if id == 0 && !unicode.chars().all(super::fonts::shaping_control) {
                return Err(ConvertError::FontNotFound(format!(
                    "Missing shaped glyph for {unicode:?}"
                )));
            }
            // A cluster may paint several glyphs, but contributes its source text once.
            // ReversedChars reverses codepoints on extraction, including ligature mappings.
            let mapping = if representatives[&info.cluster].0 != index {
                String::new()
            } else if rtl {
                unicode.chars().rev().collect()
            } else {
                unicode.into()
            };
            result.glyphs.push(Glyph {
                face: face_index,
                id,
                x: result.width + position.x_offset as f32 * scale,
                y: position.y_offset as f32 * scale,
                unicode: mapping,
                cluster: (segment_start, info.cluster),
            });
            result.width += position.x_advance as f32 * scale;
        }
        result.ascent = result.ascent.max(face.ascent(style.size));
        result.descent = result.descent.max(face.descent(style.size));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shapes_rtl_marks_ligatures_and_complete_emoji_clusters() {
        let fonts = Fonts::new().unwrap();
        for source in ["Привет e\u{301} office", "שלום 123 مرحبا", "👩‍💻 🇩🇪 😀"]
        {
            let run = fonts.shape(source, &TextStyle::default()).unwrap();
            assert_eq!(run.text, source);
            assert!(run.width() > 0.0 && run.ascent() > 0.0);
            assert!(run.glyphs.iter().all(|glyph| glyph.id != 0));
        }
        let joined = fonts.shape("office", &TextStyle::default()).unwrap();
        assert!(
            joined.glyphs.len() < "office".len(),
            "OpenType ligature shaping must run"
        );
    }

    #[test]
    fn missing_characters_fail_instead_of_silently_emitting_notdef() {
        let fonts = Fonts::new().unwrap();
        assert!(fonts.shape("\u{10ffff}", &TextStyle::default()).is_err());
    }

    #[test]
    fn rtl_unicode_mapping_preserves_marks_and_ligatures_once() {
        let fonts = Fonts::new().unwrap();
        for source in ["שָׁלוֹם", "إِنَّ", "لا"] {
            let run = fonts
                .shape_direction(source, &TextStyle::default(), true)
                .unwrap();
            let mapped: String = run
                .glyphs
                .iter()
                .map(|glyph| glyph.unicode.as_str())
                .collect();
            assert_eq!(mapped.chars().rev().collect::<String>(), source);
        }
    }

    #[test]
    fn ltr_cluster_boundaries_keep_all_companion_glyphs_and_source_text() {
        let fonts = Fonts::new().unwrap();
        let source = "TOP Общее 😀 office e\u{301} a\u{323}\u{301} café é 👩‍💻 ❤️";
        let run = fonts
            .shape_direction(source, &TextStyle::default(), false)
            .unwrap();
        let clusters: Vec<_> = run
            .glyphs
            .chunk_by(|left, right| left.cluster == right.cluster)
            .collect();
        let texts: Vec<String> = clusters
            .iter()
            .map(|cluster| cluster.iter().map(|glyph| glyph.unicode.as_str()).collect())
            .collect();
        assert_eq!(texts.concat(), source);
        for complete in ["ffi", "e\u{301}", "a\u{323}\u{301}", "👩‍💻", "❤️"] {
            assert!(texts.iter().any(|text| text == complete), "{complete:?}");
        }
        let combining = texts
            .iter()
            .position(|text| text == "a\u{323}\u{301}")
            .unwrap();
        assert!(
            clusters[combining].len() > 1,
            "visible combining glyphs remain"
        );
        let identities: std::collections::BTreeSet<_> =
            clusters.iter().map(|cluster| cluster[0].cluster).collect();
        assert_eq!(identities.len(), clusters.len());
    }

    #[test]
    fn variation_selectors_do_not_paint_phantom_space_glyphs() {
        let fonts = Fonts::new().unwrap();
        let run = fonts.shape("❤️", &TextStyle::default()).unwrap();
        assert_eq!(run.glyphs.len(), 1, "only the heart is painted");
        assert_eq!(run.glyphs[0].unicode, "❤️", "VS16 remains searchable");
    }
}
