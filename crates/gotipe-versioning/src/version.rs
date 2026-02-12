use std::collections::HashMap;

use chrono::{DateTime, Utc};
use gotipe_core::AttrValue;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct VersionId(pub String);

impl VersionId {
    pub fn new() -> Self {
        VersionId(uuid::Uuid::now_v7().to_string())
    }
}

impl Default for VersionId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionType {
    AutoSave,
    Named,
    Milestone { milestone_type: String },
    RestorePoint { restored_from: VersionId },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Version {
    pub id: VersionId,
    pub document_id: String,
    pub name: Option<String>,
    pub version_type: VersionType,
    pub state_vector: Vec<u8>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub description: Option<String>,
    pub metadata: HashMap<String, AttrValue>,
    pub snapshot_size: u64,
}

impl Version {
    pub fn new_auto_save(document_id: &str, created_by: &str, state_vector: Vec<u8>) -> Self {
        Version {
            id: VersionId::new(),
            document_id: document_id.into(),
            name: None,
            version_type: VersionType::AutoSave,
            snapshot_size: state_vector.len() as u64,
            state_vector,
            created_by: created_by.into(),
            created_at: Utc::now(),
            description: None,
            metadata: HashMap::new(),
        }
    }

    pub fn new_named(
        document_id: &str,
        created_by: &str,
        name: &str,
        state_vector: Vec<u8>,
    ) -> Self {
        Version {
            id: VersionId::new(),
            document_id: document_id.into(),
            name: Some(name.into()),
            version_type: VersionType::Named,
            snapshot_size: state_vector.len() as u64,
            state_vector,
            created_by: created_by.into(),
            created_at: Utc::now(),
            description: None,
            metadata: HashMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_auto_save_version() {
        let v = Version::new_auto_save("doc1", "user1", vec![1, 2, 3]);
        assert!(matches!(v.version_type, VersionType::AutoSave));
        assert_eq!(v.snapshot_size, 3);
    }

    #[test]
    fn test_create_named_version() {
        let v = Version::new_named("doc1", "user1", "Draft 1", vec![1, 2, 3]);
        assert!(matches!(v.version_type, VersionType::Named));
        assert_eq!(v.name, Some("Draft 1".into()));
    }
}
