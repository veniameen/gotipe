//! Raster XObjects with separate alpha masks; never fetches image URLs.
use std::io::Cursor;

use image::{ImageFormat, ImageReader, Limits};
use pdf_writer::{Filter, Finish, Pdf, Ref};

use super::writer::{compress, Ids};
use crate::ConvertError;

pub(super) fn embed(pdf: &mut Pdf, ids: &mut Ids, data: &[u8]) -> Result<Ref, ConvertError> {
    let mut reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|error| ConvertError::ImageError(error.to_string()))?;
    if !matches!(
        reader.format(),
        Some(ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::Gif)
    ) {
        return Err(ConvertError::ImageError(
            "Unsupported PDF raster format".into(),
        ));
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let raster = reader
        .decode()
        .map_err(|error| ConvertError::ImageError(error.to_string()))?;
    let rgba = raster.to_rgba8();
    let mut rgb = Vec::with_capacity((rgba.width() * rgba.height() * 3) as usize);
    let mut alpha = Vec::with_capacity((rgba.width() * rgba.height()) as usize);
    for pixel in rgba.pixels() {
        rgb.extend_from_slice(&pixel.0[..3]);
        alpha.push(pixel.0[3]);
    }
    let image = ids.next();
    let mask = alpha.iter().any(|&value| value != 255).then(|| ids.next());
    let encoded = compress(&rgb)?;
    let mut object = pdf.image_xobject(image, &encoded);
    object.filter(Filter::FlateDecode);
    object
        .width(rgba.width() as i32)
        .height(rgba.height() as i32)
        .bits_per_component(8);
    object.color_space().device_rgb();
    if let Some(mask) = mask {
        object.s_mask(mask);
    }
    object.finish();
    if let Some(mask) = mask {
        let encoded = compress(&alpha)?;
        let mut object = pdf.image_xobject(mask, &encoded);
        object.filter(Filter::FlateDecode);
        object
            .width(rgba.width() as i32)
            .height(rgba.height() as i32)
            .bits_per_component(8);
        object.color_space().device_gray();
    }
    Ok(image)
}
