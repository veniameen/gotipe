use std::collections::HashMap;

use gotipe_schema::{AttrValue, Document, MarkSpec, NodeSpec};

use crate::state::EditorState;
use crate::transaction::Transaction;

/// Extension trait — the fundamental building block of GoTipe.
/// Every block type, mark, behavior is an extension.
pub trait Extension: Send + Sync {
    fn name(&self) -> &str;

    fn dependencies(&self) -> Vec<&str> {
        vec![]
    }

    fn nodes(&self) -> Vec<NodeSpec> {
        vec![]
    }

    fn marks(&self) -> Vec<MarkSpec> {
        vec![]
    }

    fn keybindings(&self) -> Vec<Keybinding> {
        vec![]
    }

    fn input_rules(&self) -> Vec<InputRule> {
        vec![]
    }

    fn paste_rules(&self) -> Vec<PasteRule> {
        vec![]
    }

    fn slash_commands(&self) -> Vec<SlashCommandDef> {
        vec![]
    }

    fn on_create(&self, _state: &EditorState) {}

    fn on_update(&self, _old: &EditorState, _new: &EditorState) {}

    fn on_destroy(&self) {}

    fn plugin(&self) -> Option<Box<dyn Plugin>> {
        None
    }

    fn default_config(&self) -> HashMap<String, AttrValue> {
        HashMap::new()
    }

    fn accessibility(&self) -> Option<BlockA11yConfig> {
        None
    }

    fn storage_key(&self) -> Option<&str> {
        None
    }
}

/// Plugin trait for stateful extensions
pub trait Plugin: Send + Sync {
    fn apply(&self, tr: &Transaction, doc: &Document) -> Box<dyn PluginState>;

    fn decorations(&self, _state: &EditorState) -> Vec<Decoration> {
        vec![]
    }
}

/// State that a plugin can hold
pub trait PluginState: Send + Sync {
    fn as_any(&self) -> &dyn std::any::Any;
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InputRule {
    pub pattern: String,
    pub block_type: Option<String>,
    pub mark_type: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PasteRule {
    pub mime_types: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Keybinding {
    pub key: String,
    pub command_name: String,
    pub when: Option<WhenCondition>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SlashCommandDef {
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub group: String,
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum WhenCondition {
    InTable,
    InCodeBlock,
    InList,
    InBlockquote,
    Custom(String),
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum Decoration {
    Widget {
        block_id: String,
        offset: usize,
        content: String,
    },
    Inline {
        block_id: String,
        from: usize,
        to: usize,
        class: String,
    },
    Block {
        block_id: String,
        class: String,
    },
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BlockA11yConfig {
    pub role: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub landmark: Option<String>,
}
