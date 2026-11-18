//! The steps that turn the stored table into the planned one, as `packages/core/src/table/steps.ts`.
//! Cells keep their IDs: a cell that only changes its span is updated, one whose top row goes
//! away moves to the next row, so comments, history and other replicas keep pointing at it.

use std::collections::{HashMap, HashSet};

use gotipe_schema::{AttrValue, Block, BlockContent, BlockId};

use super::plan::{planned, PlannedTable};
use crate::transaction::Step;

fn utf16(text: &str) -> usize {
    text.encode_utf16().count()
}

pub fn table_steps(table: &Block, plan: &PlannedTable) -> Vec<Step> {
    if plan.removed {
        return vec![Step::DeleteBlock {
            block_id: table.id.clone(),
        }];
    }
    let target = planned(plan);
    let mut steps = Vec::new();
    let kept: HashSet<&BlockId> = target
        .children
        .iter()
        .flat_map(|row| row.children.iter().map(|cell| &cell.id))
        .collect();
    let mut rows: HashMap<BlockId, Vec<BlockId>> = table
        .children
        .iter()
        .map(|row| {
            let cells = row.children.iter().map(|cell| cell.id.clone()).collect();
            (row.id.clone(), cells)
        })
        .collect();
    let mut order: Vec<BlockId> = table.children.iter().map(|row| row.id.clone()).collect();
    let mut owner: HashMap<BlockId, BlockId> = HashMap::new();
    for row in &table.children {
        for cell in &row.children {
            owner.insert(cell.id.clone(), row.id.clone());
        }
    }

    // 1. cells that go away
    for row in &table.children {
        for cell in &row.children {
            if !kept.contains(&cell.id) {
                steps.push(Step::DeleteBlock {
                    block_id: cell.id.clone(),
                });
                rows.get_mut(&row.id).unwrap().retain(|id| id != &cell.id);
            }
        }
    }
    // 2. new rows, empty, after the row that precedes them in the plan
    let mut previous: Option<&BlockId> = None;
    for row in &target.children {
        if !rows.contains_key(&row.id) {
            let index = previous
                .and_then(|id| order.iter().position(|entry| entry == id))
                .map_or(0, |position| position + 1);
            let mut block = row.clone();
            block.children = Vec::new();
            steps.push(Step::InsertBlock {
                parent_id: Some(table.id.clone()),
                index,
                block,
            });
            order.insert(index, row.id.clone());
            rows.insert(row.id.clone(), Vec::new());
        }
        previous = Some(&row.id);
    }
    // 3. every row gets its cells in order: new cells inserted, kept cells moved in
    for row in &target.children {
        for (index, cell) in row.children.iter().enumerate() {
            if rows[&row.id].get(index) == Some(&cell.id) {
                continue;
            }
            match owner.get(&cell.id).cloned() {
                None => {
                    let mut block = cell.clone();
                    if matches!(block.content, BlockContent::RichText(_)) {
                        block.content = BlockContent::RichText(Vec::new());
                    }
                    steps.push(Step::InsertBlock {
                        parent_id: Some(row.id.clone()),
                        index,
                        block,
                    });
                }
                Some(from) => {
                    rows.get_mut(&from).unwrap().retain(|id| id != &cell.id);
                    steps.push(Step::MoveBlock {
                        block_id: cell.id.clone(),
                        new_parent_id: Some(row.id.clone()),
                        new_index: index,
                    });
                }
            }
            owner.insert(cell.id.clone(), row.id.clone());
            rows.get_mut(&row.id)
                .unwrap()
                .insert(index, cell.id.clone());
        }
    }
    // 4. spans, then the text merged cells bring along
    let before: HashMap<&BlockId, &Block> = table
        .children
        .iter()
        .flat_map(|row| row.children.iter().map(|cell| (&cell.id, cell)))
        .collect();
    for row in &target.children {
        for cell in &row.children {
            let Some(old) = before.get(&cell.id) else {
                continue;
            };
            let mut changed = HashMap::new();
            for name in ["colspan", "rowspan"] {
                if let Some(value) = cell.attrs.get(name) {
                    if old.attrs.get(name) != Some(value) {
                        changed.insert(name.to_string(), value.clone());
                    }
                }
            }
            if !changed.is_empty() {
                steps.push(Step::SetBlockAttrs {
                    block_id: cell.id.clone(),
                    attrs: changed,
                });
            }
        }
    }
    for cell in &plan.cells {
        let mut offset = if cell.fresh {
            0
        } else {
            cell.block.text_length()
        };
        for line in &cell.appended {
            let separator = gotipe_schema::TextSpan {
                text: "\n".into(),
                marks: Vec::new(),
            };
            let lead = (offset > 0).then_some(&separator);
            for span in lead.into_iter().chain(line.iter()) {
                if span.text.is_empty() {
                    continue;
                }
                steps.push(Step::InsertText {
                    block_id: cell.block.id.clone(),
                    offset,
                    text: span.text.clone(),
                    marks: span.marks.clone(),
                });
                offset += utf16(&span.text);
            }
        }
    }
    // 5. rows left without a place, then the columns' widths and alignment
    for id in &order {
        if !target.children.iter().any(|row| &row.id == id) {
            steps.push(Step::DeleteBlock {
                block_id: id.clone(),
            });
        }
    }
    let mut attrs = HashMap::new();
    let widths: Vec<AttrValue> = plan
        .widths
        .iter()
        .map(|w| w.map_or(AttrValue::Null, AttrValue::Number))
        .collect();
    let changed_widths = match table.attrs.get("colWidths") {
        Some(AttrValue::Array(stored)) => stored != &widths,
        _ => plan.widths.iter().any(Option::is_some),
    };
    if changed_widths {
        attrs.insert("colWidths".to_string(), AttrValue::Array(widths));
    }
    let changed_align = match table.attrs.get("align") {
        Some(AttrValue::Array(stored)) => stored != &plan.align,
        _ => plan.align.iter().any(|value| value != &AttrValue::Null),
    };
    if changed_align {
        attrs.insert("align".to_string(), AttrValue::Array(plan.align.clone()));
    }
    if !attrs.is_empty() {
        steps.push(Step::SetBlockAttrs {
            block_id: table.id.clone(),
            attrs,
        });
    }
    steps
}
