//! Deterministic XMP; no fabricated timestamp or dependency compiler identity.
use pdf_writer::{Pdf, Ref};

use super::writer::Ids;

/// Document-level description supplied by the caller; empty values are omitted.
#[derive(Default)]
pub(crate) struct DocumentMetadata<'a> {
    pub lang: Option<&'a str>,
    pub title: Option<&'a str>,
    pub author: Option<&'a str>,
}

pub(super) fn write(pdf: &mut Pdf, ids: &mut Ids, pages: usize, meta: &DocumentMetadata) -> Ref {
    let reference = ids.next();
    let mut description = String::new();
    if let Some(title) = meta.title {
        description.push_str(&format!(
            r#"<dc:title><rdf:Alt><rdf:li xml:lang="x-default">{}</rdf:li></rdf:Alt></dc:title>"#,
            escape(title)
        ));
    }
    if let Some(author) = meta.author {
        description.push_str(&format!(
            "<dc:creator><rdf:Seq><rdf:li>{}</rdf:li></rdf:Seq></dc:creator>",
            escape(author)
        ));
    }
    if let Some(lang) = meta.lang {
        description.push_str(&format!(
            "<dc:language><rdf:Bag><rdf:li>{}</rdf:li></rdf:Bag></dc:language>",
            escape(lang)
        ));
    }
    let xml = format!(
        r#"<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpTPg="http://ns.adobe.com/xap/1.0/t/pg/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<xmp:CreatorTool>GoTipe</xmp:CreatorTool><pdf:Producer>GoTipe PDF</pdf:Producer>{description}
<dc:format>application/pdf</dc:format><xmpTPg:NPages>{pages}</xmpTPg:NPages><pdf:PDFVersion>1.7</pdf:PDFVersion>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="r"?>"#
    );
    pdf.metadata(reference, xml.as_bytes());
    reference
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
