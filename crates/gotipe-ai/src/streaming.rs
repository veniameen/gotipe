use serde::{Deserialize, Serialize};

/// Configuration for AI streaming responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingConfig {
    /// Maximum time to wait for a response (ms)
    pub timeout_ms: u64,
    /// Maximum retries
    pub max_retries: u32,
    /// Base delay for exponential backoff (ms)
    pub base_delay_ms: u64,
    /// Maximum backoff delay (ms)
    pub max_delay_ms: u64,
}

impl Default for StreamingConfig {
    fn default() -> Self {
        StreamingConfig {
            timeout_ms: 30_000,
            max_retries: 3,
            base_delay_ms: 1_000,
            max_delay_ms: 16_000,
        }
    }
}

impl StreamingConfig {
    /// Calculate backoff delay for a given retry attempt (exponential: 1s, 2s, 4s, max 16s)
    pub fn backoff_delay(&self, attempt: u32) -> u64 {
        let delay = self.base_delay_ms * 2u64.pow(attempt);
        delay.min(self.max_delay_ms)
    }

    /// Parse retry-after header value
    pub fn parse_retry_after(header_value: &str) -> Option<u64> {
        header_value.parse::<u64>().ok().map(|s| s * 1000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exponential_backoff() {
        let config = StreamingConfig::default();
        assert_eq!(config.backoff_delay(0), 1_000);
        assert_eq!(config.backoff_delay(1), 2_000);
        assert_eq!(config.backoff_delay(2), 4_000);
        assert_eq!(config.backoff_delay(3), 8_000);
        assert_eq!(config.backoff_delay(4), 16_000);
        assert_eq!(config.backoff_delay(5), 16_000); // capped at max
    }

    #[test]
    fn test_parse_retry_after() {
        assert_eq!(StreamingConfig::parse_retry_after("5"), Some(5_000));
        assert_eq!(StreamingConfig::parse_retry_after("invalid"), None);
    }
}
