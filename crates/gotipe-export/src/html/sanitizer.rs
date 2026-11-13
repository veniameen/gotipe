//! Strict sanitizer for HTML that does not come from GoTipe's own serializer.

/// HTML sanitizer using ammonia
pub struct HtmlSanitizer;

impl HtmlSanitizer {
    /// Strict sanitization — only allows safe HTML tags and attributes
    pub fn strict() -> ammonia::Builder<'static> {
        let mut builder = ammonia::Builder::default();
        builder
            .add_tags(&[
                "p",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "ul",
                "ol",
                "li",
                "a",
                "strong",
                "em",
                "u",
                "s",
                "code",
                "pre",
                "blockquote",
                "hr",
                "br",
                "img",
                "table",
                "tr",
                "td",
                "th",
                "thead",
                "tbody",
                "mark",
                "sup",
                "sub",
                "details",
                "summary",
                "div",
                "span",
            ])
            .add_tag_attributes("a", &["href", "target"])
            .add_tag_attributes("img", &["src", "alt", "width", "height"])
            .add_tag_attributes("td", &["colspan", "rowspan"])
            .add_tag_attributes("th", &["colspan", "rowspan"])
            .add_tag_attributes("ol", &["start"])
            .add_tag_attributes("code", &["class"])
            .add_tag_attributes("mark", &["style"])
            .add_tag_attributes("div", &["class"])
            .add_tag_attributes("span", &["class"])
            .url_schemes(std::collections::HashSet::from(["http", "https", "mailto"]))
            .link_rel(Some("noopener noreferrer"));
        builder
    }

    /// Sanitize HTML string
    pub fn sanitize(html: &str) -> String {
        Self::strict().clean(html).to_string()
    }

    /// Validate a URI (only http, https, mailto allowed)
    pub fn validate_uri(uri: &str) -> bool {
        let uri_lower = uri.trim().to_lowercase();
        uri_lower.starts_with("http://")
            || uri_lower.starts_with("https://")
            || uri_lower.starts_with("mailto:")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitizer_blocks_script() {
        let result = HtmlSanitizer::sanitize("<script>alert('xss')</script>");
        assert!(!result.contains("<script>"));
    }

    #[test]
    fn test_sanitizer_blocks_javascript_uri() {
        let result = HtmlSanitizer::sanitize("<a href=\"javascript:alert(1)\">click</a>");
        assert!(!result.contains("javascript:"));
    }

    #[test]
    fn test_validate_uri() {
        assert!(HtmlSanitizer::validate_uri("https://example.com"));
        assert!(HtmlSanitizer::validate_uri("http://example.com"));
        assert!(HtmlSanitizer::validate_uri("mailto:test@example.com"));
        assert!(!HtmlSanitizer::validate_uri("javascript:alert(1)"));
        assert!(!HtmlSanitizer::validate_uri("data:text/html,<h1>Hi</h1>"));
    }
}
