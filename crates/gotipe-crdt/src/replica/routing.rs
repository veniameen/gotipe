use super::{Position, ReplicaState};
use gotipe_core::BlockId;

#[derive(Debug, Clone)]
pub(super) struct TextRoute {
    source: BlockId,
    target: BlockId,
    from: Option<Position>,
    to: Option<Position>,
    prefix: Position,
}
impl TextRoute {
    fn contains(&self, position: &Position) -> bool {
        self.from.as_ref().is_none_or(|from| position >= from)
            && self.to.as_ref().is_none_or(|to| position < to)
    }
    fn position(&self, original: &Position) -> Position {
        let mut parts = self.prefix.0.clone();
        parts.extend(original.0.clone());
        Position(parts)
    }
}
impl ReplicaState {
    pub(super) fn reset_routes(&mut self, block_id: &BlockId) {
        self.routes.retain(|route| route.source != *block_id);
    }
    pub(super) fn route_insert(
        &self,
        block_id: &BlockId,
        position: &Position,
    ) -> (BlockId, Position) {
        let mut block = block_id.clone();
        let mut position = position.clone();
        for route in &self.routes {
            if route.source == block && route.contains(&position) {
                block = route.target.clone();
                position = route.position(&position);
            }
        }
        (block, position)
    }
    pub(super) fn move_text(
        &mut self,
        source: &BlockId,
        target: &BlockId,
        from: &Option<Position>,
        to: &Option<Position>,
        prefix: &Position,
    ) {
        let route = TextRoute {
            source: source.clone(),
            target: target.clone(),
            from: from.clone(),
            to: to.clone(),
            prefix: prefix.clone(),
        };
        let chars: Vec<_> = self
            .nodes
            .get(source.0.as_str())
            .map(|node| {
                node.chars
                    .values()
                    .filter(|ch| route.contains(&ch.position))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        if !self.nodes.contains_key(&target.0) {
            return;
        }
        for mut ch in chars {
            self.nodes.get_mut(&source.0).unwrap().chars.remove(&ch.id);
            ch.position = route.position(&ch.position);
            self.nodes
                .get_mut(&target.0)
                .unwrap()
                .chars
                .insert(ch.id.clone(), ch);
        }
        self.routes.push(route);
    }
}
