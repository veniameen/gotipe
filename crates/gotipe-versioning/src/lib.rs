pub mod diff;
pub mod manager;
pub mod snapshot;
pub mod version;

pub use diff::{BlockChange, TextChange, VersionDiff};
pub use manager::VersionManager;
pub use snapshot::IncrementalSnapshot;
pub use version::{Version, VersionId, VersionType};
