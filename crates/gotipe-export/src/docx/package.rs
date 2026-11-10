//! Open Packaging Conventions parts and relationships for the generated document.
use super::{escape, DocxOptions};
use crate::ConvertError;
use std::io::{Cursor, Write};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;
const REL_NS: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

pub(super) fn pack(
    body: &str,
    links: &[String],
    images: &[Vec<u8>],
    metadata: &DocxOptions,
) -> Result<Vec<u8>, ConvertError> {
    let document = format!(
        r#"{XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="{OFFICE_REL}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>"#
    );
    let types = format!(
        r#"{XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>"#
    );
    let root_rels = format!(
        r#"{XML}<Relationships xmlns="{REL_NS}"><Relationship Id="document" Type="{OFFICE_REL}/officeDocument" Target="word/document.xml"/><Relationship Id="metadata" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>"#
    );
    let core = format!(
        r#"{XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>{}</dc:title><dc:creator>{}</dc:creator><dc:description>{}</dc:description></cp:coreProperties>"#,
        escape(&metadata.title)?,
        escape(&metadata.author)?,
        escape(&metadata.description)?
    );
    let mut rels = format!(
        r#"{XML}<Relationships xmlns="{REL_NS}"><Relationship Id="styles" Type="{OFFICE_REL}/styles" Target="styles.xml"/>"#
    );
    for (i, link) in links.iter().enumerate() {
        rels.push_str(&format!(r#"<Relationship Id="link{}" Type="{OFFICE_REL}/hyperlink" Target="{}" TargetMode="External"/>"#, i + 1, escape(link)?));
    }
    for i in 1..=images.len() {
        rels.push_str(&format!(
            r#"<Relationship Id="image{i}" Type="{OFFICE_REL}/image" Target="media/image{i}.png"/>"#
        ));
    }
    rels.push_str("</Relationships>");
    let mut styles = format!(
        r#"{XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>"#
    );
    for level in 1..=6 {
        styles.push_str(&format!(r#"<w:style w:type="paragraph" w:styleId="Heading{level}"><w:name w:val="heading {level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="{}"/></w:pPr><w:rPr><w:b/><w:sz w:val="{}"/></w:rPr></w:style>"#, level - 1, 48 - level * 4));
    }
    styles.push_str("</w:styles>");
    let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, data) in [
        ("[Content_Types].xml", types),
        ("_rels/.rels", root_rels),
        ("word/document.xml", document),
        ("word/styles.xml", styles),
        ("word/_rels/document.xml.rels", rels),
        ("docProps/core.xml", core),
    ] {
        archive
            .start_file(name, options)
            .map_err(|e| ConvertError::Encoding(e.to_string()))?;
        archive
            .write_all(data.as_bytes())
            .map_err(|e| ConvertError::Encoding(e.to_string()))?;
    }
    for (i, image) in images.iter().enumerate() {
        archive
            .start_file(format!("word/media/image{}.png", i + 1), options)
            .map_err(|e| ConvertError::Encoding(e.to_string()))?;
        archive
            .write_all(image)
            .map_err(|e| ConvertError::Encoding(e.to_string()))?;
    }
    Ok(archive
        .finish()
        .map_err(|e| ConvertError::Encoding(e.to_string()))?
        .into_inner())
}
