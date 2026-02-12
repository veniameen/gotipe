use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::attr::AttrSpec;

/// NodeSpec — определение типа блока
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSpec {
    /// Имя типа (например "paragraph", "heading")
    pub name: String,

    /// Группы, к которым принадлежит node (например "block", "inline")
    pub group: Vec<String>,

    /// Какой контент допускается
    pub content: ContentRule,

    /// Атрибуты с default values и validation
    pub attrs: HashMap<String, AttrSpec>,

    /// Может ли быть top-level блоком
    pub top_level: bool,

    /// Допускает ли inline marks
    pub marks_allowed: MarksRule,

    /// Является ли leaf node (без children)
    pub leaf: bool,

    /// Может ли содержать nested blocks (children)
    pub allows_children: bool,

    /// Допустимые типы children
    pub child_types: Option<Vec<String>>,
}

/// Правило для content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ContentRule {
    /// Rich text (TextSpan[])
    RichText,
    /// Raw text (код, формулы)
    RawText,
    /// No content (divider, image)
    Empty,
}

/// Правило для marks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarksRule {
    /// Все marks допускаются
    All,
    /// Конкретный набор marks
    Only(Vec<String>),
    /// Marks запрещены
    None,
}
