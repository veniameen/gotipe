#[cfg(feature = "docx")]
use gotipe_export::docx::{to_docx, DocxOptions};
use gotipe_export::input::document_from_json;
#[cfg(feature = "pdf")]
use gotipe_export::pdf::{to_pdf, PdfOptions};
use std::io::{Read, Write};

fn convert() -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let format = std::env::args().nth(1).ok_or(
        "usage: gotipe-convert <html|markdown|plaintext|json|pdf|docx|parse-markdown|project-crdt>",
    )?;
    let mut input = String::new();
    std::io::stdin()
        .take(64 * 1024 * 1024 + 1)
        .read_to_string(&mut input)?;
    if input.len() > 64 * 1024 * 1024 {
        return Err("input exceeds 64 MiB".into());
    }
    if format == "parse-markdown" {
        let document = gotipe_export::markdown::from_markdown(
            &input,
            &gotipe_core::defaults::default_block_editor(),
        )?;
        return Ok(serde_json::to_vec(&gotipe_export::input::public_document(
            &document,
        ))?);
    }
    if format == "project-crdt" {
        let value: serde_json::Value = serde_json::from_str(&input)?;
        let base =
            document_from_json(&value.get("document").ok_or("missing document")?.to_string())?;
        let mut replica = gotipe_crdt::CrdtDocument::try_new("server-projector", &base)?;
        for update in value
            .get("updates")
            .and_then(serde_json::Value::as_array)
            .ok_or("missing updates")?
        {
            replica.apply_remote(&serde_json::to_vec(update)?)?;
        }
        return Ok(serde_json::to_vec(&gotipe_export::input::public_document(
            &replica.to_document(),
        ))?);
    }
    let document = document_from_json(&input)?;
    Ok(match format.as_str() {
        "html" => gotipe_export::to_html(&document)?.into_bytes(),
        "markdown" => gotipe_export::to_markdown(&document).into_bytes(),
        "plaintext" => gotipe_export::to_plaintext(&document).into_bytes(),
        "json" => serde_json::to_vec_pretty(&gotipe_export::input::public_document(&document))?,
        #[cfg(feature = "pdf")]
        "pdf" => to_pdf(&document, &PdfOptions::default())?,
        #[cfg(feature = "docx")]
        "docx" => to_docx(&document, &DocxOptions::default())?,
        _ => return Err("unsupported export format".into()),
    })
}
fn main() {
    match convert() {
        Ok(bytes) => {
            if let Err(error) = std::io::stdout().write_all(&bytes) {
                eprintln!("{error}");
                std::process::exit(1)
            }
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1)
        }
    }
}
