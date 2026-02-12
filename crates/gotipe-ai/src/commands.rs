use serde::{Deserialize, Serialize};

/// Built-in AI commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AiCommand {
    Rewrite,
    Expand,
    Summarize,
    Translate { language: String },
    FixGrammar,
    ChangeTone { tone: String },
}

impl AiCommand {
    /// Get the prompt template for this command
    pub fn prompt_template(&self) -> &str {
        match self {
            AiCommand::Rewrite => "Rewrite the following text to improve clarity and readability while preserving the original meaning:",
            AiCommand::Expand => "Expand the following text with more detail and explanation:",
            AiCommand::Summarize => "Summarize the following text concisely:",
            AiCommand::Translate { .. } => "Translate the following text to {language}:",
            AiCommand::FixGrammar => "Fix all grammar and spelling errors in the following text while preserving the original meaning:",
            AiCommand::ChangeTone { .. } => "Rewrite the following text with a {tone} tone:",
        }
    }

    /// Interpolate parameters into the prompt template
    pub fn build_prompt(&self, text: &str) -> String {
        let template = self.prompt_template();
        let prompt = match self {
            AiCommand::Translate { language } => template.replace("{language}", language),
            AiCommand::ChangeTone { tone } => template.replace("{tone}", tone),
            _ => template.to_string(),
        };
        format!("{prompt}\n\n{text}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_prompt_simple() {
        let cmd = AiCommand::Rewrite;
        let prompt = cmd.build_prompt("Hello World");
        assert!(prompt.contains("Hello World"));
        assert!(prompt.contains("Rewrite"));
    }

    #[test]
    fn test_build_prompt_translate() {
        let cmd = AiCommand::Translate {
            language: "Spanish".into(),
        };
        let prompt = cmd.build_prompt("Hello");
        assert!(prompt.contains("Spanish"));
    }

    #[test]
    fn test_build_prompt_change_tone() {
        let cmd = AiCommand::ChangeTone {
            tone: "professional".into(),
        };
        let prompt = cmd.build_prompt("Hey!");
        assert!(prompt.contains("professional"));
    }
}
