//! Optional PDF/DOCX typography is loaded independently of the editor engine.
use gotipe_export::{
    docx::{to_docx, DocxOptions},
    input::document_from_json,
    pdf::{to_pdf, PdfOptions},
    ConvertError,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    /// The global `Error` constructor; rejections are real errors with a stack.
    #[wasm_bindgen(js_name = Error)]
    type ExportFailure;
    #[wasm_bindgen(constructor, js_class = "Error")]
    fn new(message: &str) -> ExportFailure;
    #[wasm_bindgen(method, setter = name)]
    fn set_name(this: &ExportFailure, name: &str);
    #[wasm_bindgen(method, setter = code)]
    fn set_code(this: &ExportFailure, code: &str);
}

/// Every failure rejects with an `Error` named `GoTipeExportError` and a stable `code`.
fn reject(error: ConvertError) -> JsValue {
    let failure = ExportFailure::new(&error.to_string());
    failure.set_name("GoTipeExportError");
    failure.set_code(error.code());
    failure.into()
}

fn invalid_options(error: serde_json::Error) -> JsValue {
    reject(ConvertError::InvalidOptions(error.to_string()))
}

#[wasm_bindgen(js_name=exportPdf)]
pub fn export_pdf(document: &str, options: &str) -> Result<Vec<u8>, JsValue> {
    let document = document_from_json(document).map_err(reject)?;
    let options: PdfOptions = serde_json::from_str(options).map_err(invalid_options)?;
    to_pdf(&document, &options).map_err(reject)
}
#[wasm_bindgen(js_name=exportDocx)]
pub fn export_docx(document: &str, options: &str) -> Result<Vec<u8>, JsValue> {
    let document = document_from_json(document).map_err(reject)?;
    let options: DocxOptions = serde_json::from_str(options).map_err(invalid_options)?;
    to_docx(&document, &options).map_err(reject)
}
