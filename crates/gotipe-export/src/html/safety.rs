//! Ports of `toSafeHref`, `toSafeImageSrc` and `toSafeColor` from @gotipe/core:
//! HTML carries the same validated URLs and colors whichever serializer wrote it.
use super::js;

pub(crate) fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Only web/mail links and relative references may reach the reader.
pub(crate) fn safe_href(href: &str) -> Option<String> {
    let value = js::trim(href);
    if value.is_empty() {
        return None;
    }
    let compact: String = value
        .chars()
        .filter(|&c| !(js::is_space(c) || c <= '\u{1f}' || c == '\u{7f}'))
        .collect();
    match scheme(&compact) {
        None => Some(value.to_owned()),
        Some(scheme) => matches!(
            scheme.to_ascii_lowercase().as_str(),
            "http" | "https" | "mailto"
        )
        .then(|| value.to_owned()),
    }
}

/// `^([a-zA-Z][a-zA-Z0-9+.-]*):`
fn scheme(value: &str) -> Option<&str> {
    let end = value.find(':')?;
    let name = &value[..end];
    let mut bytes = name.bytes();
    let valid = bytes.next().is_some_and(|b| b.is_ascii_alphabetic())
        && bytes.all(|b| b.is_ascii_alphanumeric() || b"+.-".contains(&b));
    valid.then_some(name)
}

/// Raster `data:` images are allowed; executable data and non-web schemes are not.
pub(crate) fn safe_image_src(src: &str) -> Option<String> {
    let value = js::trim(src);
    if raster_data_url(value) {
        return Some(value.to_owned());
    }
    let href = safe_href(value)?;
    let mail = href
        .get(..7)
        .is_some_and(|start| start.eq_ignore_ascii_case("mailto:"));
    (!mail).then_some(href)
}

/// `^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$` (case-insensitive).
fn raster_data_url(value: &str) -> bool {
    ["png", "jpeg", "gif", "webp"].iter().any(|format| {
        let prefix = format!("data:image/{format};base64,");
        value
            .get(..prefix.len())
            .is_some_and(|start| start.eq_ignore_ascii_case(&prefix))
            && value.len() > prefix.len()
            && value[prefix.len()..].chars().all(|c| {
                c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=') || js::is_space(c)
            })
    })
}

/// Inert CSS colors only: no declarations, URLs, variable references or escapes.
pub(crate) fn safe_color(value: &str) -> bool {
    if !value.is_empty() && value.bytes().all(|c| c.is_ascii_alphabetic()) {
        return true;
    }
    if let Some(hex) = value.strip_prefix('#') {
        return (3..=8).contains(&hex.len()) && hex.bytes().all(|c| c.is_ascii_hexdigit());
    }
    let Some((name, arguments)) = value.split_once('(') else {
        return false;
    };
    let Some(arguments) = arguments.strip_suffix(')') else {
        return false;
    };
    ["rgb", "rgba", "hsl", "hsla"]
        .iter()
        .any(|candidate| name.eq_ignore_ascii_case(candidate))
        && !arguments.is_empty()
        && arguments
            .bytes()
            .all(|c| c.is_ascii_digit() || b".% ,/+-".contains(&c))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_follow_the_editor_rules() {
        assert_eq!(safe_href(" guide.md ").as_deref(), Some("guide.md"));
        assert_eq!(safe_href("//cdn.test/x").as_deref(), Some("//cdn.test/x"));
        assert_eq!(
            safe_href("\u{a0}HTTPS://a.test").as_deref(),
            Some("HTTPS://a.test")
        );
        for unsafe_href in [
            "java\nscript:alert(1)",
            "data:text/html,x",
            "vbscript:x",
            " ",
        ] {
            assert_eq!(safe_href(unsafe_href), None, "{unsafe_href:?}");
        }
        assert!(safe_image_src("data:image/webp;base64,UklG RkY=").is_some());
        assert!(safe_image_src("DATA:IMAGE/PNG;BASE64,iVBO").is_some());
        assert!(safe_image_src("data:image/svg+xml;base64,PHN2Zz4=").is_none());
        assert!(safe_image_src("mailto:a@b.test").is_none());
        assert_eq!(
            safe_image_src("images/a.png").as_deref(),
            Some("images/a.png")
        );
    }

    #[test]
    fn colors_preserve_inert_css_without_allowing_declarations() {
        for color in [
            "#ab4",
            "#aabbccdd",
            "rebeccapurple",
            "RGB(12 34 56 / 50%)",
            "hsl(40, 50%, 60%)",
        ] {
            assert!(safe_color(color), "{color}");
        }
        for color in [
            "",
            "red;background:url(x)",
            "url(x)",
            "var(--x)",
            "rgb(1)\" onclick=\"x",
            "rgb(1\\32 3)",
        ] {
            assert!(!safe_color(color), "unsafe color {color:?}");
        }
    }
}
