//! Explicit embedded font ownership. No system font discovery or external I/O.
use harfrust::{Font, GlyphId};

use crate::ConvertError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum FontStyle {
    Serif,
    SerifBold,
    SerifItalic,
    SerifBoldItalic,
    Mono,
    MonoBold,
    MonoItalic,
    MonoBoldItalic,
}

pub(crate) struct Face {
    pub name: &'static str,
    pub data: &'static [u8],
    pub font: Font,
}

impl Face {
    pub fn scale(&self, size: f32) -> f32 {
        size / f32::from(self.font.units_per_em())
    }

    pub fn ascent(&self, size: f32) -> f32 {
        self.font.metrics().h_line().map_or(size, |line| {
            line.ascender.to_f64() as f32 * self.scale(size)
        })
    }

    /// Positive distance below the baseline.
    pub fn descent(&self, size: f32) -> f32 {
        self.font.metrics().h_line().map_or(size * 0.2, |line| {
            -line.descender.to_f64() as f32 * self.scale(size)
        })
    }

    pub fn advance(&self, glyph: u16, size: f32) -> f32 {
        self.font
            .glyph_metrics()
            .h_advance(GlyphId::new(u32::from(glyph)))
            * self.scale(size)
    }

    fn supports(&self, grapheme: &str) -> bool {
        grapheme
            .chars()
            .all(|ch| shaping_control(ch) || self.font.charmap().map_unicode(ch).is_some())
    }
}

pub(crate) struct Fonts {
    pub faces: Vec<Face>,
}

impl Fonts {
    pub fn new() -> Result<Self, ConvertError> {
        macro_rules! font {
            ($name:literal, $file:literal) => {
                (
                    $name,
                    include_bytes!(concat!("../../assets/", $file)).as_slice(),
                )
            };
        }
        let sources = [
            font!("LibertinusSerif-Regular", "LibertinusSerif-Regular.otf"),
            font!("LibertinusSerif-Bold", "LibertinusSerif-Bold.otf"),
            font!("LibertinusSerif-Italic", "LibertinusSerif-Italic.otf"),
            font!(
                "LibertinusSerif-BoldItalic",
                "LibertinusSerif-BoldItalic.otf"
            ),
            font!("DejaVuSansMono", "DejaVuSansMono.ttf"),
            font!("NotoEmoji", "NotoEmoji.ttf"),
            font!("NewCM10-Regular", "NewCM10-Regular.otf"),
            font!("NewCM10-Bold", "NewCM10-Bold.otf"),
            font!("NewCM10-Italic", "NewCM10-Italic.otf"),
            font!("NewCM10-BoldItalic", "NewCM10-BoldItalic.otf"),
            font!("NewCMMath-Regular", "NewCMMath-Regular.otf"),
            font!("NewCMMath-Book", "NewCMMath-Book.otf"),
            font!("NewCMMath-Bold", "NewCMMath-Bold.otf"),
            font!("DejaVuSansMono-Bold", "DejaVuSansMono-Bold.ttf"),
            font!("DejaVuSansMono-Oblique", "DejaVuSansMono-Oblique.ttf"),
            font!(
                "DejaVuSansMono-BoldOblique",
                "DejaVuSansMono-BoldOblique.ttf"
            ),
            font!("LibertinusSerif-Semibold", "LibertinusSerif-Semibold.otf"),
            font!(
                "LibertinusSerif-SemiboldItalic",
                "LibertinusSerif-SemiboldItalic.otf"
            ),
        ];
        let faces = sources
            .into_iter()
            .map(|(name, data)| {
                let font =
                    Font::new(data, 0).ok_or_else(|| ConvertError::FontNotFound(name.into()))?;
                Ok(Face { name, data, font })
            })
            .collect::<Result<_, ConvertError>>()?;
        Ok(Self { faces })
    }

    pub fn primary(style: FontStyle) -> usize {
        match style {
            FontStyle::Serif => 0,
            FontStyle::SerifBold => 1,
            FontStyle::SerifItalic => 2,
            FontStyle::SerifBoldItalic => 3,
            FontStyle::Mono => 4,
            FontStyle::MonoBold => 13,
            FontStyle::MonoItalic => 14,
            FontStyle::MonoBoldItalic => 15,
        }
    }

    pub fn select(&self, grapheme: &str, style: FontStyle) -> Result<usize, ConvertError> {
        let primary = Self::primary(style);
        let fallback = match style {
            FontStyle::SerifBold | FontStyle::MonoBold => [7, 13, 6, 4],
            FontStyle::SerifItalic | FontStyle::MonoItalic => [8, 14, 6, 4],
            FontStyle::SerifBoldItalic | FontStyle::MonoBoldItalic => [9, 15, 6, 4],
            _ => [6, 4, 0, 10],
        };
        std::iter::once(primary)
            .chain(std::iter::once(5))
            .chain(fallback)
            .chain(0..self.faces.len())
            .find(|&index| self.faces[index].supports(grapheme))
            .ok_or_else(|| {
                ConvertError::FontNotFound(format!("No embedded font covers {grapheme:?}"))
            })
    }
}

/// These codepoints influence shaping but do not require visible glyphs.
pub(super) fn shaping_control(ch: char) -> bool {
    matches!(ch as u32, 0x00ad | 0x061c | 0x200b..=0x200f | 0x202a..=0x202e |
        0x2060..=0x206f | 0xfe00..=0xfe0f | 0xfeff | 0xe0000..=0xe007f | 0xe0100..=0xe01ef)
}
