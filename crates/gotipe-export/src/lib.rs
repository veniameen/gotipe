#[cfg(feature = "image-data")]
mod assets;
#[cfg(any(feature = "pdf", feature = "docx"))]
mod document_checks;
pub mod input;
pub mod json;
#[cfg(any(feature = "pdf", feature = "docx"))]
mod links;
pub mod plaintext;
mod table_span;

#[cfg(feature = "html")]
pub mod html;

#[cfg(feature = "markdown")]
pub mod markdown;
#[cfg(feature = "markdown")]
mod markdown_parse;

use gotipe_core::Document;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ExportOptions {
    /// Neutral structural styles, as `inlineStyles` of `serializeHtml`.
    pub inline_styles: bool,
    /// One class per block from this CSS identifier prefix, as `classPrefix` of `serializeHtml`.
    pub class_prefix: Option<String>,
    pub csp_nonce: Option<String>,
    pub base_url: Option<String>,
    pub css_classes: bool,
    pub highlight_code: bool,
    pub include_metadata: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        ExportOptions {
            inline_styles: false,
            class_prefix: None,
            csp_nonce: None,
            base_url: None,
            css_classes: true,
            highlight_code: false,
            include_metadata: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportOptions {
    pub strict: bool,
    pub sanitize: bool,
    pub max_blocks: Option<usize>,
    pub allowed_tags: Option<Vec<String>>,
    pub image_base_url: Option<String>,
}

impl Default for ImportOptions {
    fn default() -> Self {
        ImportOptions {
            strict: false,
            sanitize: true,
            max_blocks: None,
            allowed_tags: None,
            image_base_url: None,
        }
    }
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum ConvertError {
    #[error("Unsupported block type: {0}")]
    UnsupportedBlockType(String),

    #[error("Unsupported mark: {0}")]
    UnsupportedMark(String),

    #[error("Encoding error: {0}")]
    Encoding(String),

    #[error("Font not found: {0}")]
    FontNotFound(String),

    #[error("Image error: {0}")]
    ImageError(String),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Invalid options: {0}")]
    InvalidOptions(String),
}

impl ConvertError {
    /// Stable machine-readable reason, shared by the native converter and the WASM exporter.
    pub fn code(&self) -> &'static str {
        match self {
            ConvertError::UnsupportedBlockType(_) => "UNSUPPORTED_BLOCK_TYPE",
            ConvertError::UnsupportedMark(_) => "UNSUPPORTED_MARK",
            ConvertError::Encoding(_) => "ENCODING_ERROR",
            ConvertError::FontNotFound(_) => "FONT_NOT_FOUND",
            ConvertError::ImageError(_) => "IMAGE_ERROR",
            ConvertError::ParseError(_) => "PARSE_ERROR",
            ConvertError::InvalidOptions(_) => "INVALID_OPTIONS",
        }
    }
}

// Convenience re-exports for common operations
pub fn to_json(doc: &Document) -> String {
    json::to_json(doc)
}

pub fn from_json(json_str: &str) -> Result<Document, ConvertError> {
    json::from_json(json_str)
}

pub fn to_plaintext(doc: &Document) -> String {
    plaintext::to_plaintext(doc)
}

#[cfg(feature = "html")]
pub fn to_html(doc: &Document) -> Result<String, ConvertError> {
    html::to_html(doc, &ExportOptions::default())
}

#[cfg(feature = "markdown")]
pub fn to_markdown(doc: &Document) -> String {
    markdown::to_markdown(doc)
}

#[cfg(feature = "docx")]
pub mod docx;
#[cfg(feature = "pdf")]
pub mod pdf;
