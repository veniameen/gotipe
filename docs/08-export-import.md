# GoTipe -- Document Conversion (Export/Import)

> **PDF: историческое предложение.** Упоминания Typst/docx-rs, оценки размеров и
> возможностей ниже не описывают текущий backend. GoTipe владеет PDF layout и
> OOXML rendering; актуальны [контракт экспорта](development/export-contract.md)
> и [политика зависимостей](development/dependencies.md).

> Исторический проектный документ. Сигнатуры, размеры, цены, сравнения и планы ниже
> не подтверждают текущую реализацию или доступный сервис. Актуальные контракты:
> [разработка](development/export-contract.md), [экспорт](development/export-contract.md),
> [Cloud](development/cloud-contract.md), [готовность выпуска](22-release-readiness.md).

## Обзор

`gotipe-export` -- Rust crate, реализующий конвертацию документов между форматами. Компилируется в WebAssembly (работает в браузере) и нативный binary (работает на сервере). Один и тот же код, одинаковый результат.

```
                        ┌──────────────────────────────┐
                        │       gotipe-export crate     │
                        │                              │
  Import ─────────────► │  ┌──────────────────────┐    │ ────────────► Export
                        │  │    Document Model     │    │
  HTML                  │  │  (gotipe-core types)  │    │  HTML
  Markdown              │  └──────────────────────┘    │  Markdown
  DOCX                  │       ▲          │           │  PDF
  Notion export         │       │          ▼           │  DOCX
  Google Docs paste     │  Importers   Exporters       │  Plain Text
                        │                              │  JSON
                        └──────────────────────────────┘
                                    │
                       ┌────────────┴────────────┐
                       │                         │
                  WASM (browser)          Native (server)
                  @gotipe/wasm            gotipe-export binary
```

---

## Форматы

### Export

| Формат | Crate/Module | Lazy-loadable | Размер (gzip) | Зависимости |
|--------|-------------|---------------|---------------|-------------|
| HTML | `gotipe-export::html` | Нет (в core bundle) | ~8KB | -- |
| Markdown | `gotipe-export::markdown` | Нет (в core bundle) | ~12KB | -- |
| Plain Text | `gotipe-export::plaintext` | Нет (в core bundle) | ~3KB | -- |
| JSON | `gotipe-core` (serde) | Нет (в core bundle) | ~2KB | serde_json |
| PDF | `gotipe-export::pdf` | Да | ~400KB | typst |
| DOCX | `gotipe-export::docx` | Да | ~60KB | docx-rs |
| **Total core bundle** | | | **~25KB** | |
| **Total с PDF + DOCX** | | | **~485KB** | |

### Import

| Формат | Crate/Module | Особенности |
|--------|-------------|-------------|
| HTML | `gotipe-export::html` | Sanitization, XSS prevention, round-trip с export |
| Markdown | `gotipe-export::markdown` | CommonMark + GFM + custom extensions |
| DOCX | `gotipe-export::docx` | Styles mapping, images extraction |
| Notion export | `gotipe-export::notion` | Markdown + CSV + metadata merge |
| Google Docs paste | `gotipe-export::gdocs` | HTML paste с Google-specific markup cleanup |
| JSON | `gotipe-core` (serde) | Нативная десериализация Document |

---

## Архитектура: Provider Pattern

### Export/Import Trait

Все конвертеры реализуют единый trait. Это позволяет подключать custom форматы без изменения core.

```rust
// crates/gotipe-export/src/lib.rs

use gotipe_core::Document;
use std::collections::HashMap;
use thiserror::Error;

/// Ошибки конвертации
#[derive(Debug, Error)]
pub enum ConvertError {
    #[error("Unsupported block type: {0}")]
    UnsupportedBlockType(String),

    #[error("Unsupported mark type: {0}")]
    UnsupportedMark(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Encoding error: {0}")]
    Encoding(String),

    #[error("Font not found: {0}")]
    FontNotFound(String),

    #[error("Image error: {0}")]
    ImageError(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// Настройки экспорта
#[derive(Debug, Clone)]
pub struct ExportOptions {
    /// Включать inline styles vs CSS classes
    pub inline_styles: bool,
    /// CSP nonce для <style> и <script> тегов
    pub csp_nonce: Option<String>,
    /// Base URL для relative paths (images, links)
    pub base_url: Option<String>,
    /// Кастомные CSS классы для block types
    pub css_classes: HashMap<String, String>,
    /// Highlight.js language auto-detect для code blocks
    pub highlight_code: bool,
    /// Включать metadata (block IDs, version)
    pub include_metadata: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        ExportOptions {
            inline_styles: false,
            csp_nonce: None,
            base_url: None,
            css_classes: HashMap::new(),
            highlight_code: false,
            include_metadata: false,
        }
    }
}

/// Настройки импорта
#[derive(Debug, Clone)]
pub struct ImportOptions {
    /// Strict mode: reject unknown elements vs ignore
    pub strict: bool,
    /// Sanitize HTML input (XSS prevention)
    pub sanitize: bool,
    /// Allowed HTML tags (если sanitize = true)
    pub allowed_tags: Option<Vec<String>>,
    /// Max document size (blocks)
    pub max_blocks: Option<usize>,
    /// Image handler: resolve external images
    pub image_base_url: Option<String>,
}

impl Default for ImportOptions {
    fn default() -> Self {
        ImportOptions {
            strict: false,
            sanitize: true,
            allowed_tags: None,
            max_blocks: Some(10_000),
            image_base_url: None,
        }
    }
}

// ─── Export Trait ───────────────────────────────────────────

/// Trait для экспортеров: Document → target format
pub trait Exporter: Send + Sync {
    /// Уникальное имя формата
    fn format_name(&self) -> &str;

    /// MIME type результата
    fn mime_type(&self) -> &str;

    /// Расширение файла
    fn file_extension(&self) -> &str;

    /// Экспорт в строку (для текстовых форматов: HTML, Markdown, Plain Text)
    fn export_string(
        &self,
        doc: &Document,
        opts: &ExportOptions,
    ) -> Result<String, ConvertError>;

    /// Экспорт в байты (для бинарных форматов: PDF, DOCX)
    fn export_bytes(
        &self,
        doc: &Document,
        opts: &ExportOptions,
    ) -> Result<Vec<u8>, ConvertError> {
        // Default: конвертируем string в bytes
        Ok(self.export_string(doc, opts)?.into_bytes())
    }

    /// Поддерживает ли формат export в bytes (PDF, DOCX — true)
    fn is_binary(&self) -> bool {
        false
    }
}

// ─── Import Trait ───────────────────────────────────────────

/// Trait для импортеров: source format → Document
pub trait Importer: Send + Sync {
    /// Уникальное имя формата
    fn format_name(&self) -> &str;

    /// Поддерживаемые MIME types для auto-detect
    fn supported_mime_types(&self) -> Vec<&str>;

    /// Импорт из строки
    fn import_string(
        &self,
        input: &str,
        opts: &ImportOptions,
    ) -> Result<Document, ConvertError>;

    /// Импорт из байтов (для бинарных форматов: DOCX)
    fn import_bytes(
        &self,
        input: &[u8],
        opts: &ImportOptions,
    ) -> Result<Document, ConvertError> {
        let s = std::str::from_utf8(input)
            .map_err(|e| ConvertError::Encoding(e.to_string()))?;
        self.import_string(s, opts)
    }
}

// ─── Registry ───────────────────────────────────────────────

/// Реестр конвертеров — pluggable, extensible
pub struct ConverterRegistry {
    exporters: HashMap<String, Box<dyn Exporter>>,
    importers: HashMap<String, Box<dyn Importer>>,
}

impl ConverterRegistry {
    pub fn new() -> Self {
        let mut registry = ConverterRegistry {
            exporters: HashMap::new(),
            importers: HashMap::new(),
        };
        // Регистрация built-in конвертеров
        registry.register_exporter(Box::new(html::HtmlExporter));
        registry.register_exporter(Box::new(markdown::MarkdownExporter));
        registry.register_exporter(Box::new(plaintext::PlainTextExporter));

        registry.register_importer(Box::new(html::HtmlImporter));
        registry.register_importer(Box::new(markdown::MarkdownImporter));

        registry
    }

    pub fn register_exporter(&mut self, exporter: Box<dyn Exporter>) {
        self.exporters.insert(
            exporter.format_name().to_string(),
            exporter,
        );
    }

    pub fn register_importer(&mut self, importer: Box<dyn Importer>) {
        self.importers.insert(
            importer.format_name().to_string(),
            importer,
        );
    }

    pub fn export(
        &self,
        format: &str,
        doc: &Document,
        opts: &ExportOptions,
    ) -> Result<ExportResult, ConvertError> {
        let exporter = self.exporters.get(format)
            .ok_or_else(|| ConvertError::InvalidInput(
                format!("Unknown export format: {format}")
            ))?;

        if exporter.is_binary() {
            Ok(ExportResult::Binary {
                data: exporter.export_bytes(doc, opts)?,
                mime_type: exporter.mime_type().to_string(),
                extension: exporter.file_extension().to_string(),
            })
        } else {
            Ok(ExportResult::Text {
                content: exporter.export_string(doc, opts)?,
                mime_type: exporter.mime_type().to_string(),
                extension: exporter.file_extension().to_string(),
            })
        }
    }

    pub fn import(
        &self,
        format: &str,
        input: &str,
        opts: &ImportOptions,
    ) -> Result<Document, ConvertError> {
        let importer = self.importers.get(format)
            .ok_or_else(|| ConvertError::InvalidInput(
                format!("Unknown import format: {format}")
            ))?;
        importer.import_string(input, opts)
    }
}

pub enum ExportResult {
    Text {
        content: String,
        mime_type: String,
        extension: String,
    },
    Binary {
        data: Vec<u8>,
        mime_type: String,
        extension: String,
    },
}
```

### Регистрация custom exporter

```rust
use gotipe_export::{Exporter, ExportOptions, ConvertError};
use gotipe_core::Document;

/// Custom exporter: Document → AsciiDoc
struct AsciiDocExporter;

impl Exporter for AsciiDocExporter {
    fn format_name(&self) -> &str { "asciidoc" }
    fn mime_type(&self) -> &str { "text/asciidoc" }
    fn file_extension(&self) -> &str { "adoc" }

    fn export_string(
        &self,
        doc: &Document,
        _opts: &ExportOptions,
    ) -> Result<String, ConvertError> {
        let mut out = String::new();
        for block in &doc.blocks {
            match block.block_type.as_str() {
                "heading" => {
                    let level = block.attr_as_usize("level").unwrap_or(1);
                    let prefix = "=".repeat(level + 1); // AsciiDoc: == H1, === H2
                    out.push_str(&format!("{} {}\n\n", prefix, block.text_content()));
                }
                "paragraph" => {
                    out.push_str(&format!("{}\n\n", block.text_content()));
                }
                _ => {} // другие типы...
            }
        }
        Ok(out)
    }
}

// Регистрация:
// registry.register_exporter(Box::new(AsciiDocExporter));
```

---

## HTML Export/Import

### HTML Exporter

```rust
// crates/gotipe-export/src/html.rs

use gotipe_core::{Document, Block, BlockContent, TextSpan, Mark};
use crate::{Exporter, Importer, ExportOptions, ImportOptions, ConvertError};

pub struct HtmlExporter;

impl Exporter for HtmlExporter {
    fn format_name(&self) -> &str { "html" }
    fn mime_type(&self) -> &str { "text/html" }
    fn file_extension(&self) -> &str { "html" }

    fn export_string(
        &self,
        doc: &Document,
        opts: &ExportOptions,
    ) -> Result<String, ConvertError> {
        let mut buf = String::with_capacity(doc.blocks.len() * 128);
        for block in &doc.blocks {
            render_block(&mut buf, block, opts)?;
        }
        Ok(buf)
    }
}

fn render_block(
    buf: &mut String,
    block: &Block,
    opts: &ExportOptions,
) -> Result<(), ConvertError> {
    match block.block_type.as_str() {
        "paragraph" => {
            let class = opts.css_classes.get("paragraph").map(|c| format!(r#" class="{c}""#)).unwrap_or_default();
            buf.push_str(&format!("<p{class}>"));
            render_inline_content(buf, &block.content, opts)?;
            buf.push_str("</p>\n");
        }

        "heading" => {
            let level = block.attr_as_usize("level").unwrap_or(1).min(6);
            let id = slug::slugify(block.text_content());
            buf.push_str(&format!(r#"<h{level} id="{id}">"#));
            render_inline_content(buf, &block.content, opts)?;
            buf.push_str(&format!("</h{level}>\n"));
        }

        "codeBlock" => {
            let lang = block.attr_as_str("language").unwrap_or("plain");
            buf.push_str(&format!(r#"<pre><code class="language-{lang}">"#));
            if let BlockContent::Raw(code) = &block.content {
                buf.push_str(&html_escape(code));
            }
            buf.push_str("</code></pre>\n");
        }

        "bulletList" => {
            buf.push_str("<ul>\n");
            for child in &block.children {
                render_list_item(buf, child, opts)?;
            }
            buf.push_str("</ul>\n");
        }

        "orderedList" => {
            let start = block.attr_as_usize("start").unwrap_or(1);
            if start != 1 {
                buf.push_str(&format!(r#"<ol start="{start}">"#));
            } else {
                buf.push_str("<ol>");
            }
            buf.push('\n');
            for child in &block.children {
                render_list_item(buf, child, opts)?;
            }
            buf.push_str("</ol>\n");
        }

        "blockquote" => {
            buf.push_str("<blockquote>\n");
            render_inline_content(buf, &block.content, opts)?;
            for child in &block.children {
                render_block(buf, child, opts)?;
            }
            buf.push_str("</blockquote>\n");
        }

        "image" => {
            let src = resolve_url(block.attr_as_str("src").unwrap_or(""), opts);
            let alt = block.attr_as_str("alt").unwrap_or("");
            let width = block.attr_as_usize("width")
                .map(|w| format!(r#" width="{w}""#))
                .unwrap_or_default();
            buf.push_str(&format!(
                r#"<figure><img src="{src}" alt="{alt}"{width} loading="lazy" /></figure>"#
            ));
            buf.push('\n');
        }

        "divider" => {
            buf.push_str("<hr />\n");
        }

        "callout" => {
            let emoji = block.attr_as_str("emoji").unwrap_or("💡");
            buf.push_str(&format!(
                r#"<div class="callout" role="note" data-emoji="{emoji}">"#
            ));
            buf.push_str(&format!(r#"<span class="callout-emoji">{emoji}</span>"#));
            buf.push_str(r#"<div class="callout-content">"#);
            render_inline_content(buf, &block.content, opts)?;
            for child in &block.children {
                render_block(buf, child, opts)?;
            }
            buf.push_str("</div></div>\n");
        }

        "table" => {
            buf.push_str("<table>\n");
            for (i, row) in block.children.iter().enumerate() {
                buf.push_str("<tr>\n");
                for cell in &row.children {
                    let tag = if i == 0 { "th" } else { "td" };
                    let colspan = cell.attr_as_usize("colspan").unwrap_or(1);
                    let rowspan = cell.attr_as_usize("rowspan").unwrap_or(1);
                    let mut attrs = String::new();
                    if colspan > 1 { attrs.push_str(&format!(r#" colspan="{colspan}""#)); }
                    if rowspan > 1 { attrs.push_str(&format!(r#" rowspan="{rowspan}""#)); }
                    buf.push_str(&format!("<{tag}{attrs}>"));
                    render_inline_content(buf, &cell.content, opts)?;
                    buf.push_str(&format!("</{tag}>\n"));
                }
                buf.push_str("</tr>\n");
            }
            buf.push_str("</table>\n");
        }

        "math" => {
            if let BlockContent::Raw(tex) = &block.content {
                buf.push_str(&format!(
                    r#"<div class="math-block" data-tex="{}">{}</div>"#,
                    html_escape(tex),
                    html_escape(tex),
                ));
                buf.push('\n');
            }
        }

        other => {
            // Extensible: data-block-type для unknown types
            buf.push_str(&format!(r#"<div data-block-type="{other}">"#));
            render_inline_content(buf, &block.content, opts)?;
            buf.push_str("</div>\n");
        }
    }
    Ok(())
}

fn render_list_item(
    buf: &mut String,
    item: &Block,
    opts: &ExportOptions,
) -> Result<(), ConvertError> {
    // Task list support
    if let Some(checked) = item.attr_as_bool("checked") {
        let state = if checked { "checked" } else { "" };
        buf.push_str(&format!(
            r#"<li class="task-list-item"><input type="checkbox" disabled {state} />"#
        ));
    } else {
        buf.push_str("<li>");
    }
    render_inline_content(buf, &item.content, opts)?;

    // Nested lists
    for child in &item.children {
        render_block(buf, child, opts)?;
    }
    buf.push_str("</li>\n");
    Ok(())
}

fn render_inline_content(
    buf: &mut String,
    content: &BlockContent,
    opts: &ExportOptions,
) -> Result<(), ConvertError> {
    match content {
        BlockContent::RichText(spans) => {
            for span in spans {
                render_span(buf, span, opts);
            }
        }
        BlockContent::Raw(text) => {
            buf.push_str(&html_escape(text));
        }
        BlockContent::Empty => {}
    }
    Ok(())
}

fn render_span(buf: &mut String, span: &TextSpan, opts: &ExportOptions) {
    // Открывающие теги (по rank order)
    let mut sorted_marks = span.marks.clone();
    sorted_marks.sort_by_key(|m| mark_rank(&m.mark_type));

    for mark in &sorted_marks {
        match mark.mark_type.as_str() {
            "bold"          => buf.push_str("<strong>"),
            "italic"        => buf.push_str("<em>"),
            "underline"     => buf.push_str("<u>"),
            "strikethrough" => buf.push_str("<s>"),
            "code"          => buf.push_str("<code>"),
            "superscript"   => buf.push_str("<sup>"),
            "subscript"     => buf.push_str("<sub>"),
            "highlight" => {
                let color = mark.attr_as_str("color").unwrap_or("yellow");
                if opts.inline_styles {
                    buf.push_str(&format!(r#"<mark style="background-color:{color}">"#));
                } else {
                    buf.push_str(&format!(r#"<mark class="highlight-{color}">"#));
                }
            }
            "link" => {
                let href = mark.attr_as_str("href").unwrap_or("");
                let href = resolve_url(href, opts);
                // Sanitize: только http(s) и mailto
                if is_safe_url(&href) {
                    buf.push_str(&format!(
                        r#"<a href="{}" rel="noopener noreferrer">"#,
                        html_escape(&href)
                    ));
                } else {
                    buf.push_str("<span>"); // unsafe URL — рендерим как plain text
                }
            }
            _ => {} // unknown marks — skip (extensible через opts)
        }
    }

    buf.push_str(&html_escape(&span.text));

    // Закрывающие теги (reverse order)
    for mark in sorted_marks.iter().rev() {
        match mark.mark_type.as_str() {
            "bold"          => buf.push_str("</strong>"),
            "italic"        => buf.push_str("</em>"),
            "underline"     => buf.push_str("</u>"),
            "strikethrough" => buf.push_str("</s>"),
            "code"          => buf.push_str("</code>"),
            "superscript"   => buf.push_str("</sup>"),
            "subscript"     => buf.push_str("</sub>"),
            "highlight"     => buf.push_str("</mark>"),
            "link" => {
                let href = mark.attr_as_str("href").unwrap_or("");
                if is_safe_url(href) {
                    buf.push_str("</a>");
                } else {
                    buf.push_str("</span>");
                }
            }
            _ => {}
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
}

fn is_safe_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("mailto:")
        || lower.starts_with('/')
        || lower.starts_with('#')
}

fn resolve_url(url: &str, opts: &ExportOptions) -> String {
    if let Some(base) = &opts.base_url {
        if url.starts_with('/') {
            return format!("{base}{url}");
        }
    }
    url.to_string()
}

fn mark_rank(mark_type: &str) -> u32 {
    match mark_type {
        "highlight"     => 5,
        "bold"          => 10,
        "italic"        => 20,
        "underline"     => 30,
        "strikethrough" => 40,
        "code"          => 50,
        "link"          => 60,
        "superscript"   => 70,
        "subscript"     => 80,
        _               => 100,
    }
}
```

### HTML Sanitization (Import)

При импорте HTML происходит многоуровневая санитизация для предотвращения XSS:

```rust
// crates/gotipe-export/src/html.rs (import section)

pub struct HtmlImporter;

impl Importer for HtmlImporter {
    fn format_name(&self) -> &str { "html" }
    fn supported_mime_types(&self) -> Vec<&str> {
        vec!["text/html", "application/xhtml+xml"]
    }

    fn import_string(
        &self,
        input: &str,
        opts: &ImportOptions,
    ) -> Result<Document, ConvertError> {
        let sanitized = if opts.sanitize {
            sanitize_html(input, opts)?
        } else {
            input.to_string()
        };

        parse_html_to_document(&sanitized, opts)
    }
}

/// Whitelist-based HTML sanitization
fn sanitize_html(input: &str, opts: &ImportOptions) -> Result<String, ConvertError> {
    let allowed = opts.allowed_tags.as_deref().unwrap_or(&DEFAULT_ALLOWED_TAGS);

    // ammonia crate — Rust HTML sanitizer
    let sanitized = ammonia::Builder::new()
        .tags(allowed.iter().map(|s| s.as_str()).collect())
        .clean(input)
        .to_string();

    Ok(sanitized)
}

const DEFAULT_ALLOWED_TAGS: [&str; 28] = [
    // Block
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote", "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    "hr", "br", "figure", "img",
    // Inline
    "strong", "em", "u", "s", "a", "mark",
    "sub", "sup",
];
```

### Sanitization pipeline

```
Input HTML
   │
   ▼
1. Strip <script>, <style>, <iframe>, event handlers (on*)
   │
   ▼
2. Whitelist tags: только DEFAULT_ALLOWED_TAGS
   │
   ▼
3. Whitelist attributes:
   - <a>: href (только http/https/mailto), rel, target
   - <img>: src (только http/https/data:image), alt, width
   - <td>/<th>: colspan, rowspan
   - data-*: удаляются (кроме data-block-type)
   │
   ▼
4. URL sanitization:
   - javascript: → удаляется
   - data: → только data:image/*
   - Relative URLs → resolve через base_url
   │
   ▼
5. CSP-compatible output:
   - Нет inline styles (если csp_nonce не задан)
   - Нет inline event handlers
   - img src → проверка Content-Security-Policy
   │
   ▼
Clean HTML → parse_html_to_document()
```

### Round-trip Fidelity

HTML export + HTML import должны сохранять структуру документа. Гарантии:

| Элемент | Round-trip | Примечание |
|---------|-----------|------------|
| Paragraph | Lossless | |
| Heading (h1-h6) | Lossless | ID из slug генерируется заново |
| Bold, Italic, etc. | Lossless | |
| Links | Lossless | rel="noopener" добавляется автоматически |
| Ordered/Bullet lists | Lossless | Вложенность сохраняется |
| Task lists | Lossless | `<input type="checkbox" disabled>` |
| Code blocks | Lossless | Language class сохраняется |
| Images | Lossless | src, alt, width |
| Tables | Lossless | colspan, rowspan |
| Callout | Lossless | Через `data-emoji` attribute |
| Math | Lossless | Через `data-tex` attribute |
| Block IDs | Опционально | Только если `include_metadata: true` |
| Custom blocks | Best-effort | `data-block-type` attribute |

---

## Markdown Export/Import

### Поддержка спецификаций

| Спецификация | Поддержка | Примеры |
|-------------|-----------|---------|
| **CommonMark** | Полная | Paragraphs, headings, lists, code, links, images, blockquotes, thematic breaks |
| **GFM Tables** | Полная | Pipe tables с alignment |
| **GFM Task Lists** | Полная | `- [x] done`, `- [ ] todo` |
| **GFM Strikethrough** | Полная | `~~deleted~~` |
| **GFM Autolinks** | Полная | `https://example.com` без `<>` |
| **GoTipe: Callout** | Custom extension | `> [!note] Title` (Obsidian-compatible) |
| **GoTipe: Math** | Custom extension | `$$\LaTeX$$` (block), `$inline$` |
| **GoTipe: Highlight** | Custom extension | `==highlighted==` |

### Markdown Exporter

```rust
// crates/gotipe-export/src/markdown.rs

use gotipe_core::{Document, Block, BlockContent, TextSpan, Mark};
use crate::{Exporter, Importer, ExportOptions, ImportOptions, ConvertError};

pub struct MarkdownExporter;

impl Exporter for MarkdownExporter {
    fn format_name(&self) -> &str { "markdown" }
    fn mime_type(&self) -> &str { "text/markdown" }
    fn file_extension(&self) -> &str { "md" }

    fn export_string(
        &self,
        doc: &Document,
        opts: &ExportOptions,
    ) -> Result<String, ConvertError> {
        let mut buf = String::with_capacity(doc.blocks.len() * 80);
        let ctx = MdContext { indent: 0, in_tight_list: false };
        for block in &doc.blocks {
            render_md_block(&mut buf, block, &ctx, opts)?;
        }
        Ok(buf)
    }
}

struct MdContext {
    indent: usize,
    in_tight_list: bool,
}

fn render_md_block(
    buf: &mut String,
    block: &Block,
    ctx: &MdContext,
    opts: &ExportOptions,
) -> Result<(), ConvertError> {
    let indent = " ".repeat(ctx.indent);

    match block.block_type.as_str() {
        "paragraph" => {
            buf.push_str(&indent);
            render_md_inline(buf, &block.content)?;
            buf.push_str("\n\n");
        }

        "heading" => {
            let level = block.attr_as_usize("level").unwrap_or(1).min(6);
            let prefix = "#".repeat(level);
            buf.push_str(&format!("{indent}{prefix} "));
            render_md_inline(buf, &block.content)?;
            buf.push_str("\n\n");
        }

        "codeBlock" => {
            let lang = block.attr_as_str("language").unwrap_or("");
            buf.push_str(&format!("{indent}```{lang}\n"));
            if let BlockContent::Raw(code) = &block.content {
                for line in code.lines() {
                    buf.push_str(&format!("{indent}{line}\n"));
                }
            }
            buf.push_str(&format!("{indent}```\n\n"));
        }

        "bulletList" => {
            for child in &block.children {
                render_md_list_item(buf, child, "- ", ctx, opts)?;
            }
            if ctx.indent == 0 { buf.push('\n'); }
        }

        "orderedList" => {
            let start = block.attr_as_usize("start").unwrap_or(1);
            for (i, child) in block.children.iter().enumerate() {
                let prefix = format!("{}. ", start + i);
                render_md_list_item(buf, child, &prefix, ctx, opts)?;
            }
            if ctx.indent == 0 { buf.push('\n'); }
        }

        "blockquote" => {
            buf.push_str(&format!("{indent}> "));
            render_md_inline(buf, &block.content)?;
            buf.push('\n');
            for child in &block.children {
                // Prefix each line with "> "
                let mut child_buf = String::new();
                render_md_block(&mut child_buf, child, ctx, opts)?;
                for line in child_buf.lines() {
                    buf.push_str(&format!("{indent}> {line}\n"));
                }
            }
            buf.push('\n');
        }

        "callout" => {
            // Obsidian-compatible callout syntax
            let emoji = block.attr_as_str("emoji").unwrap_or("💡");
            let callout_type = emoji_to_callout_type(emoji);
            buf.push_str(&format!("{indent}> [!{callout_type}]\n"));
            buf.push_str(&format!("{indent}> "));
            render_md_inline(buf, &block.content)?;
            buf.push('\n');
            for child in &block.children {
                let mut child_buf = String::new();
                render_md_block(&mut child_buf, child, ctx, opts)?;
                for line in child_buf.lines() {
                    buf.push_str(&format!("{indent}> {line}\n"));
                }
            }
            buf.push('\n');
        }

        "image" => {
            let src = block.attr_as_str("src").unwrap_or("");
            let alt = block.attr_as_str("alt").unwrap_or("");
            buf.push_str(&format!("{indent}![{alt}]({src})\n\n"));
        }

        "divider" => {
            buf.push_str(&format!("{indent}---\n\n"));
        }

        "table" => {
            render_md_table(buf, block, &indent)?;
            buf.push('\n');
        }

        "math" => {
            if let BlockContent::Raw(tex) = &block.content {
                buf.push_str(&format!("{indent}$$\n"));
                for line in tex.lines() {
                    buf.push_str(&format!("{indent}{line}\n"));
                }
                buf.push_str(&format!("{indent}$$\n\n"));
            }
        }

        _ => {
            // Fallback: render as paragraph
            render_md_inline(buf, &block.content)?;
            buf.push_str("\n\n");
        }
    }
    Ok(())
}

fn render_md_list_item(
    buf: &mut String,
    item: &Block,
    prefix: &str,
    ctx: &MdContext,
    opts: &ExportOptions,
) -> Result<(), ConvertError> {
    let indent = " ".repeat(ctx.indent);

    // Task list
    if let Some(checked) = item.attr_as_bool("checked") {
        let marker = if checked { "[x]" } else { "[ ]" };
        buf.push_str(&format!("{indent}{prefix}{marker} "));
    } else {
        buf.push_str(&format!("{indent}{prefix}"));
    }

    render_md_inline(buf, &item.content)?;
    buf.push('\n');

    // Nested lists: indent + 4 spaces
    let nested_ctx = MdContext {
        indent: ctx.indent + 4,
        in_tight_list: ctx.in_tight_list,
    };
    for child in &item.children {
        render_md_block(buf, child, &nested_ctx, opts)?;
    }

    Ok(())
}

fn render_md_inline(
    buf: &mut String,
    content: &BlockContent,
) -> Result<(), ConvertError> {
    match content {
        BlockContent::RichText(spans) => {
            for span in spans {
                render_md_span(buf, span);
            }
        }
        BlockContent::Raw(text) => buf.push_str(text),
        BlockContent::Empty => {}
    }
    Ok(())
}

fn render_md_span(buf: &mut String, span: &TextSpan) {
    let mut prefix = String::new();
    let mut suffix = String::new();

    for mark in &span.marks {
        match mark.mark_type.as_str() {
            "bold" => {
                prefix.push_str("**");
                suffix.insert_str(0, "**");
            }
            "italic" => {
                prefix.push('*');
                suffix.insert(0, '*');
            }
            "strikethrough" => {
                prefix.push_str("~~");
                suffix.insert_str(0, "~~");
            }
            "code" => {
                prefix.push('`');
                suffix.insert(0, '`');
            }
            "highlight" => {
                prefix.push_str("==");
                suffix.insert_str(0, "==");
            }
            "link" => {
                let href = mark.attr_as_str("href").unwrap_or("");
                prefix.push('[');
                suffix.insert_str(0, &format!("]({})", href));
            }
            _ => {} // underline, superscript и др. — нет Markdown-эквивалента
        }
    }

    buf.push_str(&prefix);
    buf.push_str(&md_escape(&span.text, &span.marks));
    buf.push_str(&suffix);
}

fn render_md_table(
    buf: &mut String,
    table: &Block,
    indent: &str,
) -> Result<(), ConvertError> {
    if table.children.is_empty() { return Ok(()); }

    // Header row
    if let Some(header_row) = table.children.first() {
        buf.push_str(indent);
        buf.push('|');
        for cell in &header_row.children {
            buf.push(' ');
            render_md_inline_to_string(buf, &cell.content)?;
            buf.push_str(" |");
        }
        buf.push('\n');

        // Separator
        buf.push_str(indent);
        buf.push('|');
        for _ in &header_row.children {
            buf.push_str(" --- |");
        }
        buf.push('\n');
    }

    // Data rows
    for row in table.children.iter().skip(1) {
        buf.push_str(indent);
        buf.push('|');
        for cell in &row.children {
            buf.push(' ');
            render_md_inline_to_string(buf, &cell.content)?;
            buf.push_str(" |");
        }
        buf.push('\n');
    }
    Ok(())
}

fn md_escape(text: &str, marks: &[Mark]) -> String {
    // Внутри code span — не экранируем
    if marks.iter().any(|m| m.mark_type == "code") {
        return text.to_string();
    }
    text.replace('\\', "\\\\")
        .replace('*', "\\*")
        .replace('_', "\\_")
        .replace('`', "\\`")
        .replace('[', "\\[")
        .replace(']', "\\]")
        .replace('~', "\\~")
        .replace('|', "\\|")
}

fn emoji_to_callout_type(emoji: &str) -> &str {
    match emoji {
        "💡" => "tip",
        "⚠️" | "⚠" => "warning",
        "❌" => "danger",
        "ℹ️" | "ℹ" => "info",
        "📝" => "note",
        "✅" => "success",
        _ => "note",
    }
}
```

### Markdown Importer

Парсинг через `pulldown-cmark` (CommonMark) с пост-обработкой GFM и custom extensions:

```rust
// crates/gotipe-export/src/markdown.rs (import)

use pulldown_cmark::{Parser, Event, Tag, Options as CmarkOptions};

pub struct MarkdownImporter;

impl Importer for MarkdownImporter {
    fn format_name(&self) -> &str { "markdown" }
    fn supported_mime_types(&self) -> Vec<&str> {
        vec!["text/markdown", "text/x-markdown"]
    }

    fn import_string(
        &self,
        input: &str,
        opts: &ImportOptions,
    ) -> Result<Document, ConvertError> {
        let mut cmark_opts = CmarkOptions::empty();
        cmark_opts.insert(CmarkOptions::ENABLE_TABLES);
        cmark_opts.insert(CmarkOptions::ENABLE_TASKLISTS);
        cmark_opts.insert(CmarkOptions::ENABLE_STRIKETHROUGH);

        // Pre-process: custom extensions (callout, math, highlight)
        let preprocessed = preprocess_custom_extensions(input);

        let parser = Parser::new_ext(&preprocessed, cmark_opts);
        let mut builder = DocumentBuilder::new();

        for event in parser {
            match event {
                Event::Start(Tag::Heading(level, ..)) => {
                    builder.open_block("heading", [("level", level as u8)]);
                }
                Event::End(Tag::Heading(..)) => {
                    builder.close_block();
                }
                Event::Start(Tag::Paragraph) => {
                    builder.open_block("paragraph", []);
                }
                Event::End(Tag::Paragraph) => {
                    builder.close_block();
                }
                Event::Start(Tag::List(ordered)) => {
                    if ordered.is_some() {
                        builder.open_block("orderedList", [("start", ordered.unwrap_or(1))]);
                    } else {
                        builder.open_block("bulletList", []);
                    }
                }
                Event::End(Tag::List(..)) => {
                    builder.close_block();
                }
                Event::TaskListMarker(checked) => {
                    builder.set_attr("checked", checked);
                }
                Event::Text(text) => {
                    builder.push_text(&text);
                }
                Event::Code(code) => {
                    builder.push_text_with_mark(&code, "code");
                }
                Event::Start(Tag::Strong) => builder.open_mark("bold"),
                Event::End(Tag::Strong) => builder.close_mark("bold"),
                Event::Start(Tag::Emphasis) => builder.open_mark("italic"),
                Event::End(Tag::Emphasis) => builder.close_mark("italic"),
                Event::Start(Tag::Strikethrough) => builder.open_mark("strikethrough"),
                Event::End(Tag::Strikethrough) => builder.close_mark("strikethrough"),
                Event::Start(Tag::Link(_, href, _)) => {
                    builder.open_mark_with_attrs("link", [("href", href.to_string())]);
                }
                Event::End(Tag::Link(..)) => builder.close_mark("link"),
                // ... остальные events
                _ => {}
            }
        }

        let doc = builder.build()?;
        if let Some(max) = opts.max_blocks {
            if doc.blocks.len() > max {
                return Err(ConvertError::InvalidInput(
                    format!("Document exceeds max_blocks limit: {}", max)
                ));
            }
        }
        Ok(doc)
    }
}

/// Pre-process GoTipe custom Markdown extensions
fn preprocess_custom_extensions(input: &str) -> String {
    let mut output = input.to_string();

    // 1. Callout blocks: > [!type] → <gotipe-callout type="...">
    //    Обрабатывается отдельно в DocumentBuilder

    // 2. Math blocks: $$ ... $$ → сохраняем как есть, парсим в builder

    // 3. Highlight: ==text== → сохраняем как есть, парсим в builder

    output
}
```

---

## PDF Export (typst)

### Почему typst

| Критерий | typst | wkhtmltopdf | Puppeteer/Chromium | printpdf |
|----------|-------|-------------|--------------------|---------:|
| **Запуск в WASM** | Да (native Rust) | Нет (требует Qt/WebKit binary) | Нет (требует Chromium) | Да (native Rust) |
| **Размер binary (gzip)** | ~400KB (WASM) | ~30MB (system dep) | ~200MB (Chromium) | ~50KB |
| **Скорость (10 страниц)** | ~80ms | ~2s | ~3-5s | ~200ms |
| **Fonts** | OTF/TTF, font fallback, subsetting | System fonts | System fonts | Ручная загрузка, нет subsetting |
| **Layout engine** | Полноценный (колонки, page breaks, headers/footers) | WebKit layout | Blink layout | Нет layout engine |
| **Таблицы** | Да (native) | Да (CSS) | Да (CSS) | Ручное позиционирование |
| **Math rendering** | Да (native LaTeX-like) | Да (MathJax) | Да (MathJax/KaTeX) | Нет |
| **Images** | PNG, JPEG, SVG | Все web-форматы | Все web-форматы | PNG, JPEG |
| **Server-side без X11** | Да | Нет (требует Xvfb) | Headless mode | Да |
| **Лицензия** | Apache 2.0 | LGPL | Apache 2.0 | MIT |

**Решение:** typst -- единственная библиотека, которая дает полноценный PDF layout engine, работает в WASM и весит <1MB. `printpdf` быстрее и легче, но не имеет layout engine (нет auto page breaks, нет tables, нет math). `wkhtmltopdf` и Puppeteer невозможно запустить в WASM/браузере.

### PDF Exporter

```rust
// crates/gotipe-export/src/pdf.rs

use typst::foundations::{Content, StyleChain};
use typst::layout::{Abs, PageElem};
use typst::text::{FontFamily, TextElem};
use gotipe_core::{Document, Block, BlockContent, TextSpan};
use crate::{Exporter, ExportOptions, ConvertError};

pub struct PdfExporter {
    fonts: FontStore,
}

/// Настройки PDF
#[derive(Debug, Clone)]
pub struct PdfOptions {
    /// Размер страницы
    pub page_size: PageSize,
    /// Margins (top, right, bottom, left) в pt
    pub margins: (f64, f64, f64, f64),
    /// Header text (шаблон: {title}, {page}, {pages})
    pub header: Option<String>,
    /// Footer text
    pub footer: Option<String>,
    /// Base font size (pt)
    pub font_size: f64,
    /// Font family
    pub font_family: String,
    /// Monospace font family (code blocks)
    pub mono_font_family: String,
    /// Line height
    pub line_height: f64,
}

#[derive(Debug, Clone)]
pub enum PageSize {
    A4,
    A5,
    Letter,
    Legal,
    Custom { width_pt: f64, height_pt: f64 },
}

impl Default for PdfOptions {
    fn default() -> Self {
        PdfOptions {
            page_size: PageSize::A4,
            margins: (72.0, 72.0, 72.0, 72.0), // 1 inch
            header: None,
            footer: Some("{page} / {pages}".to_string()),
            font_size: 11.0,
            font_family: "Noto Sans".to_string(),
            mono_font_family: "JetBrains Mono".to_string(),
            line_height: 1.5,
        }
    }
}

impl PdfExporter {
    pub fn new() -> Result<Self, ConvertError> {
        let fonts = FontStore::new()?;
        Ok(PdfExporter { fonts })
    }

    /// Загрузить custom font из bytes
    pub fn add_font(&mut self, name: &str, data: &[u8]) -> Result<(), ConvertError> {
        self.fonts.add(name, data)
            .map_err(|e| ConvertError::FontNotFound(e.to_string()))
    }
}

impl Exporter for PdfExporter {
    fn format_name(&self) -> &str { "pdf" }
    fn mime_type(&self) -> &str { "application/pdf" }
    fn file_extension(&self) -> &str { "pdf" }
    fn is_binary(&self) -> bool { true }

    fn export_string(
        &self,
        _doc: &Document,
        _opts: &ExportOptions,
    ) -> Result<String, ConvertError> {
        Err(ConvertError::Encoding("PDF is binary format, use export_bytes".into()))
    }

    fn export_bytes(
        &self,
        doc: &Document,
        opts: &ExportOptions,
    ) -> Result<Vec<u8>, ConvertError> {
        let pdf_opts = PdfOptions::default(); // или из opts.metadata
        self.render_pdf(doc, &pdf_opts, opts)
    }
}

impl PdfExporter {
    fn render_pdf(
        &self,
        doc: &Document,
        pdf_opts: &PdfOptions,
        export_opts: &ExportOptions,
    ) -> Result<Vec<u8>, ConvertError> {
        // 1. Document → typst Content tree
        let content = self.build_typst_content(doc, pdf_opts, export_opts)?;

        // 2. Page setup
        let (width, height) = match &pdf_opts.page_size {
            PageSize::A4     => (Abs::pt(595.28), Abs::pt(841.89)),
            PageSize::A5     => (Abs::pt(419.53), Abs::pt(595.28)),
            PageSize::Letter => (Abs::pt(612.0),  Abs::pt(792.0)),
            PageSize::Legal  => (Abs::pt(612.0),  Abs::pt(1008.0)),
            PageSize::Custom { width_pt, height_pt } => {
                (Abs::pt(*width_pt), Abs::pt(*height_pt))
            }
        };

        // 3. Layout → PDF frames
        let document = typst::compile(&content, &self.fonts)?;

        // 4. Render PDF bytes
        let pdf_bytes = typst_pdf::pdf(&document, &PdfOptions::default())?;

        Ok(pdf_bytes)
    }

    fn build_typst_content(
        &self,
        doc: &Document,
        pdf_opts: &PdfOptions,
        export_opts: &ExportOptions,
    ) -> Result<Content, ConvertError> {
        let mut content = Content::empty();

        for block in &doc.blocks {
            let block_content = self.block_to_typst(block, pdf_opts, export_opts)?;
            content = content + block_content;
        }

        Ok(content)
    }

    fn block_to_typst(
        &self,
        block: &Block,
        pdf_opts: &PdfOptions,
        export_opts: &ExportOptions,
    ) -> Result<Content, ConvertError> {
        match block.block_type.as_str() {
            "heading" => {
                let level = block.attr_as_usize("level").unwrap_or(1);
                let text = self.inline_to_typst(&block.content, pdf_opts)?;
                // typst heading: = H1, == H2, ...
                Ok(typst::model::HeadingElem::new(text).with_level(level).pack())
            }

            "paragraph" => {
                let text = self.inline_to_typst(&block.content, pdf_opts)?;
                Ok(typst::model::ParElem::new(text).pack())
            }

            "codeBlock" => {
                let lang = block.attr_as_str("language").unwrap_or("plain");
                if let BlockContent::Raw(code) = &block.content {
                    Ok(typst::model::RawElem::new(code.clone())
                        .with_lang(Some(lang.to_string()))
                        .with_block(true)
                        .pack())
                } else {
                    Ok(Content::empty())
                }
            }

            "image" => {
                let src = block.attr_as_str("src").unwrap_or("");
                let resolved = resolve_image(src, export_opts)?;
                Ok(typst::visualize::ImageElem::new(resolved).pack())
            }

            "table" => {
                self.table_to_typst(block, pdf_opts)
            }

            "math" => {
                if let BlockContent::Raw(tex) = &block.content {
                    Ok(typst::math::MathElem::new(tex.clone())
                        .with_block(true)
                        .pack())
                } else {
                    Ok(Content::empty())
                }
            }

            "divider" => {
                Ok(typst::model::LineElem::new().pack())
            }

            "bulletList" | "orderedList" => {
                self.list_to_typst(block, pdf_opts, export_opts)
            }

            "blockquote" => {
                let text = self.inline_to_typst(&block.content, pdf_opts)?;
                Ok(typst::model::QuoteElem::new(text).with_block(true).pack())
            }

            _ => {
                // Fallback: render as paragraph
                let text = self.inline_to_typst(&block.content, pdf_opts)?;
                Ok(typst::model::ParElem::new(text).pack())
            }
        }
    }

    fn inline_to_typst(
        &self,
        content: &BlockContent,
        pdf_opts: &PdfOptions,
    ) -> Result<Content, ConvertError> {
        match content {
            BlockContent::RichText(spans) => {
                let mut result = Content::empty();
                for span in spans {
                    let mut text = TextElem::new(span.text.clone()).pack();

                    for mark in &span.marks {
                        text = match mark.mark_type.as_str() {
                            "bold"          => typst::text::StrongElem::new(text).pack(),
                            "italic"        => typst::text::EmphElem::new(text).pack(),
                            "strikethrough" => typst::text::StrikeElem::new(text).pack(),
                            "code" => {
                                typst::model::RawElem::new(span.text.clone())
                                    .with_block(false)
                                    .pack()
                            }
                            "link" => {
                                let href = mark.attr_as_str("href").unwrap_or("");
                                typst::model::LinkElem::new(href.to_string(), text).pack()
                            }
                            "highlight" => {
                                typst::visualize::HighlightElem::new(text).pack()
                            }
                            _ => text, // unsupported marks — plain text
                        };
                    }
                    result = result + text;
                }
                Ok(result)
            }
            BlockContent::Raw(text) => Ok(TextElem::new(text.clone()).pack()),
            BlockContent::Empty => Ok(Content::empty()),
        }
    }
}
```

### Fonts

Стратегия загрузки шрифтов:

```
Browser (WASM):
  1. Bundled fonts: Noto Sans (Latin + Cyrillic subset) — ~200KB
  2. Lazy load: дополнительные языки по document content detection
  3. Custom fonts: через PdfExporter.add_font(name, bytes)

Server (native):
  1. System fonts: /usr/share/fonts, ~/.fonts
  2. Bundled fonts: embedded в binary
  3. Custom fonts: через add_font() или config
  4. Font subsetting: только используемые glyphs включаются в PDF
```

| Шрифт | Назначение | Размер (subset, gzip) |
|-------|-----------|----------------------|
| Noto Sans | Body text (Latin, Cyrillic) | ~80KB |
| Noto Sans CJK | CJK support | ~2MB (lazy) |
| Noto Sans Arabic | Arabic script | ~120KB (lazy) |
| JetBrains Mono | Code blocks | ~40KB |

### Images в PDF

```
Image в Document
     │
     ▼
1. Resolve URL → bytes
   - data:image/* → decode base64
   - https:// → fetch (server) / предзагрузка (browser)
   - relative → resolve через base_url
     │
     ▼
2. Detect format (PNG, JPEG, SVG, WebP)
     │
     ▼
3. WebP → конвертация в PNG (typst не поддерживает WebP)
   SVG → растеризация или передача как есть
     │
     ▼
4. Embed в typst Document → PDF
```

---

## DOCX Export/Import

### Структура DOCX

DOCX -- ZIP-архив с XML-файлами:

```
document.docx (ZIP)
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── word/
│   ├── document.xml          ← основной контент
│   ├── styles.xml            ← стили (heading, paragraph, etc.)
│   ├── numbering.xml         ← нумерация списков
│   ├── media/
│   │   ├── image1.png        ← embedded images
│   │   └── image2.jpeg
│   └── _rels/
│       └── document.xml.rels ← связи (images, hyperlinks)
└── docProps/
    ├── app.xml
    └── core.xml              ← metadata (author, title, date)
```

### DOCX Exporter

```rust
// crates/gotipe-export/src/docx.rs

use docx_rs::*;
use gotipe_core::{Document, Block, BlockContent, TextSpan};
use crate::{Exporter, ExportOptions, ConvertError};

pub struct DocxExporter;

impl Exporter for DocxExporter {
    fn format_name(&self) -> &str { "docx" }
    fn mime_type(&self) -> &str { "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
    fn file_extension(&self) -> &str { "docx" }
    fn is_binary(&self) -> bool { true }

    fn export_string(
        &self,
        _doc: &Document,
        _opts: &ExportOptions,
    ) -> Result<String, ConvertError> {
        Err(ConvertError::Encoding("DOCX is binary format, use export_bytes".into()))
    }

    fn export_bytes(
        &self,
        doc: &Document,
        opts: &ExportOptions,
    ) -> Result<Vec<u8>, ConvertError> {
        let mut docx = Docx::new();

        // Styles
        docx = docx
            .default_fonts(RunFonts::new().ascii("Calibri").hi_ansi("Calibri"))
            .default_size(22); // 11pt (half-points)

        for block in &doc.blocks {
            docx = self.add_block(docx, block, opts)?;
        }

        let mut buf = Vec::new();
        docx.build().pack(&mut std::io::Cursor::new(&mut buf))
            .map_err(|e| ConvertError::Encoding(e.to_string()))?;
        Ok(buf)
    }
}

impl DocxExporter {
    fn add_block(
        &self,
        mut docx: Docx,
        block: &Block,
        opts: &ExportOptions,
    ) -> Result<Docx, ConvertError> {
        match block.block_type.as_str() {
            "heading" => {
                let level = block.attr_as_usize("level").unwrap_or(1);
                let style = format!("Heading{level}");
                let mut para = Paragraph::new().style(&style);
                para = self.add_inline_content(para, &block.content)?;
                docx = docx.add_paragraph(para);
            }

            "paragraph" => {
                let mut para = Paragraph::new();
                para = self.add_inline_content(para, &block.content)?;
                docx = docx.add_paragraph(para);
            }

            "codeBlock" => {
                if let BlockContent::Raw(code) = &block.content {
                    for line in code.lines() {
                        let run = Run::new()
                            .add_text(line)
                            .fonts(RunFonts::new().ascii("Courier New"))
                            .size(20); // 10pt
                        let para = Paragraph::new()
                            .style("CodeBlock")
                            .add_run(run);
                        docx = docx.add_paragraph(para);
                    }
                }
            }

            "bulletList" => {
                for child in &block.children {
                    docx = self.add_list_item(docx, child, 0, false, opts)?;
                }
            }

            "orderedList" => {
                for child in &block.children {
                    docx = self.add_list_item(docx, child, 0, true, opts)?;
                }
            }

            "blockquote" => {
                let mut para = Paragraph::new()
                    .style("Quote")
                    .indent(Some(720), None, None, None); // 0.5 inch
                para = self.add_inline_content(para, &block.content)?;
                docx = docx.add_paragraph(para);
            }

            "image" => {
                let src = block.attr_as_str("src").unwrap_or("");
                let image_bytes = resolve_image_bytes(src, opts)?;
                let pic = Pic::new(&image_bytes);
                let para = Paragraph::new().add_run(Run::new().add_image(pic));
                docx = docx.add_paragraph(para);
            }

            "divider" => {
                let para = Paragraph::new()
                    .add_run(Run::new().add_text(""))
                    .paragraph_property(
                        ParagraphProperty::new()
                            .borders(ParagraphBorders::new()
                                .bottom(ParagraphBorder::new(BorderType::Single)))
                    );
                docx = docx.add_paragraph(para);
            }

            "table" => {
                docx = self.add_table(docx, block, opts)?;
            }

            _ => {
                // Fallback: paragraph
                let mut para = Paragraph::new();
                para = self.add_inline_content(para, &block.content)?;
                docx = docx.add_paragraph(para);
            }
        }
        Ok(docx)
    }

    fn add_inline_content(
        &self,
        mut para: Paragraph,
        content: &BlockContent,
    ) -> Result<Paragraph, ConvertError> {
        if let BlockContent::RichText(spans) = content {
            for span in spans {
                let mut run = Run::new().add_text(&span.text);

                for mark in &span.marks {
                    run = match mark.mark_type.as_str() {
                        "bold"          => run.bold(),
                        "italic"        => run.italic(),
                        "underline"     => run.underline("single"),
                        "strikethrough" => run.strike(),
                        "code"          => run.fonts(RunFonts::new().ascii("Courier New")).size(20),
                        "highlight" => {
                            let color = mark.attr_as_str("color").unwrap_or("yellow");
                            run.highlight(color)
                        }
                        "superscript"   => run.vert_align(VertAlignType::SuperScript),
                        "subscript"     => run.vert_align(VertAlignType::SubScript),
                        _ => run,
                    };
                }

                // Links — добавляем как hyperlink
                if let Some(link_mark) = span.marks.iter().find(|m| m.mark_type == "link") {
                    let href = link_mark.attr_as_str("href").unwrap_or("");
                    let hyperlink = Hyperlink::new(href, HyperlinkType::External)
                        .add_run(run.color("0563C1").underline("single"));
                    para = para.add_hyperlink(hyperlink);
                } else {
                    para = para.add_run(run);
                }
            }
        }
        Ok(para)
    }
}
```

### Mapping GoTipe styles → DOCX styles

| GoTipe Block/Mark | DOCX Style | Word UI |
|-------------------|------------|---------|
| `heading` level 1 | `Heading1` | Heading 1 |
| `heading` level 2 | `Heading2` | Heading 2 |
| `paragraph` | `Normal` | Normal |
| `codeBlock` | `CodeBlock` (custom) | Courier New, 10pt, gray bg |
| `blockquote` | `Quote` | Indent + italic |
| `bold` | Run property: `<b/>` | Bold |
| `italic` | Run property: `<i/>` | Italic |
| `underline` | Run property: `<u val="single"/>` | Underline |
| `strikethrough` | Run property: `<strike/>` | Strikethrough |
| `code` | Courier New, 10pt | Inline code |
| `link` | Hyperlink relationship | Blue underline |
| `highlight` | Run property: `<highlight val="yellow"/>` | Highlight |

---

## Plain Text Export

```rust
// crates/gotipe-export/src/plaintext.rs

use gotipe_core::{Document, Block, BlockContent};
use crate::{Exporter, ExportOptions, ConvertError};

pub struct PlainTextExporter;

impl Exporter for PlainTextExporter {
    fn format_name(&self) -> &str { "plaintext" }
    fn mime_type(&self) -> &str { "text/plain" }
    fn file_extension(&self) -> &str { "txt" }

    fn export_string(
        &self,
        doc: &Document,
        _opts: &ExportOptions,
    ) -> Result<String, ConvertError> {
        let mut buf = String::new();
        for block in doc.flatten() {
            let text = block.text_content();
            if !text.is_empty() {
                buf.push_str(&text);
                buf.push('\n');
            }
        }
        Ok(buf)
    }
}
```

---

## Notion Export Import

Notion export = ZIP-архив с Markdown-файлами + CSV + metadata:

```
notion-export/
├── Page Title abc123.md       ← Markdown с Notion-specific syntax
├── Subpage xyz789.md
├── Database abc.csv           ← Database views
└── images/
    ├── image1.png
    └── image2.jpeg
```

Importer обрабатывает:

| Notion-specific | GoTipe mapping |
|-----------------|---------------|
| `/toggle` blocks | `toggle` block type |
| `/callout` | `callout` block type |
| `/code` с language | `codeBlock` с `language` attr |
| Inline database mentions | Link с placeholder text |
| `@mention` | Plain text (resolved) |
| Nested pages (subpage links) | Link blocks |
| CSV databases | Table blocks |
| Images (relative paths) | Image blocks (resolved paths) |

---

## Google Docs Paste Import

При paste из Google Docs браузер получает HTML с Google-specific markup. Importer очищает его:

```
Google Docs clipboard HTML
     │
     ▼
1. Detect Google Docs source:
   - <meta content="text/html; charset=utf-8">
   - <b style="font-weight:normal"> (Google-specific)
   - id="docs-internal-guid-*"
     │
     ▼
2. Cleanup Google-specific styles:
   - Remove font-weight:normal на <b> (Google default)
   - Remove font-style:normal на <i>
   - Normalize font-size → heading levels
   - Convert Google's color spans → highlight marks
     │
     ▼
3. Standard HTML Import pipeline
     │
     ▼
Document
```

---

## Client-Side Export API (TypeScript)

```typescript
// packages/core/src/export.ts

import type { Editor } from './editor';
import type { Document } from './types';

export type ExportFormat = 'html' | 'markdown' | 'json' | 'plaintext' | 'pdf' | 'docx';
export type ImportFormat = 'html' | 'markdown' | 'json' | 'docx' | 'notion';

export interface ExportOptions {
  /** Inline styles вместо CSS classes */
  inlineStyles?: boolean;
  /** CSP nonce для style/script тегов */
  cspNonce?: string;
  /** Base URL для relative paths */
  baseUrl?: string;
  /** Кастомные CSS classes */
  cssClasses?: Record<string, string>;
  /** Syntax highlighting для code blocks */
  highlightCode?: boolean;
  /** Включить metadata (block IDs) */
  includeMetadata?: boolean;
}

export interface ImportOptions {
  /** Strict mode: reject unknown elements */
  strict?: boolean;
  /** HTML sanitization */
  sanitize?: boolean;
  /** Max blocks */
  maxBlocks?: number;
}

export interface PdfOptions {
  pageSize?: 'a4' | 'a5' | 'letter' | 'legal' | { width: number; height: number };
  margins?: { top: number; right: number; bottom: number; left: number };
  header?: string;
  footer?: string;
  fontSize?: number;
  fontFamily?: string;
  monoFontFamily?: string;
  lineHeight?: number;
}

// ─── Export Functions ────────────────────────────────────────

/**
 * Экспорт документа в указанный формат.
 * HTML, Markdown, PlainText, JSON — синхронно через WASM.
 * PDF, DOCX — async (lazy-load WASM module).
 */
export async function exportDocument(
  editor: Editor,
  format: ExportFormat,
  options?: ExportOptions & PdfOptions,
): Promise<string | Blob> {
  const doc = editor.getJSON();

  switch (format) {
    case 'html':
      return editor.wasmEditor.export_html(
        JSON.stringify(options ?? {}),
      );

    case 'markdown':
      return editor.wasmEditor.export_markdown(
        JSON.stringify(options ?? {}),
      );

    case 'json':
      return JSON.stringify(doc, null, 2);

    case 'plaintext':
      return editor.wasmEditor.export_plaintext();

    case 'pdf': {
      // Lazy load PDF WASM module (~400KB gzip)
      const { PdfExporter } = await import('@gotipe/export-pdf');
      const exporter = new PdfExporter();

      // Загрузка fonts если нужно
      if (options?.fontFamily) {
        const fontBytes = await loadFont(options.fontFamily);
        exporter.add_font(options.fontFamily, fontBytes);
      }

      const pdfBytes = exporter.export_bytes(
        JSON.stringify(doc),
        JSON.stringify(options ?? {}),
      );
      return new Blob([pdfBytes], { type: 'application/pdf' });
    }

    case 'docx': {
      // Lazy load DOCX WASM module (~60KB gzip)
      const { DocxExporter } = await import('@gotipe/export-docx');
      const exporter = new DocxExporter();
      const docxBytes = exporter.export_bytes(
        JSON.stringify(doc),
        JSON.stringify(options ?? {}),
      );
      return new Blob([docxBytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    }
  }
}

/**
 * Импорт документа из строки/файла.
 */
export async function importDocument(
  editor: Editor,
  input: string | File,
  format: ImportFormat,
  options?: ImportOptions,
): Promise<void> {
  let content: string;

  if (input instanceof File) {
    if (format === 'docx') {
      const bytes = new Uint8Array(await input.arrayBuffer());
      const { DocxImporter } = await import('@gotipe/export-docx');
      const importer = new DocxImporter();
      const docJson = importer.import_bytes(bytes, JSON.stringify(options ?? {}));
      editor.setContent(JSON.parse(docJson));
      return;
    }
    content = await input.text();
  } else {
    content = input;
  }

  const docJson = editor.wasmEditor.import_document(
    content,
    format,
    JSON.stringify(options ?? {}),
  );
  editor.setContent(JSON.parse(docJson));
}

// ─── Convenience Methods ─────────────────────────────────────

/**
 * Скачать документ как файл.
 */
export async function downloadDocument(
  editor: Editor,
  format: ExportFormat,
  filename?: string,
  options?: ExportOptions & PdfOptions,
): Promise<void> {
  const result = await exportDocument(editor, format, options);
  const ext = formatExtension(format);
  const name = filename ?? `document.${ext}`;

  let blob: Blob;
  if (result instanceof Blob) {
    blob = result;
  } else {
    const mime = formatMimeType(format);
    blob = new Blob([result], { type: mime });
  }

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Копировать документ в clipboard.
 */
export async function copyToClipboard(
  editor: Editor,
  format: 'html' | 'markdown' | 'plaintext',
): Promise<void> {
  const result = await exportDocument(editor, format);
  if (typeof result !== 'string') return;

  if (format === 'html') {
    const blob = new Blob([result], { type: 'text/html' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': blob }),
    ]);
  } else {
    await navigator.clipboard.writeText(result);
  }
}

// ─── Editor Integration ──────────────────────────────────────

// Эти методы добавляются к Editor через extension
declare module './editor' {
  interface Editor {
    /** Export document */
    export(format: ExportFormat, options?: ExportOptions & PdfOptions): Promise<string | Blob>;
    /** Download document as file */
    download(format: ExportFormat, filename?: string, options?: ExportOptions & PdfOptions): Promise<void>;
    /** Import and replace document content */
    import(input: string | File, format: ImportFormat, options?: ImportOptions): Promise<void>;
  }
}

function formatExtension(format: ExportFormat): string {
  const map: Record<ExportFormat, string> = {
    html: 'html', markdown: 'md', json: 'json',
    plaintext: 'txt', pdf: 'pdf', docx: 'docx',
  };
  return map[format];
}

function formatMimeType(format: ExportFormat): string {
  const map: Record<ExportFormat, string> = {
    html: 'text/html',
    markdown: 'text/markdown',
    json: 'application/json',
    plaintext: 'text/plain',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[format];
}
```

### Использование в React

```tsx
import { useEditor } from '@gotipe/react';

function ExportMenu() {
  const editor = useEditor();

  return (
    <menu>
      <button onClick={() => editor.download('pdf', 'report.pdf', {
        pageSize: 'a4',
        fontSize: 12,
        footer: '{page} / {pages}',
      })}>
        Download PDF
      </button>
      <button onClick={() => editor.download('docx')}>
        Download DOCX
      </button>
      <button onClick={() => editor.download('markdown')}>
        Download Markdown
      </button>
      <button onClick={() => copyToClipboard(editor, 'html')}>
        Copy as HTML
      </button>
    </menu>
  );
}

function ImportButton() {
  const editor = useEditor();

  return (
    <input
      type="file"
      accept=".md,.html,.docx"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const format = file.name.endsWith('.docx') ? 'docx'
          : file.name.endsWith('.md') ? 'markdown'
          : 'html';

        await editor.import(file, format);
      }}
    />
  );
}
```

---

## Server-Side Export

### Node.js (WASM)

```typescript
// server/export-service.ts

import init, { WasmEditor, PdfExporter, DocxExporter } from '@gotipe/wasm/node';
import { readFile } from 'fs/promises';

// Инициализация WASM — один раз при старте сервера
let wasmReady = false;
async function ensureWasm(): Promise<void> {
  if (wasmReady) return;
  await init();
  wasmReady = true;
}

export interface ExportRequest {
  documentJson: string;
  format: 'html' | 'markdown' | 'pdf' | 'docx' | 'plaintext';
  options?: Record<string, unknown>;
}

export interface ExportResponse {
  data: Buffer;
  mimeType: string;
  filename: string;
}

export async function exportDocument(req: ExportRequest): Promise<ExportResponse> {
  await ensureWasm();

  const schemaJson = JSON.stringify(getDefaultSchema());
  const editor = new WasmEditor(schemaJson, req.documentJson);
  const optsJson = JSON.stringify(req.options ?? {});

  switch (req.format) {
    case 'html': {
      const html = editor.export_html(optsJson);
      return {
        data: Buffer.from(html, 'utf-8'),
        mimeType: 'text/html',
        filename: 'document.html',
      };
    }

    case 'markdown': {
      const md = editor.export_markdown(optsJson);
      return {
        data: Buffer.from(md, 'utf-8'),
        mimeType: 'text/markdown',
        filename: 'document.md',
      };
    }

    case 'plaintext': {
      const txt = editor.export_plaintext();
      return {
        data: Buffer.from(txt, 'utf-8'),
        mimeType: 'text/plain',
        filename: 'document.txt',
      };
    }

    case 'pdf': {
      const exporter = new PdfExporter();

      // Загрузка шрифтов на сервере
      const notoSans = await readFile('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf');
      const jetBrainsMono = await readFile('/usr/share/fonts/truetype/jetbrains/JetBrainsMono-Regular.ttf');
      exporter.add_font('Noto Sans', new Uint8Array(notoSans));
      exporter.add_font('JetBrains Mono', new Uint8Array(jetBrainsMono));

      const pdfBytes = exporter.export_bytes(req.documentJson, optsJson);
      return {
        data: Buffer.from(pdfBytes),
        mimeType: 'application/pdf',
        filename: 'document.pdf',
      };
    }

    case 'docx': {
      const exporter = new DocxExporter();
      const docxBytes = exporter.export_bytes(req.documentJson, optsJson);
      return {
        data: Buffer.from(docxBytes),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: 'document.docx',
      };
    }
  }
}

// Express route example
import express from 'express';
const app = express();

app.post('/api/export', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const result = await exportDocument(req.body);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

### Native Rust Binary

```rust
// server/export-server/src/main.rs

use actix_web::{web, App, HttpServer, HttpResponse};
use gotipe_core::{Document, Schema};
use gotipe_export::{ConverterRegistry, ExportOptions, PdfExporter};

struct AppState {
    registry: ConverterRegistry,
    schema: Schema,
}

#[derive(serde::Deserialize)]
struct ExportRequest {
    document: serde_json::Value,
    format: String,
    #[serde(default)]
    options: ExportOptions,
}

async fn handle_export(
    state: web::Data<AppState>,
    req: web::Json<ExportRequest>,
) -> HttpResponse {
    let doc = match Document::from_value(&req.document, &state.schema) {
        Ok(d) => d,
        Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": e.to_string()
        })),
    };

    match state.registry.export(&req.format, &doc, &req.options) {
        Ok(result) => match result {
            ExportResult::Text { content, mime_type, .. } => {
                HttpResponse::Ok()
                    .content_type(mime_type)
                    .body(content)
            }
            ExportResult::Binary { data, mime_type, extension } => {
                HttpResponse::Ok()
                    .content_type(mime_type)
                    .insert_header(("Content-Disposition",
                        format!("attachment; filename=\"document.{extension}\"")))
                    .body(data)
            }
        },
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let mut registry = ConverterRegistry::new();

    // PDF exporter с fonts
    let mut pdf = PdfExporter::new().expect("Failed to init PDF exporter");
    pdf.add_font("Noto Sans", include_bytes!("../fonts/NotoSans-Regular.ttf"))
        .expect("Failed to load font");
    registry.register_exporter(Box::new(pdf));

    let state = web::Data::new(AppState {
        registry,
        schema: Schema::default_block_editor(),
    });

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .route("/export", web::post().to(handle_export))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
```

### Go via FFI

```go
// server/export/gotipe_ffi.go

package export

/*
#cgo LDFLAGS: -L${SRCDIR}/lib -lgotipe_export
#include "gotipe_export.h"
*/
import "C"
import (
	"fmt"
	"unsafe"
)

// ExportPDF вызывает Rust gotipe-export через FFI
func ExportPDF(documentJSON string, options string) ([]byte, error) {
	cDoc := C.CString(documentJSON)
	defer C.free(unsafe.Pointer(cDoc))

	cOpts := C.CString(options)
	defer C.free(unsafe.Pointer(cOpts))

	var outLen C.size_t
	result := C.gotipe_export_pdf(cDoc, cOpts, &outLen)
	if result == nil {
		return nil, fmt.Errorf("PDF export failed")
	}
	defer C.gotipe_free(unsafe.Pointer(result))

	return C.GoBytes(unsafe.Pointer(result), C.int(outLen)), nil
}

// ExportHTML вызывает Rust gotipe-export через FFI
func ExportHTML(documentJSON string) (string, error) {
	cDoc := C.CString(documentJSON)
	defer C.free(unsafe.Pointer(cDoc))

	result := C.gotipe_export_html(cDoc)
	if result == nil {
		return "", fmt.Errorf("HTML export failed")
	}
	defer C.gotipe_free(unsafe.Pointer(result))

	return C.GoString(result), nil
}
```

Rust C-API для FFI:

```rust
// crates/gotipe-export/src/ffi.rs

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

#[no_mangle]
pub extern "C" fn gotipe_export_html(doc_json: *const c_char) -> *mut c_char {
    let doc_json = unsafe { CStr::from_ptr(doc_json) }.to_str().unwrap_or("");
    let schema = Schema::default_block_editor();

    match Document::from_json(doc_json, &schema) {
        Ok(doc) => {
            match to_html(&doc) {
                Ok(html) => CString::new(html).unwrap().into_raw(),
                Err(_) => std::ptr::null_mut(),
            }
        }
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn gotipe_export_pdf(
    doc_json: *const c_char,
    opts_json: *const c_char,
    out_len: *mut usize,
) -> *mut u8 {
    let doc_json = unsafe { CStr::from_ptr(doc_json) }.to_str().unwrap_or("");
    let opts_json = unsafe { CStr::from_ptr(opts_json) }.to_str().unwrap_or("{}");
    let schema = Schema::default_block_editor();

    match Document::from_json(doc_json, &schema) {
        Ok(doc) => {
            let exporter = PdfExporter::new().unwrap();
            let opts = ExportOptions::default();
            match exporter.export_bytes(&doc, &opts) {
                Ok(bytes) => {
                    unsafe { *out_len = bytes.len(); }
                    let ptr = bytes.as_ptr() as *mut u8;
                    std::mem::forget(bytes); // caller frees via gotipe_free
                    ptr
                }
                Err(_) => std::ptr::null_mut(),
            }
        }
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn gotipe_free(ptr: *mut std::ffi::c_void) {
    if !ptr.is_null() {
        unsafe { drop(Box::from_raw(ptr)); }
    }
}
```

---

## Bundle Sizes

| Converter | WASM size (gzip) | Загрузка | Включён в core bundle |
|-----------|-----------------|----------|----------------------|
| HTML exporter + importer | ~8KB | Eager | Да |
| Markdown exporter + importer | ~12KB | Eager | Да |
| Plain Text exporter | ~3KB | Eager | Да |
| JSON (serde) | ~2KB | Eager | Да |
| **Core export bundle** | **~25KB** | | |
| PDF exporter (typst) | ~400KB | Lazy (`import()`) | Нет |
| DOCX exporter + importer | ~60KB | Lazy (`import()`) | Нет |
| Notion importer | ~15KB | Lazy (`import()`) | Нет |
| Google Docs paste handler | ~5KB | Lazy (on paste event) | Нет |

**Стратегия:** core bundle содержит только текстовые конвертеры (~25KB). PDF и DOCX загружаются по требованию через dynamic `import()`. Пользователь не платит за PDF, если не экспортирует в PDF.

Подробнее о WASM binary sizes в [01-architecture.md](01-architecture.md).

---

## Cargo.toml (gotipe-export)

```toml
# crates/gotipe-export/Cargo.toml
[package]
name = "gotipe-export"
version = "0.1.0"
edition = "2021"

[features]
default = ["html", "markdown", "plaintext"]
html = ["ammonia"]
markdown = ["pulldown-cmark"]
plaintext = []
pdf = ["typst", "typst-pdf"]
docx = ["docx-rs"]
notion = ["markdown", "csv"]
ffi = []

[dependencies]
gotipe-core = { path = "../gotipe-core" }
thiserror = "2.0"
serde = { workspace = true }
serde_json = { workspace = true }
slug = "0.1"

# HTML
ammonia = { version = "4.0", optional = true }

# Markdown
pulldown-cmark = { version = "0.12", optional = true }

# PDF
typst = { version = "0.12", optional = true }
typst-pdf = { version = "0.12", optional = true }

# DOCX
docx-rs = { version = "0.4", optional = true }

# Notion
csv = { version = "1.3", optional = true }
```

Feature flags позволяют собрать WASM binary без PDF/DOCX для минимального bundle:

```bash
# Core bundle (HTML + Markdown + PlainText): ~25KB gzip
wasm-pack build crates/gotipe-wasm --release --features "export-core"

# Full bundle (+ PDF + DOCX): ~485KB gzip
wasm-pack build crates/gotipe-wasm --release --features "export-full"

# PDF-only add-on (отдельный WASM module для lazy load)
wasm-pack build crates/gotipe-export-pdf --release --features "pdf"
```

---

## Связанные документы

- [03-editor-core.md](03-editor-core.md) -- Document model, serialization, server-side usage
- [10-cloud.md](10-cloud.md) -- Export service в GoTipe Cloud
- [01-architecture.md](01-architecture.md) -- WASM binary sizes, crate structure
- [05-extensions.md](05-extensions.md) -- Extension system (custom export formats как extensions)
- [04-block-editor.md](04-block-editor.md) -- Block types, которые экспортируются
