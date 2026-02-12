use crate::transaction::TransformError;

#[derive(Debug, Clone, thiserror::Error)]
pub enum GoTipeError {
    #[error("Transform error: {0}")]
    Transform(#[from] TransformError),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Schema error: {0}")]
    Schema(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Extension error: {0}")]
    Extension(String),
}
