use std::collections::HashMap;
use std::hash::Hash;

use serde::{Deserialize, Serialize};

/// Generic CRDT Map with add-wins semantics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrdtMap<K: Eq + Hash + Clone, V: Clone> {
    entries: HashMap<K, CrdtMapEntry<V>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CrdtMapEntry<V: Clone> {
    value: V,
    deleted: bool,
    timestamp: u64,
    peer_id: String,
}

impl<K: Eq + Hash + Clone, V: Clone> CrdtMap<K, V> {
    pub fn new() -> Self {
        CrdtMap {
            entries: HashMap::new(),
        }
    }

    pub fn insert(&mut self, key: K, value: V, timestamp: u64, peer_id: &str) {
        self.entries.insert(
            key,
            CrdtMapEntry {
                value,
                deleted: false,
                timestamp,
                peer_id: peer_id.into(),
            },
        );
    }

    pub fn update(&mut self, key: K, value: V, timestamp: u64, peer_id: &str) {
        if let Some(entry) = self.entries.get_mut(&key) {
            if timestamp >= entry.timestamp {
                entry.value = value;
                entry.timestamp = timestamp;
                entry.peer_id = peer_id.into();
                entry.deleted = false;
            }
        } else {
            self.insert(key, value, timestamp, peer_id);
        }
    }

    pub fn delete(&mut self, key: &K, timestamp: u64, peer_id: &str) {
        if let Some(entry) = self.entries.get_mut(key) {
            if timestamp >= entry.timestamp {
                entry.deleted = true;
                entry.timestamp = timestamp;
                entry.peer_id = peer_id.into();
            }
        }
    }

    pub fn get(&self, key: &K) -> Option<&V> {
        self.entries
            .get(key)
            .filter(|e| !e.deleted)
            .map(|e| &e.value)
    }

    pub fn merge(&mut self, other: &CrdtMap<K, V>) {
        for (key, other_entry) in &other.entries {
            let should_update = match self.entries.get(key) {
                Some(local) => {
                    other_entry.timestamp > local.timestamp
                        || (other_entry.timestamp == local.timestamp
                            && other_entry.peer_id > local.peer_id)
                }
                None => true,
            };

            if should_update {
                self.entries.insert(key.clone(), other_entry.clone());
            }
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (&K, &V)> {
        self.entries
            .iter()
            .filter(|(_, e)| !e.deleted)
            .map(|(k, e)| (k, &e.value))
    }

    pub fn len(&self) -> usize {
        self.entries.values().filter(|e| !e.deleted).count()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl<K: Eq + Hash + Clone, V: Clone> Default for CrdtMap<K, V> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_and_get() {
        let mut map: CrdtMap<String, i32> = CrdtMap::new();
        map.insert("key".into(), 42, 1, "peer_a");
        assert_eq!(map.get(&"key".into()), Some(&42));
    }

    #[test]
    fn test_delete_removes_from_iteration() {
        let mut map: CrdtMap<String, i32> = CrdtMap::new();
        map.insert("key".into(), 42, 1, "peer_a");
        map.delete(&"key".into(), 2, "peer_a");
        assert_eq!(map.get(&"key".into()), None);
        assert_eq!(map.len(), 0);
    }

    #[test]
    fn test_merge_add_wins() {
        let mut map1: CrdtMap<String, i32> = CrdtMap::new();
        map1.insert("key".into(), 1, 1, "peer_a");

        let mut map2: CrdtMap<String, i32> = CrdtMap::new();
        map2.insert("key".into(), 2, 2, "peer_b");

        map1.merge(&map2);
        assert_eq!(map1.get(&"key".into()), Some(&2));
    }
}
