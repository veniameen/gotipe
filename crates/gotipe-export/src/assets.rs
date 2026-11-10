//! Embedded raster assets only. URL fetching belongs to an explicit host adapter.
use crate::ConvertError;
use gotipe_core::{AttrValue, Block};
use image::{ImageFormat, ImageReader, Limits};
use std::io::Cursor;

pub(crate) struct RasterImage {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

pub(crate) fn image(block: &Block) -> Result<RasterImage, ConvertError> {
    let source = match block.attrs.get("src") {
        Some(AttrValue::String(source)) => source,
        _ => return Err(ConvertError::ImageError("Image source is missing".into())),
    };
    let (header, payload) = source.split_once(',').ok_or_else(|| {
        ConvertError::ImageError("Resolve image URLs to embedded data before exporting".into())
    })?;
    if !header.starts_with("data:") || !header.ends_with(";base64") {
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
        Some(ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::Gif)
    ) {
        return Err(ConvertError::ImageError(
            "Only PNG, JPEG and GIF images are supported".into(),
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

fn decode_base64(source: &str) -> Result<Vec<u8>, ConvertError> {
    let invalid = || ConvertError::ImageError("Invalid or oversized base64 image".into());
    if source.len() > 12 * 1024 * 1024 || !source.len().is_multiple_of(4) {
        return Err(invalid());
    }
    let mut result = Vec::with_capacity(source.len() / 4 * 3);
    let value = |b: u8| match b {
        b'A'..=b'Z' => Some(b - b'A'),
        b'a'..=b'z' => Some(b - b'a' + 26),
        b'0'..=b'9' => Some(b - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    };
    for (i, chunk) in source.as_bytes().chunks_exact(4).enumerate() {
        let a = value(chunk[0]).ok_or_else(invalid)?;
        let b = value(chunk[1]).ok_or_else(invalid)?;
        let last = (i + 1) * 4 == source.len();
        result.push((a << 2) | (b >> 4));
        if chunk[2] == b'=' {
            if !last || chunk[3] != b'=' || b & 15 != 0 {
                return Err(invalid());
            }
            continue;
        }
        let c = value(chunk[2]).ok_or_else(invalid)?;
        result.push((b << 4) | (c >> 2));
        if chunk[3] == b'=' {
            if !last || c & 3 != 0 {
                return Err(invalid());
            }
            continue;
        }
        let d = value(chunk[3]).ok_or_else(invalid)?;
        result.push((c << 6) | d);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn base64_is_strict() {
        assert_eq!(decode_base64("aGVsbG8=").unwrap(), b"hello");
        for invalid in ["a===", "aG=8", "aGV=AA==", "aGVsbG8", "aGVsbG9=", "@@@@"] {
            assert!(decode_base64(invalid).is_err(), "{invalid}")
        }
    }
}
