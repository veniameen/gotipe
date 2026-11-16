use super::Source;
#[derive(Clone, Debug, Default)]
pub(super) struct Node {
    pub kind: &'static str,
    pub start: usize,
    pub end: usize,
    pub value: String,
    pub children: Vec<Node>,
    pub source: Option<Source>,
    pub in_cell: bool,
    pub level: usize,
    pub lang: Option<String>,
    pub meta: Option<String>,
    pub ordered: bool,
    pub number: usize,
    pub spread: bool,
    pub checked: Option<bool>,
    pub align: Vec<Option<String>>,
    /// A table whose head row ended a paragraph: a lazy line there continues the paragraph's
    /// text (D-216).
    pub after_text: bool,
    pub url: String,
    pub title: Option<String>,
    /// Text of a backslash escape or a character reference while the inline reader runs: as
    /// in GFM it is never part of an autolink literal (D-97).
    pub decoded: bool,
}
impl Node {
    pub fn new(kind: &'static str, start: usize, end: usize) -> Self {
        Self {
            kind,
            start,
            end,
            ..Self::default()
        }
    }
    pub fn text(kind: &'static str, value: impl Into<String>, start: usize, end: usize) -> Self {
        let mut n = Self::new(kind, start, end);
        n.value = value.into();
        n
    }
    pub fn plain(&self) -> String {
        if self.kind == "image" || !self.value.is_empty() {
            self.value.clone()
        } else if self.kind == "break" {
            "\n".into()
        } else {
            self.children.iter().map(Self::plain).collect()
        }
    }
}
