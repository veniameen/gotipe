//! Structural editing transfers character identities so concurrent edits follow
//! text across a split/merge instead of targeting a deleted block.
use super::{Change, ContentKind, Position, ReplicaOp, ReplicaState};
use gotipe_core::{Document, Step, TransformError};

pub(crate) fn prepare(
    state: &mut ReplicaState,
    target: &Document,
    steps: &[Step],
    peer: &str,
    clock: &mut u64,
) -> Result<Vec<ReplicaOp>, TransformError> {
    let mut changes = Vec::new();
    if let [Step::MergeBlocks {
        block_id: source,
        target_id,
    }] = steps
    {
        if target.find_block(source).is_none() && target.find_block(target_id).is_some() {
            if let (Some(_), Some(destination)) =
                (state.nodes.get(&source.0), state.nodes.get(&target_id.0))
            {
                let last = destination
                    .visible_chars()
                    .last()
                    .map(|ch| ch.position.clone());
                changes.push(Change::MoveTextRange {
                    source: source.clone(),
                    target: target_id.clone(),
                    from: None,
                    to: None,
                    prefix: Position::between(
                        last.as_ref(),
                        None,
                        &crate::clock::next_id(*clock, peer)?,
                    ),
                });
            }
        }
    } else if let [Step::SplitBlock { block_id, offset }] = steps {
        if let (Some(source), Some((parent, index))) = (
            state.nodes.get(&block_id.0),
            target.parent_and_index(block_id),
        ) {
            let siblings = parent
                .as_ref()
                .and_then(|p| target.find_block(p))
                .map(|p| &p.children)
                .unwrap_or(&target.blocks);
            if let Some(new) = siblings
                .get(index + 1)
                .filter(|block| !state.nodes.contains_key(&block.id.0))
            {
                let chars = source.visible_chars();
                let mut units = 0;
                let boundary = chars.iter().find_map(|ch| {
                    let at_boundary = units == *offset;
                    units += ch.value.len_utf16();
                    if at_boundary {
                        Some(ch.position.clone())
                    } else {
                        None
                    }
                });
                if let Some(from) = boundary {
                    let next = siblings
                        .get(index + 2)
                        .and_then(|b| state.nodes.get(&b.id.0));
                    changes.push(Change::CreateBlock {
                        block_id: new.id.clone(),
                        parent,
                        block_type: new.block_type.clone(),
                        kind: ContentKind::from(&new.content),
                        position: Position::between(
                            Some(&source.position),
                            next.map(|n| &n.position),
                            &crate::clock::next_id(*clock, peer)?,
                        ),
                    });
                    changes.push(Change::MoveTextRange {
                        source: block_id.clone(),
                        target: new.id.clone(),
                        from: Some(from),
                        to: None,
                        prefix: Position::initial(0),
                    });
                }
            }
        }
    }
    changes
        .into_iter()
        .map(|change| {
            let id = crate::clock::next_id(*clock, peer)?;
            *clock = id.lamport;
            let op = ReplicaOp { id, change };
            state.apply(&op);
            Ok(op)
        })
        .collect()
}
