//! Subset fonts once per export, retaining the mappings needed by PDF text extraction.
use std::collections::{BTreeMap, BTreeSet};

use pdf_writer::{
    types::{CidFontType, FontFlags, SystemInfo, UnicodeCmap},
    Finish, Name, Pdf, Rect, Ref, Str,
};
use read_fonts::{types::Tag, FontRef};
use subsetter::GlyphRemapper;

use super::{
    fonts::Fonts,
    model::{DrawOp, Page},
    writer::{compress, Ids},
};
use crate::ConvertError;

pub(super) struct EmbeddedFont {
    pub reference: Ref,
    pub resource: String,
    pub codes: BTreeMap<(u16, String), u16>,
}

pub(super) fn embed(
    pdf: &mut Pdf,
    ids: &mut Ids,
    fonts: &Fonts,
    pages: &[Page],
) -> Result<BTreeMap<usize, EmbeddedFont>, ConvertError> {
    let mut used: BTreeMap<usize, BTreeSet<(u16, String)>> = BTreeMap::new();
    for page in pages {
        for operation in &page.ops {
            if let DrawOp::Text { run, .. } = operation {
                for glyph in &run.glyphs {
                    used.entry(glyph.face)
                        .or_default()
                        .insert((glyph.id, glyph.unicode.clone()));
                }
            }
        }
    }
    let mut result = BTreeMap::new();
    for (index, glyphs) in used {
        let face = &fonts.faces[index];
        let mut remapper = GlyphRemapper::new();
        for (glyph, _) in &glyphs {
            remapper.remap(*glyph);
        }
        let subset =
            subsetter::subset_with_variations(face.data, 0, &[], &remapper).map_err(|error| {
                ConvertError::Encoding(format!("PDF font subset {}: {error}", face.name))
            })?;
        let parsed =
            FontRef::new(&subset).map_err(|error| ConvertError::Encoding(error.to_string()))?;
        let cff = parsed.table_data(Tag::new(b"CFF "));
        let font_data = cff
            .as_ref()
            .map_or(subset.as_slice(), |data| data.as_bytes());
        let type0 = ids.next();
        let cid = ids.next();
        let descriptor = ids.next();
        let program = ids.next();
        let unicode = ids.next();
        let encoding = ids.next();
        let prefix = char::from(b'A' + index as u8);
        let name = format!("GTAAA{prefix}+{}", face.name);
        pdf.type0_font(type0)
            .base_font(Name(name.as_bytes()))
            .encoding_cmap(encoding)
            .descendant_font(cid)
            .to_unicode(unicode);
        let info = SystemInfo {
            registry: Str(b"Adobe"),
            ordering: Str(b"Identity"),
            supplement: 0,
        };
        let mut descendant = pdf.cid_font(cid);
        descendant
            .subtype(if cff.is_some() {
                CidFontType::Type0
            } else {
                CidFontType::Type2
            })
            .base_font(Name(name.as_bytes()))
            .system_info(info)
            .font_descriptor(descriptor)
            .default_width(0.0);
        if cff.is_none() {
            descendant.cid_to_gid_map_predefined(Name(b"Identity"));
        }
        let mut cmap = UnicodeCmap::new(Name(b"GoTipeUnicode"), info);
        let mut codes = BTreeMap::new();
        let mut mappings = Vec::new();
        {
            let mut widths = descendant.widths();
            let originals: BTreeSet<_> = glyphs.iter().map(|(id, _)| *id).collect();
            for original in originals {
                let mapped = remapper
                    .get(original)
                    .ok_or_else(|| ConvertError::Encoding("Missing PDF glyph remap".into()))?;
                widths.consecutive(mapped, [face.advance(original, 1000.0)]);
            }
        }
        descendant.finish();
        for (index, (original, text)) in glyphs.into_iter().enumerate() {
            let code = u16::try_from(index + 1)
                .map_err(|_| ConvertError::Encoding("Too many PDF character mappings".into()))?;
            let mapped = remapper
                .get(original)
                .ok_or_else(|| ConvertError::Encoding("Missing PDF glyph remap".into()))?;
            mappings.push((code, mapped));
            cmap.pair_with_multiple(code, text.chars());
            codes.insert((original, text), code);
        }
        pdf.cmap(encoding, &encoding_cmap(&mappings))
            .name(Name(b"GoTipeEncoding"))
            .system_info(info);
        let metrics = face.font.metrics();
        let style = face.font.style_metrics();
        let scale = face.scale(1000.0);
        let bounds = metrics.bounds;
        let mut flags = FontFlags::SYMBOLIC;
        if style.is_fixed_pitch == Some(true) {
            flags |= FontFlags::FIXED_PITCH;
        }
        let angle = style
            .italic_angle
            .map_or(0.0, |angle| angle.to_f64() as f32);
        if angle != 0.0 {
            flags |= FontFlags::ITALIC;
        }
        let mut description = pdf.font_descriptor(descriptor);
        description
            .name(Name(name.as_bytes()))
            .flags(flags)
            .bbox(Rect::new(
                bounds.x_min.to_f64() as f32 * scale,
                bounds.y_min.to_f64() as f32 * scale,
                bounds.x_max.to_f64() as f32 * scale,
                bounds.y_max.to_f64() as f32 * scale,
            ))
            .italic_angle(angle)
            .ascent(face.ascent(1000.0))
            .descent(-face.descent(1000.0))
            .cap_height(
                metrics
                    .cap_height
                    .map_or(face.ascent(1000.0), |height| height.to_f64() as f32 * scale),
            )
            .stem_v(if face.name.contains("Bold") {
                120.0
            } else {
                80.0
            });
        if cff.is_some() {
            description.font_file3(program);
        } else {
            description.font_file2(program);
        }
        description.finish();
        let compressed = compress(font_data)?;
        let mut stream = pdf.stream(program, &compressed);
        stream.filter(pdf_writer::Filter::FlateDecode);
        if cff.is_some() {
            stream.pair(Name(b"Subtype"), Name(b"CIDFontType0C"));
        } else {
            stream.pair(
                Name(b"Length1"),
                i32::try_from(font_data.len())
                    .map_err(|_| ConvertError::Encoding("Font program too large".into()))?,
            );
        }
        stream.finish();
        pdf.stream(unicode, &cmap.finish());
        result.insert(
            index,
            EmbeddedFont {
                reference: type0,
                resource: format!("F{index}"),
                codes,
            },
        );
    }
    Ok(result)
}

/// PDF character codes can have different source text while sharing one subset glyph.
/// The encoding map separates those codes from the font program's CID space.
fn encoding_cmap(mappings: &[(u16, u16)]) -> Vec<u8> {
    let mut source = String::from("/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def\n/CMapName /GoTipeEncoding def\n/CMapType 1 def\n/WMode 0 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n");
    for chunk in mappings.chunks(100) {
        source.push_str(&format!("{} begincidchar\n", chunk.len()));
        for (code, cid) in chunk {
            source.push_str(&format!("<{code:04X}> {cid}\n"));
        }
        source.push_str("endcidchar\n");
    }
    source.push_str("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n");
    source.into_bytes()
}
