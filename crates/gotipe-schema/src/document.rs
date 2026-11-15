use serde::{Deserialize, Serialize, Serializer};
use std::collections::HashMap;

use crate::attr::AttrValue;

/// Writes attribute keys in sorted order. A `HashMap` iterates in an order of its own, so
/// replicas with equal attributes wrote different JSON (D-82); nested objects are
/// `BTreeMap`s already.
fn sorted_attrs<S: Serializer>(
    attrs: &HashMap<String, AttrValue>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.collect_map(sorted_entries(attrs))
}

/// Not generic over the serializer: the sort is compiled once.
fn sorted_entries(attrs: &HashMap<String, AttrValue>) -> Vec<(&String, &AttrValue)> {
    let mut entries: Vec<_> = attrs.iter().collect();
    entries.sort_unstable_by(|left, right| left.0.cmp(right.0));
    entries
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BlockId(pub String);

impl BlockId {
    pub fn new() -> Self {
        BlockId(uuid::Uuid::now_v7().to_string())
    }
}

impl Default for BlockId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for BlockId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub blocks: Vec<Block>,
    pub version: u64,
}

impl Document {
    pub fn new() -> Self {
        Document {
            blocks: Vec::new(),
            version: 0,
        }
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn find_block(&self, id: &BlockId) -> Option<&Block> {
        self.flatten().find(|b| &b.id == id)
    }

    pub fn find_block_mut(&mut self, id: &BlockId) -> Option<&mut Block> {
        fn find_in_blocks<'a>(blocks: &'a mut [Block], id: &BlockId) -> Option<&'a mut Block> {
            for block in blocks.iter_mut() {
                if &block.id == id {
                    return Some(block);
                }
                if let Some(found) = find_in_blocks(&mut block.children, id) {
                    return Some(found);
                }
            }
            None
        }
        find_in_blocks(&mut self.blocks, id)
    }

    pub fn remove_block(&mut self, id: &BlockId) -> Option<Block> {
        fn remove_from_blocks(blocks: &mut Vec<Block>, id: &BlockId) -> Option<Block> {
            if let Some(pos) = blocks.iter().position(|b| &b.id == id) {
                return Some(blocks.remove(pos));
            }
            for block in blocks.iter_mut() {
                if let Some(found) = remove_from_blocks(&mut block.children, id) {
                    return Some(found);
                }
            }
            None
        }
        remove_from_blocks(&mut self.blocks, id)
    }

    /// A block identity must be unique across the entire document tree.
    pub fn duplicate_block_id(&self) -> Option<&BlockId> {
        let mut ids = std::collections::HashSet::new();
        self.flatten().find_map(|block| {
            if ids.insert(&block.id) {
                None
            } else {
                Some(&block.id)
            }
        })
    }

    /// Recursive flattening of all blocks (depth-first)
    pub fn flatten(&self) -> impl Iterator<Item = &Block> {
        let mut result = Vec::new();
        fn collect<'a>(blocks: &'a [Block], result: &mut Vec<&'a Block>) {
            for block in blocks {
                result.push(block);
                collect(&block.children, result);
            }
        }
        collect(&self.blocks, &mut result);
        result.into_iter()
    }

    /// Find parent block id and index of a block
    pub fn parent_and_index(&self, id: &BlockId) -> Option<(Option<BlockId>, usize)> {
        fn find_in(
            blocks: &[Block],
            id: &BlockId,
            parent_id: Option<&BlockId>,
        ) -> Option<(Option<BlockId>, usize)> {
            for (i, block) in blocks.iter().enumerate() {
                if &block.id == id {
                    return Some((parent_id.cloned(), i));
                }
                if let Some(result) = find_in(&block.children, id, Some(&block.id)) {
                    return Some(result);
                }
            }
            None
        }
        find_in(&self.blocks, id, None)
    }
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: BlockId,
    pub block_type: String,
    #[serde(serialize_with = "sorted_attrs")]
    pub attrs: HashMap<String, AttrValue>,
    pub content: BlockContent,
    pub children: Vec<Block>,
}

impl Block {
    pub fn new_paragraph() -> Self {
        Block {
            id: BlockId::new(),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(Vec::new()),
            children: Vec::new(),
        }
    }

    pub fn new_with_type(block_type: &str, content: BlockContent) -> Self {
        Block {
            id: BlockId::new(),
            block_type: block_type.into(),
            attrs: HashMap::new(),
            content,
            children: Vec::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        match &self.content {
            BlockContent::RichText(spans) => spans.iter().all(|s| s.text.is_empty()),
            BlockContent::Raw(s) => s.is_empty(),
            BlockContent::Empty => true,
        }
    }

    /// Length in UTF-16 code units, matching JavaScript and DOM text offsets.
    pub fn text_length(&self) -> usize {
        match &self.content {
            BlockContent::RichText(spans) => {
                spans.iter().map(|s| s.text.encode_utf16().count()).sum()
            }
            BlockContent::Raw(s) => s.encode_utf16().count(),
            BlockContent::Empty => 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum BlockContent {
    RichText(Vec<TextSpan>),
    Empty,
    Raw(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextSpan {
    pub text: String,
    pub marks: Vec<Mark>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Mark {
    pub mark_type: String,
    #[serde(serialize_with = "sorted_attrs")]
    pub attrs: HashMap<String, AttrValue>,
}

impl Mark {
    pub fn new(mark_type: &str) -> Self {
        Mark {
            mark_type: mark_type.into(),
            attrs: HashMap::new(),
        }
    }

    pub fn with_attr(mut self, key: &str, value: AttrValue) -> Self {
        self.attrs.insert(key.into(), value);
        self
    }
}
