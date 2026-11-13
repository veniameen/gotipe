//! Embedded raster assets only. URL fetching belongs to an explicit host adapter.
use crate::ConvertError;
use gotipe_core::{AttrValue, Block};
use image::{ImageFormat, ImageReader, Limits};
use std::io::Cursor;

/// The editor keeps files up to 10 MiB inside the document; export accepts the same size.
pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
/// Decoded image data one export may embed, as in @gotipe/export; each occurrence counts.
pub const MAX_DOCUMENT_IMAGE_BYTES: usize = 64 * 1024 * 1024;

pub(crate) struct RasterImage {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// The image source, or `None` for the empty placeholder the editor inserts before upload.
pub(crate) fn source(block: &Block) -> Option<&str> {
    match block.attrs.get("src") {
        Some(AttrValue::String(source)) if !source.trim().is_empty() => Some(source.trim()),
        _ => None,
    }
}

/// Fails before any decoding when a document's embedded images exceed the export budget.
pub(crate) fn check_document_images(blocks: &[Block]) -> Result<(), ConvertError> {
    budget(document_image_bytes(blocks))
}

fn document_image_bytes(blocks: &[Block]) -> usize {
    blocks
        .iter()
        .map(|block| {
            let own = match source(block) {
                Some(source) if block.block_type == "image" => embedded_size(source),
                _ => 0,
            };
            own.saturating_add(document_image_bytes(&block.children))
        })
        .fold(0, usize::saturating_add)
}

fn budget(total: usize) -> Result<(), ConvertError> {
    if total > MAX_DOCUMENT_IMAGE_BYTES {
        return Err(ConvertError::ImageError(format!(
            "Images exceed the {} MiB document export limit",
            MAX_DOCUMENT_IMAGE_BYTES / (1024 * 1024)
        )));
    }
    Ok(())
}

/// Bytes an embedded `data:` image decodes to, counted without decoding it.
fn embedded_size(source: &str) -> usize {
    if !source
        .get(..5)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("data:"))
    {
        return 0;
    }
    let (header, payload) = source.split_once(',').unwrap_or((source, ""));
    if !header.to_ascii_lowercase().ends_with(";base64") {
        return payload.len();
    }
    let symbols = payload
        .bytes()
        .filter(|b| !matches!(b, b'\t' | b'\n' | b'\x0c' | b'\r' | b' ' | b'='))
        .count();
    symbols / 4 * 3 + (symbols % 4) * 3 / 4
}

pub(crate) fn image(source: &str) -> Result<RasterImage, ConvertError> {
    let embedded = source
        .get(..5)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("data:"));
    if !embedded {
        return Err(ConvertError::ImageError(
            "Resolve image URLs to embedded data before exporting (resolveImage)".into(),
        ));
    }
    let (header, payload) = source.split_once(',').unwrap_or((source, ""));
    if !header.to_ascii_lowercase().ends_with(";base64") {
        return Err(ConvertError::ImageError(
            "Image must be an embedded base64 raster".into(),
        ));
    }
    let data = decode_base64(payload)?;
    let mut reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|e| ConvertError::ImageError(e.to_string()))?;
    if !matches!(
        reader.format(),
        Some(ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::Gif | ImageFormat::WebP)
    ) {
        return Err(ConvertError::ImageError(
            "Only PNG, JPEG, GIF and WebP images are supported".into(),
        ));
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|e| ConvertError::ImageError(e.to_string()))?;
    let width = decoded.width();
    let height = decoded.height();
    let mut output = Cursor::new(Vec::new());
    decoded
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|e| ConvertError::ImageError(e.to_string()))?;
    Ok(RasterImage {
        png: output.into_inner(),
        width,
        height,
    })
}

/// WHATWG forgiving-base64, as browsers decode the `data:` URLs the editor displays:
/// ASCII whitespace is ignored and padding is optional.
fn decode_base64(source: &str) -> Result<Vec<u8>, ConvertError> {
    let invalid = || ConvertError::ImageError("Invalid base64 image data".into());
    let too_large = || {
        ConvertError::ImageError(format!(
            "Image exceeds the {} MiB export limit",
            MAX_IMAGE_BYTES / (1024 * 1024)
        ))
    };
    let mut symbols: Vec<u8> = source
        .bytes()
        .filter(|b| !matches!(b, b'\t' | b'\n' | b'\x0c' | b'\r' | b' '))
        .collect();
    if symbols.len().is_multiple_of(4) {
        for _ in 0..2 {
            if symbols.last() == Some(&b'=') {
                symbols.pop();
            }
        }
    }
    if symbols.len() % 4 == 1 {
        return Err(invalid());
    }
    if symbols.len() / 4 * 3 > MAX_IMAGE_BYTES {
        return Err(too_large());
    }
    let value = |b: u8| match b {
        b'A'..=b'Z' => Some(b - b'A'),
        b'a'..=b'z' => Some(b - b'a' + 26),
        b'0'..=b'9' => Some(b - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    };
    let mut result = Vec::with_capacity(symbols.len() / 4 * 3 + 2);
    let (mut buffer, mut bits) = (0u32, 0u32);
    for symbol in symbols {
        buffer = (buffer << 6) | u32::from(value(symbol).ok_or_else(invalid)?);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            result.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    if result.len() > MAX_IMAGE_BYTES {
        return Err(too_large());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_follows_the_browser_decoder() {
        for valid in [
            "aGVsbG8=",
            "aGVsbG8",
            "aGVs\nbG8=",
            " aGVsbG8 =",
            "aGVsbG9=",
        ] {
            assert_eq!(decode_base64(valid).unwrap(), b"hello", "{valid:?}");
        }
        assert_eq!(decode_base64("").unwrap(), b"");
        for invalid in ["a===", "aG=8", "aGV=AA==", "@@@@", "a", "aGVsbG8==="] {
            assert!(decode_base64(invalid).is_err(), "{invalid:?}")
        }
    }

    #[test]
    fn the_editors_largest_inline_upload_is_accepted() {
        let encoded = |bytes: usize| "A".repeat(bytes.div_ceil(3) * 4);
        assert_eq!(
            decode_base64(&encoded(MAX_IMAGE_BYTES - 1)).unwrap().len(),
            MAX_IMAGE_BYTES - 1
        );
        let at_limit = format!("{}==", "A".repeat(MAX_IMAGE_BYTES / 3 * 4 + 2));
        assert_eq!(decode_base64(&at_limit).unwrap().len(), MAX_IMAGE_BYTES);
        let message = decode_base64(&encoded(MAX_IMAGE_BYTES + 3))
            .err()
            .unwrap()
            .to_string();
        assert!(message.contains("10 MiB"), "{message}");
    }

    #[test]
    fn the_document_budget_counts_every_embedded_occurrence() {
        let document = crate::input::document_from_json(
            &serde_json::json!({ "blocks": [
                {"id": "a", "type": "image", "attrs": {"src": "data:image/png;base64,aGVs bG8="}},
                {"id": "q", "type": "blockquote", "children": [
                    {"id": "b", "type": "image", "attrs": {"src": " DATA:image/png;BASE64,aGVsbG8= "}},
                    {"id": "c", "type": "image", "attrs": {"src": "https://host.test/a.png"}},
                    {"id": "d", "type": "image", "attrs": {"src": ""}}
                ]}
            ]})
            .to_string(),
        )
        .unwrap();
        assert_eq!(document_image_bytes(&document.blocks), 10);
        assert!(budget(MAX_DOCUMENT_IMAGE_BYTES).is_ok());
        let message = budget(MAX_DOCUMENT_IMAGE_BYTES + 1)
            .unwrap_err()
            .to_string();
        assert!(message.contains("64 MiB"), "{message}");
    }

    #[test]
    fn data_urls_are_case_insensitive_and_urls_need_a_resolver() {
        let png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
        let image = image(&format!("DATA:image/png;BASE64,{png}")).unwrap();
        assert_eq!((image.width, image.height), (1, 1));
        let message = super::image("https://host.test/a.png")
            .err()
            .unwrap()
            .to_string();
        assert!(message.contains("resolveImage"), "{message}");
    }
}
