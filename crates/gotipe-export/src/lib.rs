pub mod json;
pub mod plaintext;

#[cfg(feature = "html")]
pub mod html;

#[cfg(feature = "markdown")]
pub mod markdown;

use gotipe_core::Document;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub inline_styles: bool,
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
