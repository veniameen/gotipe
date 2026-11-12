//! Deterministic XMP; no fabricated timestamp or dependency compiler identity.
use pdf_writer::{Pdf, Ref};

use super::writer::Ids;

pub(super) fn write(pdf: &mut Pdf, ids: &mut Ids, pages: usize) -> Ref {
    let reference = ids.next();
    let xml = format!(
        r#"<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpTPg="http://ns.adobe.com/xap/1.0/t/pg/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<xmp:CreatorTool>GoTipe</xmp:CreatorTool><pdf:Producer>GoTipe PDF</pdf:Producer>
<dc:language><rdf:Bag><rdf:li>en</rdf:li></rdf:Bag></dc:language>
<dc:format>application/pdf</dc:format><xmpTPg:NPages>{pages}</xmpTPg:NPages><pdf:PDFVersion>1.7</pdf:PDFVersion>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="r"?>"#
    );
    pdf.metadata(reference, xml.as_bytes());
    reference
}
