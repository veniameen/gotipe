use serde::{Deserialize, Serialize};

use crate::commands::AiCommand;
use crate::context::AiContext;

/// AI provider trait — implementations connect to different LLM backends
pub trait AiProvider: Send + Sync {
    /// Complete inline (autocomplete)
    fn complete(&self, context: &AiContext, cursor_offset: usize) -> Result<String, AiError>;

    /// Execute an AI command (rewrite, expand, summarize, etc.)
    fn command(
        &self,
        context: &AiContext,
        command: &AiCommand,
        prompt: &str,
    ) -> Result<String, AiError>;

    /// Get the provider name
    fn name(&self) -> &str;
}

/// AI provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub provider: ProviderType,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub temperature: f32,
    pub max_tokens: u32,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProviderType {
    OpenAI,
    Anthropic,
    Gemini,
    Custom,
}

impl Default for AiConfig {
    fn default() -> Self {
        AiConfig {
            provider: ProviderType::OpenAI,
            api_key: None,
            model: None,
            temperature: 0.1,
            max_tokens: 128,
            base_url: None,
        }
    }
}

impl AiConfig {
    /// Config for inline completions
    pub fn inline() -> Self {
        AiConfig {
            temperature: 0.1,
            max_tokens: 128,
            ..Default::default()
        }
    }

    /// Config for AI commands
    pub fn command() -> Self {
        AiConfig {
            temperature: 0.3,
            max_tokens: 2048,
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum AiError {
    #[error("Provider not configured")]
    NotConfigured,

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Rate limited, retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64 },

    #[error("Timeout")]
    Timeout,

    #[error("Context too large: {tokens} tokens exceeds max {max_tokens}")]
    ContextTooLarge { tokens: usize, max_tokens: usize },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AiConfig::default();
        assert_eq!(config.temperature, 0.1);
        assert_eq!(config.max_tokens, 128);
    }

    #[test]
    fn test_inline_config() {
        let config = AiConfig::inline();
        assert_eq!(config.temperature, 0.1);
        assert_eq!(config.max_tokens, 128);
    }

    #[test]
    fn test_command_config() {
        let config = AiConfig::command();
        assert_eq!(config.temperature, 0.3);
        assert_eq!(config.max_tokens, 2048);
    }
}
