//! Identity-based document replication. Text positions are independent of DOM offsets;
//! all offsets are resolved locally before changes enter the replication log.
mod anchors;
mod diff;
pub use anchors::TextAnchor;
mod marks;
mod position;
mod projection;
mod routing;
mod structural;
mod types;
pub(crate) use structural::prepare;

pub(crate) use diff::reconcile;
pub(crate) use marks::MarkList;
pub use position::{Position, PositionPart};
pub(crate) use projection::ReplicaState;
pub use types::{Change, ContentKind, ReplicaOp};

mod validation;
pub(crate) use validation::valid_change_clocks;
