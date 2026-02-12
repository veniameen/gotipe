use gotipe_core::Document;

use crate::diff::VersionDiff;
use crate::version::{Version, VersionId, VersionType};

/// Manages document versions
#[derive(Debug, Clone)]
pub struct VersionManager {
    versions: Vec<Version>,
    document_id: String,
}

impl VersionManager {
    pub fn new(document_id: &str) -> Self {
        VersionManager {
            versions: Vec::new(),
            document_id: document_id.into(),
        }
    }

    /// Create a new named version
    pub fn create_version(
        &mut self,
        name: &str,
        created_by: &str,
        state_vector: Vec<u8>,
    ) -> &Version {
        let version = Version::new_named(&self.document_id, created_by, name, state_vector);
        self.versions.push(version);
        self.versions.last().unwrap()
    }

    /// Create an auto-save version
    pub fn create_auto_save(&mut self, created_by: &str, state_vector: Vec<u8>) -> &Version {
        let version = Version::new_auto_save(&self.document_id, created_by, state_vector);
        self.versions.push(version);
        self.versions.last().unwrap()
    }

    /// List all versions for this document
    pub fn list_versions(&self) -> &[Version] {
        &self.versions
    }

    /// Get a specific version by ID
    pub fn get_version(&self, version_id: &VersionId) -> Option<&Version> {
        self.versions.iter().find(|v| v.id == *version_id)
    }

    /// Restore a version — returns the state vector to apply
    pub fn restore_version(
        &mut self,
        version_id: &VersionId,
        restored_by: &str,
    ) -> Option<Vec<u8>> {
        let version = self.versions.iter().find(|v| v.id == *version_id)?;
        let state = version.state_vector.clone();

        // Create a restore point
        let restore_point = Version {
            id: VersionId::new(),
            document_id: self.document_id.clone(),
            name: Some(format!(
                "Restored from {}",
                version.name.as_deref().unwrap_or("unnamed")
            )),
            version_type: VersionType::RestorePoint {
                restored_from: version_id.clone(),
            },
            state_vector: state.clone(),
            created_by: restored_by.into(),
            created_at: chrono::Utc::now(),
            description: None,
            metadata: std::collections::HashMap::new(),
            snapshot_size: state.len() as u64,
        };
        self.versions.push(restore_point);

        Some(state)
    }

    /// Compare two versions of a document
    pub fn compare_versions(&self, from_doc: &Document, to_doc: &Document) -> VersionDiff {
        VersionDiff::compute(from_doc, to_doc)
    }

    pub fn version_count(&self) -> usize {
        self.versions.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_list_versions() {
        let mut manager = VersionManager::new("doc1");
        manager.create_version("Draft 1", "alice", vec![1, 2, 3]);
        manager.create_auto_save("alice", vec![4, 5, 6]);
        assert_eq!(manager.version_count(), 2);
    }

    #[test]
    fn test_restore_version() {
        let mut manager = VersionManager::new("doc1");
        manager.create_version("Draft 1", "alice", vec![1, 2, 3]);
        let version_id = manager.list_versions()[0].id.clone();

        let state = manager.restore_version(&version_id, "alice").unwrap();
        assert_eq!(state, vec![1, 2, 3]);
        // Should have created a restore point
        assert_eq!(manager.version_count(), 2);
    }
}
