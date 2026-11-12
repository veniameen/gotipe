//! Layout output in points. Coordinates use a top-left origin; text y is its baseline.
use std::sync::Arc;

use super::{fonts::FontStyle, text::ShapedText};

pub(crate) type Color = [f32; 3];

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Tag {
    pub id: u64,
    pub role: String,
    pub alt: Option<String>,
    pub colspan: u32,
    pub rowspan: u32,
    pub list_numbering: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct TextStyle {
    pub font: FontStyle,
    pub size: f32,
    pub color: Color,
    pub highlight: Option<Color>,
    pub underline: bool,
    pub strike: bool,
    /// Positive rise moves text above the supplied baseline.
    pub rise: f32,
    pub link: Option<String>,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            font: FontStyle::Serif,
            size: 12.0,
            color: [0.0; 3],
            highlight: None,
            underline: false,
            strike: false,
            rise: 0.0,
            link: None,
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) enum DrawOp {
    BeginTag {
        tag: Tag,
    },
    EndTag,
    Bookmark {
        title: String,
        level: u8,
        x: f32,
        y: f32,
    },
    Text {
        x: f32,
        y: f32,
        run: ShapedText,
        style: TextStyle,
    },
    Rect {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        fill: Option<Color>,
        stroke: Option<Color>,
        line_width: f32,
    },
    Line {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        color: Color,
        width: f32,
    },
    Image {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        png: Arc<Vec<u8>>,
        alt: String,
    },
}

#[derive(Clone, Debug)]
pub(crate) struct Page {
    pub width: f32,
    pub height: f32,
    pub ops: Vec<DrawOp>,
}
