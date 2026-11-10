use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AttrValue {
    String(String),
    Number(f64),
    Bool(bool),
    Array(Vec<AttrValue>),
    Object(std::collections::BTreeMap<String, AttrValue>),
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttrSpec {
    pub attr_type: AttrType,
    pub default: Option<AttrValue>,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AttrType {
    String,
    Number,
    Bool,
    Enum(Vec<std::string::String>),
    Array,
    Object,
}
