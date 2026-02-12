use std::collections::HashMap;
use std::hash::Hash;

use serde::{Deserialize, Serialize};

/// Last-Writer-Wins register map for block attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LwwMap<K: Eq + Hash + Clone, V: Clone> {
    entries: HashMap<K, LwwEntry<V>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LwwEntry<V: Clone> {
    value: V,
    timestamp: u64,
    peer_id: String,
}

impl<K: Eq + Hash + Clone, V: Clone> LwwMap<K, V> {
    pub fn new() -> Self {
        LwwMap {
            entries: HashMap::new(),
        }
    }

    pub fn set(&mut self, key: K, value: V, timestamp: u64, peer_id: &str) {
        let should_update = match self.entries.get(&key) {
            Some(existing) => {
                timestamp > existing.timestamp
                    || (timestamp == existing.timestamp && peer_id > existing.peer_id.as_str())
            }
            None => true,
        };

        if should_update {
            self.entries.insert(
                key,
                LwwEntry {
                    value,
                    timestamp,
                    peer_id: peer_id.into(),
                },
            );
        }
    }

    pub fn get(&self, key: &K) -> Option<&V> {
        self.entries.get(key).map(|e| &e.value)
    }

    pub fn merge(&mut self, other: &LwwMap<K, V>) {
        for (key, entry) in &other.entries {
            let should_update = match self.entries.get(key) {
                Some(existing) => {
                    entry.timestamp > existing.timestamp
                        || (entry.timestamp == existing.timestamp
                            && entry.peer_id > existing.peer_id)
                }
                None => true,
            };

            if should_update {
                self.entries.insert(key.clone(), entry.clone());
            }
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (&K, &V)> {
        self.entries.iter().map(|(k, e)| (k, &e.value))
    }
}

impl<K: Eq + Hash + Clone, V: Clone> Default for LwwMap<K, V> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_and_get() {
        let mut map: LwwMap<String, String> = LwwMap::new();
        map.set("key".into(), "value".into(), 1, "peer_a");
        assert_eq!(map.get(&"key".into()), Some(&"value".into()));
    }

    #[test]
    fn test_later_timestamp_wins() {
        let mut map: LwwMap<String, String> = LwwMap::new();
        map.set("key".into(), "old".into(), 1, "peer_a");
        map.set("key".into(), "new".into(), 2, "peer_a");
        assert_eq!(map.get(&"key".into()), Some(&"new".into()));
    }

    #[test]
    fn test_earlier_timestamp_ignored() {
        let mut map: LwwMap<String, String> = LwwMap::new();
        map.set("key".into(), "new".into(), 2, "peer_a");
        map.set("key".into(), "old".into(), 1, "peer_a");
        assert_eq!(map.get(&"key".into()), Some(&"new".into()));
    }

    #[test]
    fn test_same_timestamp_peer_id_breaks_tie() {
        let mut map: LwwMap<String, String> = LwwMap::new();
        map.set("key".into(), "from_a".into(), 1, "peer_a");
        map.set("key".into(), "from_b".into(), 1, "peer_b");
        assert_eq!(map.get(&"key".into()), Some(&"from_b".into()));
    }

    #[test]
    fn test_merge() {
        let mut map1: LwwMap<String, String> = LwwMap::new();
        map1.set("key1".into(), "a".into(), 1, "peer_a");

        let mut map2: LwwMap<String, String> = LwwMap::new();
        map2.set("key1".into(), "b".into(), 2, "peer_b");
        map2.set("key2".into(), "c".into(), 1, "peer_b");

        map1.merge(&map2);
        assert_eq!(map1.get(&"key1".into()), Some(&"b".into())); // later timestamp
        assert_eq!(map1.get(&"key2".into()), Some(&"c".into())); // new key
    }
}
