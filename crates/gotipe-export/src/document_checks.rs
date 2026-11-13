use crate::ConvertError;
use gotipe_core::{AttrValue, Block, BlockContent};

pub(crate) fn color_hex(value: &str) -> Option<String> {
    let lower = value.trim().to_ascii_lowercase();
    let named = match lower.as_str() {
        "black" => "000000",
        "white" => "ffffff",
        "red" => "ff0000",
        "green" => "008000",
        "blue" => "0000ff",
        "yellow" => "ffff00",
        "cyan" | "aqua" => "00ffff",
        "magenta" | "fuchsia" => "ff00ff",
        "gray" | "grey" => "808080",
        "silver" => "c0c0c0",
        "maroon" => "800000",
        "olive" => "808000",
        "lime" => "00ff00",
        "teal" => "008080",
        "navy" => "000080",
        "purple" => "800080",
        "orange" => "ffa500",
        "transparent" => return None,
        _ => "",
    };
    if !named.is_empty() {
        return Some(named.into());
    }
    let hex = lower.strip_prefix('#')?;
    if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    match hex.len() {
        6 => Some(hex.into()),
        3 => Some(hex.chars().flat_map(|c| [c, c]).collect()),
        _ => None,
    }
}

pub(crate) fn validate_marks(blocks: &[Block]) -> Result<(), ConvertError> {
    for block in blocks {
        if let BlockContent::RichText(spans) = &block.content {
            for span in spans {
                for mark in &span.marks {
                    match mark.mark_type.as_str() {
                        "bold" | "italic" | "underline" | "strikethrough" | "code"
                        | "superscript" | "subscript" => {}
                        "highlight" | "textColor" => {
                            let value = match mark.attrs.get("color") {
                                Some(AttrValue::String(value)) => value.as_str(),
                                _ if mark.mark_type == "highlight" => "yellow",
                                _ => {
                                    return Err(ConvertError::Encoding(
                                        "Text color is missing".into(),
                                    ))
                                }
                            };
                            if color_hex(value).is_none() {
                                return Err(ConvertError::Encoding(format!(
                                    "Unsupported color: {value}"
                                )));
                            }
                        }
                        // A link that cannot be clickable in a standalone file keeps its text.
                        "link" => {}
                        other => return Err(ConvertError::UnsupportedMark(other.into())),
                    }
                }
            }
        }
        validate_marks(&block.children)?;
    }
    Ok(())
}
