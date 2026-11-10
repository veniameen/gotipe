//! Optional PDF/DOCX typography is loaded independently of the editor engine.
use gotipe_export::{
    docx::{to_docx, DocxOptions},
    input::document_from_json,
    pdf::{to_pdf, PdfOptions},
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name=exportPdf)]
pub fn export_pdf(document: &str, options: &str) -> Result<Vec<u8>, JsValue> {
    let document = document_from_json(document).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let options: PdfOptions =
        serde_json::from_str(options).map_err(|e| JsValue::from_str(&e.to_string()))?;
    to_pdf(&document, &options).map_err(|e| JsValue::from_str(&e.to_string()))
}
#[wasm_bindgen(js_name=exportDocx)]
pub fn export_docx(document: &str, options: &str) -> Result<Vec<u8>, JsValue> {
    let document = document_from_json(document).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let options: DocxOptions =
        serde_json::from_str(options).map_err(|e| JsValue::from_str(&e.to_string()))?;
    to_docx(&document, &options).map_err(|e| JsValue::from_str(&e.to_string()))
}
