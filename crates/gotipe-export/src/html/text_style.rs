//! `fontFamily` and `fontSize` marks and the block attribute `dir`, as
//! `packages/core/src/document/text-style.ts` writes them: only valid values reach HTML.
use gotipe_core::{AttrValue, Block, Mark};

/// Hard bounds (px) of `fontSize`, as `FONT_SIZE_LIMITS`: only integers within them are written.
const FONT_SIZE_MIN: f64 = 6.0;
const FONT_SIZE_MAX: f64 = 96.0;

/// `<span style="font-family:…">` for `system`, `serif` or `mono`; `None` for any other value.
pub(super) fn font_family(mark: &Mark, html: &str) -> Option<String> {
    let family = match mark.attrs.get("family") {
        Some(AttrValue::String(name)) => match name.as_str() {
            "system" => "system-ui",
            "serif" => "serif",
            "mono" => "monospace",
            _ => return None,
        },
        _ => return None,
    };
    Some(format!(
        "<span style=\"font-family:{family}\">{html}</span>"
    ))
}

/// `<span style="font-size:Npx">` for an integer size within the bounds; `None` otherwise.
pub(super) fn font_size(mark: &Mark, html: &str) -> Option<String> {
    match mark.attrs.get("size") {
        Some(AttrValue::Number(size))
            if size.fract() == 0.0 && (FONT_SIZE_MIN..=FONT_SIZE_MAX).contains(size) =>
        {
            Some(format!(
                "<span style=\"font-size:{}px\">{html}</span>",
                *size as i64
            ))
        }
        _ => None,
    }
}

/// ` dir="…"` of a paragraph, heading or list item (the `TextDirection` extension).
pub(super) fn direction(block: &Block) -> String {
    match block.attrs.get("dir") {
        Some(AttrValue::String(dir)) if matches!(dir.as_str(), "ltr" | "rtl" | "auto") => {
            format!(" dir=\"{dir}\"")
        }
        _ => String::new(),
    }
}
