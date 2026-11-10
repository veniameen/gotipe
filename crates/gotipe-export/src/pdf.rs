use gotipe_core::Document;
use serde::{Deserialize, Serialize};
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, Source};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

use crate::{pdf_source, ConvertError};

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

struct ExportWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    source: Source,
}
impl ExportWorld {
    fn new(source: String) -> Self {
        let mut fonts = Vec::new();
        for data in typst_assets::fonts().chain(std::iter::once(
            include_bytes!("../assets/NotoEmoji.ttf").as_slice(),
        )) {
            fonts.extend(Font::iter(Bytes::new(data)));
        }
        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(FontBook::from_fonts(&fonts)),
            fonts,
            source: Source::detached(source),
        }
    }
}
impl World for ExportWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }
    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }
    fn main(&self) -> FileId {
        self.source.id()
    }
    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.source.id() {
            Ok(self.source.clone())
        } else {
            Err(FileError::AccessDenied)
        }
    }
    fn file(&self, _id: FileId) -> FileResult<Bytes> {
        Err(FileError::AccessDenied)
    }
    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

pub fn to_pdf(doc: &Document, options: &PdfOptions) -> Result<Vec<u8>, ConvertError> {
    let source = pdf_source::document_source(doc, options)?;
    let world = ExportWorld::new(source);
    let result = typst::compile(&world);
    let document = result.output.map_err(|errors| {
        ConvertError::Encoding(
            errors
                .iter()
                .map(|e| e.message.to_string())
                .collect::<Vec<_>>()
                .join("; "),
        )
    })?;
    if let Some(warning) = result
        .warnings
        .iter()
        .find(|warning| warning.message.contains("glyph"))
    {
        return Err(ConvertError::Encoding(warning.message.to_string()));
    }
    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default()).map_err(|errors| {
        ConvertError::Encoding(
            errors
                .iter()
                .map(|e| e.message.to_string())
                .collect::<Vec<_>>()
                .join("; "),
        )
    })
}
