//! Semantic structure, per-page MCID ownership and link annotation references.
use std::collections::BTreeMap;

use pdf_writer::{types::TableHeaderScope, Content, Finish, Name, Pdf, Ref, TextStr};

use super::{
    fonts::FontStyle,
    model::{Tag, TextStyle},
    writer::Ids,
};
use crate::ConvertError;

enum Child {
    Node(usize),
    Content { page: Ref, id: i32 },
    Object { page: Ref, reference: Ref },
}
struct Node {
    reference: Ref,
    parent: Option<usize>,
    role: String,
    alt: Option<String>,
    colspan: u32,
    rowspan: u32,
    list_numbering: Option<String>,
    children: Vec<Child>,
}

pub(super) struct Paint {
    link: Option<usize>,
}

pub(super) struct Tagging {
    pub root: Ref,
    nodes: Vec<Node>,
    named: BTreeMap<u64, usize>,
    stack: Vec<usize>,
    parents: Vec<Vec<Ref>>,
    annotations: Vec<Ref>,
}

impl Tagging {
    pub fn new(ids: &mut Ids, pages: usize) -> Self {
        Self {
            root: ids.next(),
            nodes: vec![Node {
                reference: ids.next(),
                parent: None,
                role: "Document".into(),
                alt: None,
                colspan: 1,
                rowspan: 1,
                list_numbering: None,
                children: Vec::new(),
            }],
            named: BTreeMap::new(),
            stack: Vec::new(),
            parents: vec![Vec::new(); pages],
            annotations: Vec::new(),
        }
    }

    pub fn begin(&mut self, tag: &Tag, ids: &mut Ids) -> Result<(), ConvertError> {
        const ROLES: &[&str] = &[
            "Part",
            "Div",
            "P",
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
            "L",
            "LI",
            "Lbl",
            "LBody",
            "Table",
            "TR",
            "TH",
            "TD",
            "Figure",
            "Caption",
            "BlockQuote",
            "Code",
            "Span",
            "Link",
            "Strong",
            "Em",
        ];
        if !ROLES.contains(&tag.role.as_str()) || tag.colspan == 0 || tag.rowspan == 0 {
            return Err(ConvertError::Encoding(format!(
                "Invalid PDF structure tag: {}",
                tag.role
            )));
        }
        let parent = self.stack.last().copied().unwrap_or(0);
        let index = if let Some(&index) = self.named.get(&tag.id) {
            let node = &self.nodes[index];
            if node.parent != Some(parent)
                || node.role != tag.role
                || node.alt != tag.alt
                || node.colspan != tag.colspan
                || node.rowspan != tag.rowspan
                || node.list_numbering != tag.list_numbering
                || self.stack.contains(&index)
            {
                return Err(ConvertError::Encoding(
                    "Inconsistent PDF structure ownership".into(),
                ));
            }
            index
        } else {
            let index = self.child(parent, &tag.role, tag.alt.clone(), ids);
            self.nodes[index].colspan = tag.colspan;
            self.nodes[index].rowspan = tag.rowspan;
            self.nodes[index].list_numbering = tag.list_numbering.clone();
            self.named.insert(tag.id, index);
            index
        };
        self.stack.push(index);
        Ok(())
    }

    pub fn end(&mut self) -> Result<(), ConvertError> {
        self.stack
            .pop()
            .ok_or_else(|| ConvertError::Encoding("Unbalanced PDF structure end".into()))?;
        Ok(())
    }

    pub fn page_end(&self) -> Result<(), ConvertError> {
        if self.stack.is_empty() {
            Ok(())
        } else {
            Err(ConvertError::Encoding(
                "PDF structure crosses a row/page boundary".into(),
            ))
        }
    }

    fn child(&mut self, parent: usize, role: &str, alt: Option<String>, ids: &mut Ids) -> usize {
        let index = self.nodes.len();
        self.nodes.push(Node {
            reference: ids.next(),
            parent: Some(parent),
            role: role.into(),
            alt,
            colspan: 1,
            rowspan: 1,
            list_numbering: None,
            children: Vec::new(),
        });
        self.nodes[parent].children.push(Child::Node(index));
        index
    }

    pub fn text(
        &mut self,
        content: &mut Content,
        page: usize,
        reference: Ref,
        style: &TextStyle,
        ids: &mut Ids,
    ) -> Result<Paint, ConvertError> {
        let Some(mut node) = self.stack.last().copied() else {
            content.begin_marked_content(Name(b"Artifact"));
            return Ok(Paint { link: None });
        };
        let link = style.link.as_ref().map(|_| {
            node = self.child(node, "Link", None, ids);
            node
        });
        if matches!(
            style.font,
            FontStyle::Mono
                | FontStyle::MonoBold
                | FontStyle::MonoItalic
                | FontStyle::MonoBoldItalic
        ) {
            node = self.child(node, "Code", None, ids);
        }
        if matches!(
            style.font,
            FontStyle::SerifBold
                | FontStyle::SerifBoldItalic
                | FontStyle::MonoBold
                | FontStyle::MonoBoldItalic
        ) {
            node = self.child(node, "Strong", None, ids);
        }
        if matches!(
            style.font,
            FontStyle::SerifItalic
                | FontStyle::SerifBoldItalic
                | FontStyle::MonoItalic
                | FontStyle::MonoBoldItalic
        ) {
            node = self.child(node, "Em", None, ids);
        }
        self.mark(content, page, reference, node)?;
        Ok(Paint { link })
    }

    pub fn image(
        &mut self,
        content: &mut Content,
        page: usize,
        reference: Ref,
        alt: &str,
        ids: &mut Ids,
    ) -> Result<(), ConvertError> {
        let Some(mut node) = self.stack.last().copied() else {
            content.begin_marked_content(Name(b"Artifact"));
            return Ok(());
        };
        if self.nodes[node].role != "Figure" {
            node = self.child(node, "Figure", Some(alt.into()), ids);
        }
        self.mark(content, page, reference, node)
    }

    fn mark(
        &mut self,
        content: &mut Content,
        page: usize,
        reference: Ref,
        node: usize,
    ) -> Result<(), ConvertError> {
        let id = i32::try_from(self.parents[page].len())
            .map_err(|_| ConvertError::Encoding("Too many PDF marked sequences".into()))?;
        self.parents[page].push(self.nodes[node].reference);
        self.nodes[node].children.push(Child::Content {
            page: reference,
            id,
        });
        content
            .begin_marked_content_with_properties(Name(self.nodes[node].role.as_bytes()))
            .properties()
            .identify(id);
        Ok(())
    }

    pub fn annotation(
        &mut self,
        paint: Paint,
        page: Ref,
        reference: Ref,
    ) -> Result<Option<i32>, ConvertError> {
        let Some(node) = paint.link else {
            return Ok(None);
        };
        let key = i32::try_from(self.parents.len() + self.annotations.len())
            .map_err(|_| ConvertError::Encoding("Too many PDF tagged annotations".into()))?;
        self.annotations.push(self.nodes[node].reference);
        self.nodes[node]
            .children
            .push(Child::Object { page, reference });
        Ok(Some(key))
    }

    pub fn finish(self, pdf: &mut Pdf, ids: &mut Ids) -> Result<(), ConvertError> {
        self.page_end()?;
        let arrays: Vec<_> = self
            .parents
            .iter()
            .map(|parents| {
                let reference = ids.next();
                pdf.indirect(reference)
                    .array()
                    .items(parents.iter().copied());
                reference
            })
            .collect();
        let mut tree = pdf.indirect(self.root).dict();
        tree.pair(Name(b"Type"), Name(b"StructTreeRoot"))
            .pair(Name(b"K"), self.nodes[0].reference)
            .pair(
                Name(b"ParentTreeNextKey"),
                i32::try_from(arrays.len() + self.annotations.len())
                    .map_err(|_| ConvertError::Encoding("PDF parent tree too large".into()))?,
            );
        tree.insert(Name(b"RoleMap"))
            .dict()
            .pair(Name(b"Strong"), Name(b"Span"))
            .pair(Name(b"Em"), Name(b"Span"));
        {
            let mut parent_tree = tree.insert(Name(b"ParentTree")).dict();
            let mut nums = parent_tree.insert(Name(b"Nums")).array();
            for (index, reference) in arrays.into_iter().chain(self.annotations).enumerate() {
                nums.item(index as i32).item(reference);
            }
        }
        tree.finish();
        for node in &self.nodes {
            let mut element = pdf.struct_element(node.reference);
            element.custom_kind(Name(node.role.as_bytes())).parent(
                node.parent
                    .map_or(self.root, |parent| self.nodes[parent].reference),
            );
            if let Some(alt) = &node.alt {
                element.alt(TextStr(alt));
            }
            if let Some(numbering) = &node.list_numbering {
                if node.role != "L"
                    || ![
                        "None",
                        "Disc",
                        "Circle",
                        "Square",
                        "Decimal",
                        "LowerRoman",
                        "UpperRoman",
                        "LowerAlpha",
                        "UpperAlpha",
                    ]
                    .contains(&numbering.as_str())
                {
                    return Err(ConvertError::Encoding("Invalid PDF list numbering".into()));
                }
                element
                    .insert(Name(b"A"))
                    .array()
                    .push()
                    .dict()
                    .pair(Name(b"O"), Name(b"List"))
                    .pair(Name(b"ListNumbering"), Name(numbering.as_bytes()));
            }
            if matches!(node.role.as_str(), "TH" | "TD") {
                let mut attributes = element.attributes();
                let mut table = attributes.push().table();
                table
                    .col_span(i32::try_from(node.colspan).map_err(|_| {
                        ConvertError::Encoding("PDF table colspan too large".into())
                    })?)
                    .row_span(i32::try_from(node.rowspan).map_err(|_| {
                        ConvertError::Encoding("PDF table rowspan too large".into())
                    })?);
                if node.role == "TH" {
                    table.scope(TableHeaderScope::Column);
                }
            }
            let mut children = element.children();
            for child in &node.children {
                match child {
                    Child::Node(index) => {
                        children.struct_element(self.nodes[*index].reference);
                    }
                    Child::Content { page, id } => {
                        children
                            .marked_content_ref()
                            .page(*page)
                            .marked_content_id(*id);
                    }
                    Child::Object { page, reference } => {
                        children.object_ref().page(*page).object(*reference);
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tag(id: u64, role: &str) -> Tag {
        Tag {
            id,
            role: role.into(),
            alt: None,
            colspan: 1,
            rowspan: 1,
            list_numbering: None,
        }
    }

    #[test]
    fn repeated_row_fragments_keep_one_owner_but_cannot_change_parent() {
        let mut ids = Ids::new();
        let mut tagging = Tagging::new(&mut ids, 2);
        for _ in 0..2 {
            tagging.begin(&tag(1, "P"), &mut ids).unwrap();
            tagging.begin(&tag(2, "Span"), &mut ids).unwrap();
            tagging.end().unwrap();
            tagging.end().unwrap();
            tagging.page_end().unwrap();
        }
        tagging.begin(&tag(3, "P"), &mut ids).unwrap();
        assert!(tagging.begin(&tag(2, "Span"), &mut ids).is_err());
    }

    #[test]
    fn unbalanced_or_cyclic_structure_fails_before_pdf_is_returned() {
        let mut ids = Ids::new();
        let mut tagging = Tagging::new(&mut ids, 1);
        assert!(tagging.end().is_err());
        tagging.begin(&tag(1, "P"), &mut ids).unwrap();
        assert!(tagging.page_end().is_err());
        assert!(tagging.begin(&tag(1, "P"), &mut ids).is_err());
    }
}
