use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::collections::HashMap;

use gotipe_core::{Block, BlockContent, BlockId, Document, Step, TextSpan};

fn make_large_doc(block_count: usize) -> Document {
    let blocks: Vec<Block> = (0..block_count)
        .map(|i| Block {
            id: BlockId(format!("block_{i}")),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: format!("This is paragraph {i} with some content for benchmarking."),
                marks: vec![],
            }]),
            children: vec![],
        })
        .collect();

    Document { blocks, version: 0 }
}

fn bench_insert_text(c: &mut Criterion) {
    let doc = make_large_doc(1000);
    let block_id = BlockId("block_500".into());

    c.bench_function("insert_text_1000_blocks", |b| {
        b.iter(|| {
            let step = Step::InsertText {
                block_id: block_id.clone(),
                offset: 10,
                text: "INSERTED".into(),
                marks: vec![],
            };
            let _ = step.apply(black_box(doc.clone()));
        })
    });
}

fn bench_parse_json(c: &mut Criterion) {
    let doc = make_large_doc(10_000);
    let json = serde_json::to_string(&doc).unwrap();

    c.bench_function("parse_json_10k_blocks", |b| {
        b.iter(|| {
            let _: Document = serde_json::from_str(black_box(&json)).unwrap();
        })
    });
}

fn bench_validate(c: &mut Criterion) {
    let schema = gotipe_core::defaults::default_block_editor();
    let doc = make_large_doc(10_000);

    c.bench_function("validate_10k_blocks", |b| {
        b.iter(|| {
            let _ = schema.validate(black_box(&doc));
        })
    });
}

fn bench_apply_1000_inserts(c: &mut Criterion) {
    c.bench_function("apply_1000_sequential_inserts", |b| {
        b.iter(|| {
            let mut doc = Document {
                blocks: vec![Block {
                    id: BlockId("b1".into()),
                    block_type: "paragraph".into(),
                    attrs: HashMap::new(),
                    content: BlockContent::RichText(vec![]),
                    children: vec![],
                }],
                version: 0,
            };
            for i in 0..1000 {
                let step = Step::InsertText {
                    block_id: BlockId("b1".into()),
                    offset: i,
                    text: "x".into(),
                    marks: vec![],
                };
                doc = step.apply(doc).unwrap();
            }
            black_box(doc);
        })
    });
}

criterion_group!(
    benches,
    bench_insert_text,
    bench_parse_json,
    bench_validate,
    bench_apply_1000_inserts,
);
criterion_main!(benches);
