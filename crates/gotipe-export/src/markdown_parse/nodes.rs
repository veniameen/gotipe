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
    pub url: String,
    pub title: Option<String>,
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
