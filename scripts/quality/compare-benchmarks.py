#!/usr/bin/env python3
"""Compare Criterion mean time estimates from shared baseline storage."""
import json
import os
from pathlib import Path

root = Path(os.environ.get('CARGO_TARGET_DIR', 'target')) / 'criterion'
rows = []
for current in sorted(root.glob('**/pr/estimates.json')):
    baseline = current.parent.parent / 'main/estimates.json'
    if not baseline.exists():
        raise SystemExit(f'Missing baseline for {current.parent.parent.relative_to(root)}')
    before = json.loads(baseline.read_text())['mean']['point_estimate']
    after = json.loads(current.read_text())['mean']['point_estimate']
    if before <= 0 or after <= 0:
        raise SystemExit('Criterion produced an invalid mean time')
    change = (after / before - 1) * 100
    rows.append((str(current.parent.parent.relative_to(root)), before, after, change))
if not rows:
    raise SystemExit('No paired Criterion estimates found')
lines = ['## Criterion benchmark comparison', '',
         'Mean time in nanoseconds; positive change is slower. Single-run comparisons are diagnostic, not a statistical proof.', '',
         '| Benchmark | Base ns | PR ns | Change |', '|---|---:|---:|---:|']
for name, before, after, change in rows:
    lines.append(f'| {name.replace("|", "&#124;")} | {before:.1f} | {after:.1f} | {change:+.1f}% |')
    if change > 10:
        print(f'::warning::Benchmark {name}: mean time increased {change:.1f}%')
report = '\n'.join(lines) + '\n'
output = Path('output/benchmark-comparison.md')
output.parent.mkdir(exist_ok=True)
output.write_text(report)
if summary := os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(summary, 'a') as stream:
        stream.write(report)
print(report)
