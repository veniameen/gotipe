#[derive(Clone, Debug, Default)]
pub(super) struct Source {
    pub text: String,
    pub offsets: Vec<usize>,
}
impl Source {
    pub fn slice(&self, from: usize, to: usize) -> Self {
        Self {
            text: self.text[from..to].into(),
            offsets: self.offsets[from..=to].to_vec(),
        }
    }
    pub fn point(&self, offset: usize) -> usize {
        self.offsets.get(offset).copied().unwrap_or(0)
    }
}
#[derive(Clone, Debug, Default)]
pub(super) struct Line {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub column: usize,
    pub lazy: bool,
    pub eol: String,
    pub offsets: Vec<usize>,
}
impl Line {
    pub fn new(text: &str, start: usize, end: usize) -> Self {
        Self {
            text: text.into(),
            start,
            end,
            ..Self::default()
        }
    }
    pub fn blank(&self) -> bool {
        self.text.bytes().all(|c| c == b' ' || c == b'\t')
    }
    pub fn point(&self, i: usize) -> usize {
        self.offsets.get(i).copied().unwrap_or(self.start + i)
    }
    /// Where a block read from the line starts: after its spaces.
    pub fn text_start(&self) -> usize {
        self.start + self.text.bytes().take_while(|c| *c == b' ').count()
    }
    pub fn strip(&self, count: usize) -> Self {
        let mut result = self.clone();
        result.text = self.text[count..].into();
        result.start = self.point(count);
        result.offsets = if self.offsets.is_empty() {
            vec![]
        } else {
            self.offsets[count..].to_vec()
        };
        for c in self.text[..count].chars() {
            result.column += if c == '\t' { 4 - result.column % 4 } else { 1 };
        }
        result
    }
    pub fn indent(&self, width: usize) -> Self {
        let mut used = 0;
        let mut count = 0;
        for c in self.text.bytes() {
            if used >= width {
                break;
            }
            if c == b' ' {
                used += 1
            } else if c == b'\t' {
                used += 4 - (self.column + used) % 4
            } else {
                break;
            }
            count += 1;
        }
        let mut result = self.strip(count);
        if used <= width {
            return result;
        }
        let remaining = used - width;
        let offset = self.point(count - 1);
        let mut offsets = vec![offset; remaining];
        offsets.extend((0..=result.text.len()).map(|i| result.point(i)));
        result.text = format!("{}{}", " ".repeat(remaining), result.text);
        result.start = offset;
        result.offsets = offsets;
        result.column = self.column + width;
        result
    }
}
pub(super) fn width(text: &str, column: usize) -> usize {
    let mut used = column;
    for c in text.bytes() {
        if c == b' ' {
            used += 1
        } else if c == b'\t' {
            used += 4 - used % 4
        } else {
            break;
        }
    }
    used - column
}
pub(super) fn lines(text: &str, base: usize) -> Vec<Line> {
    let mut result = vec![];
    let mut start = 0;
    let bytes = text.as_bytes();
    while start < text.len() {
        let mut end = start;
        while end < text.len() && bytes[end] != b'\r' && bytes[end] != b'\n' {
            end += 1
        }
        let mut next = end;
        if bytes.get(next) == Some(&b'\r') {
            next += 1
        }
        if bytes.get(next) == Some(&b'\n') {
            next += 1
        }
        let mut line = Line::new(&text[start..end], base + start, base + end);
        line.eol = text[end..next].into();
        result.push(line);
        start = next;
    }
    result
}
pub(super) fn source(lines: &[Line]) -> Source {
    let mut result = Source::default();
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            result.text.push('\n');
            result.offsets.push(lines[i - 1].end)
        }
        result
            .offsets
            .extend((0..line.text.len()).map(|i| line.point(i)));
        result.text.push_str(&line.text);
    }
    result.offsets.push(lines.last().map_or(0, |l| l.end));
    result
}
