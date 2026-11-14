use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::attr::AttrSpec;

/// MarkSpec — определение inline formatting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkSpec {
    pub name: String,
    /// Может ли mark пересекаться с другими marks этого типа
    pub exclusive_group: Option<String>,
    /// Атрибуты (например href для link)
    pub attrs: HashMap<String, AttrSpec>,
    /// Приоритет рендеринга (порядок вложенности в HTML)
    pub rank: u32,
    /// Отрезок с этой разметкой — один неделимый элемент строки (упоминание, формула).
    /// Его текст — запасное представление; см. docs/development/inline-atoms.md.
    #[serde(default)]
    pub atomic: bool,
}
