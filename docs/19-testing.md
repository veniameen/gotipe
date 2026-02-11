# GoTipe — Стратегия тестирования

> Многоуровневое тестирование: Rust (unit + property + benchmarks) → WASM (integration) → TypeScript (unit + E2E) → Go (unit + integration + testcontainers). Каждый уровень ловит свои классы багов.

---

## Обзор

```
┌──────────────────────────────────────────────────────────────────┐
│                     TESTING PYRAMID                                │
│                                                                    │
│                        ┌──────────┐                                │
│                        │   E2E    │  Playwright (Browser)          │
│                        │  ~50     │  Full editor UX                │
│                       ─┤ tests   ├─                               │
│                      / └──────────┘ \                              │
│                     /                 \                             │
│                    ┌──────────────────┐                             │
│                    │   Integration    │  WASM + Go testcontainers  │
│                    │   ~200 tests     │  API + WebSocket + DB      │
│                   ─┤                 ├─                            │
│                  / └──────────────────┘ \                           │
│                 /                         \                          │
│                ┌──────────────────────────┐                         │
│                │       Unit Tests          │  Rust + TS + Go       │
│                │       ~2000 tests         │  Core logic, pure fn  │
│                └──────────────────────────┘                         │
│                                                                    │
│                ┌──────────────────────────┐                         │
│                │    Property-Based Tests   │  Rust proptest        │
│                │    ~100 generators        │  Fuzzing, convergence │
│                └──────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Rust Tests

### Unit Tests (`cargo test`)

Каждый crate содержит `#[cfg(test)]` модули рядом с реализацией.

```rust
// crates/gotipe-core/src/transform.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_text_at_beginning() {
        let mut doc = test_doc_paragraph("Hello");
        let step = Step::InsertText {
            block_id: BlockId("b1".into()),
            offset: 0,
            text: "Say ".into(),
            marks: vec![],
        };
        let result = step.apply(doc).unwrap();
        assert_eq!(result.blocks[0].text_content(), "Say Hello");
    }

    #[test]
    fn split_block_creates_two_blocks() {
        let mut doc = test_doc_paragraph("Hello World");
        let step = Step::SplitBlock {
            block_id: BlockId("b1".into()),
            offset: 5,
        };
        let result = step.apply(doc).unwrap();
        assert_eq!(result.blocks.len(), 2);
        assert_eq!(result.blocks[0].text_content(), "Hello");
        assert_eq!(result.blocks[1].text_content(), " World");
    }

    #[test]
    fn delete_block_preserves_siblings() {
        let doc = test_doc_three_paragraphs(); // p1, p2, p3
        let step = Step::DeleteBlock { block_id: BlockId("p2".into()) };
        let result = step.apply(doc).unwrap();
        assert_eq!(result.blocks.len(), 2);
        assert_eq!(result.blocks[0].id.0, "p1");
        assert_eq!(result.blocks[1].id.0, "p3");
    }
}
```

**Паттерны:**
- Test helpers (`test_doc_paragraph`, `test_doc_three_paragraphs`) — в `crates/gotipe-core/src/test_utils.rs`
- Naming convention: `fn <action>_<expected_result>`
- Каждый `Step` variant имеет минимум 3 теста: happy path, edge case, error case

### Property-Based Tests (proptest)

Для CRDT и transforms — fuzzing через генерацию случайных документов и операций:

```rust
// crates/gotipe-crdt/tests/convergence.rs

use proptest::prelude::*;

/// Генератор случайных CRDT-операций
fn arb_crdt_operation() -> impl Strategy<Value = CrdtOperation> {
    prop_oneof![
        arb_insert_text(),
        arb_delete_text(),
        arb_insert_block(),
        arb_delete_block(),
        arb_move_block(),
        arb_set_attrs(),
    ]
}

proptest! {
    /// Два peer'а, применяющие операции в разном порядке,
    /// ДОЛЖНЫ прийти к одному и тому же документу (convergence)
    #[test]
    fn crdt_convergence(
        ops_a in prop::collection::vec(arb_crdt_operation(), 1..50),
        ops_b in prop::collection::vec(arb_crdt_operation(), 1..50),
    ) {
        let mut doc_a = CrdtDocument::new("peer_a", Document::empty());
        let mut doc_b = CrdtDocument::new("peer_b", Document::empty());

        // Peer A applies ops_a locally
        for op in &ops_a {
            doc_a.apply_local(op).ok();
        }
        // Peer B applies ops_b locally
        for op in &ops_b {
            doc_b.apply_local(op).ok();
        }

        // Exchange updates
        let update_a = doc_a.encode_update();
        let update_b = doc_b.encode_update();
        doc_a.apply_remote(&update_b).ok();
        doc_b.apply_remote(&update_a).ok();

        // Both peers MUST converge to identical document
        assert_eq!(
            doc_a.to_document().to_json(),
            doc_b.to_document().to_json(),
            "CRDT convergence violated"
        );
    }

    /// Roundtrip: Document → JSON → Document MUST be identity
    #[test]
    fn json_roundtrip(doc in arb_document(1..100)) {
        let json = doc.to_json();
        let parsed = Document::from_json(&json, &test_schema()).unwrap();
        assert_eq!(doc, parsed);
    }

    /// Schema validation: random mutations MUST NOT bypass schema
    #[test]
    fn schema_validation_soundness(
        doc in arb_valid_document(),
        mutation in arb_invalid_mutation(),
    ) {
        let schema = DefaultSchema::new();
        let result = mutation.apply(doc);
        // Если мутация применилась, результат должен быть valid
        if let Ok(new_doc) = result {
            prop_assert!(schema.validate(&new_doc).is_ok());
        }
    }
}
```

**Запуск:**
```bash
# Property tests отмечены #[ignore] для скорости CI
cargo test --all -- --ignored           # Все property tests
PROPTEST_CASES=10000 cargo test crdt    # Больше итераций для CRDT
```

### Benchmarks (criterion)

```rust
// crates/gotipe-core/benches/transforms.rs

use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};

fn bench_parse_document(c: &mut Criterion) {
    let mut group = c.benchmark_group("parse");

    for size in [100, 1_000, 10_000] {
        let json = generate_document_json(size);
        group.bench_with_input(
            BenchmarkId::from_parameter(size),
            &json,
            |b, json| {
                b.iter(|| Document::from_json(json, &test_schema()).unwrap());
            },
        );
    }
    group.finish();
}

fn bench_insert_text(c: &mut Criterion) {
    let doc = generate_document(10_000);
    c.bench_function("insert_text_10k_blocks", |b| {
        b.iter(|| {
            let mut d = doc.clone();
            let step = Step::InsertText {
                block_id: BlockId("b5000".into()),
                offset: 10,
                text: "inserted".into(),
                marks: vec![],
            };
            step.apply(d).unwrap()
        });
    });
}

fn bench_crdt_merge(c: &mut Criterion) {
    let mut group = c.benchmark_group("crdt_merge");

    for ops in [100, 1_000, 10_000] {
        let (update_a, update_b) = generate_concurrent_updates(ops);
        group.bench_with_input(
            BenchmarkId::from_parameter(ops),
            &(update_a, update_b),
            |b, (ua, ub)| {
                b.iter(|| {
                    let mut doc = CrdtDocument::new("bench", Document::empty());
                    doc.apply_remote(ua).unwrap();
                    doc.apply_remote(ub).unwrap();
                });
            },
        );
    }
    group.finish();
}

criterion_group!(benches, bench_parse_document, bench_insert_text, bench_crdt_merge);
criterion_main!(benches);
```

**Запуск и CI:**
```bash
cargo bench                             # Полный benchmark suite
cargo bench -p gotipe-core              # Только core crate
cargo bench --no-run                    # Компиляция (CI — проверяет что собирается)
```

**Performance Budget (CI fail если превышен):**

| Операция | Budget | Критерий провала |
|----------|--------|-----------------|
| Parse 10K blocks | <30ms | >50ms |
| 1000 sequential inserts | <25ms | >40ms |
| Schema validation 10K blocks | <10ms | >20ms |
| CRDT merge 1000 ops | <100ms | >150ms |
| HTML export 10K blocks | <25ms | >50ms |

---

## TypeScript Tests

### Unit Tests (Vitest)

```typescript
// packages/core/src/__tests__/editor.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor, DefaultPreset } from '@gotipe/core';

describe('createEditor', () => {
    let editor: GoTipeEditor;

    beforeEach(() => {
        editor = createEditor({
            extensions: DefaultPreset,
            content: { version: 1, blocks: [] },
        });
    });

    it('creates empty document with default schema', () => {
        expect(editor.getJSON().blocks).toHaveLength(0);
    });

    it('inserts paragraph via command', () => {
        editor.commands.insertBlock('paragraph');
        expect(editor.getJSON().blocks).toHaveLength(1);
        expect(editor.getJSON().blocks[0].type).toBe('paragraph');
    });

    it('toggles bold mark', () => {
        editor.commands.insertBlock('paragraph');
        editor.commands.insertText('Hello World');
        editor.commands.setTextSelection(0, 5);
        editor.commands.toggleBold();

        const spans = editor.getJSON().blocks[0].content;
        expect(spans[0].marks).toContainEqual({ type: 'bold' });
        expect(spans[0].text).toBe('Hello');
    });

    it('exports HTML', () => {
        editor.commands.insertBlock('heading', { level: 1 });
        editor.commands.insertText('Title');
        expect(editor.getHTML()).toBe('<h1>Title</h1>');
    });

    it('exports Markdown', () => {
        editor.commands.insertBlock('heading', { level: 2 });
        editor.commands.insertText('Subtitle');
        expect(editor.getMarkdown()).toBe('## Subtitle\n');
    });
});
```

### Extension Tests

```typescript
// packages/core/src/__tests__/extensions/heading.test.ts

describe('Heading extension', () => {
    it('converts paragraph to heading via input rule', () => {
        const editor = createEditor({
            extensions: [Paragraph, Heading.configure({ levels: [1, 2, 3] })],
        });
        editor.commands.insertBlock('paragraph');
        editor.commands.insertText('# '); // Input rule trigger

        expect(editor.getJSON().blocks[0].type).toBe('heading');
        expect(editor.getJSON().blocks[0].attrs.level).toBe(1);
    });

    it('rejects level 4 when configured for [1,2,3]', () => {
        const editor = createEditor({
            extensions: [Heading.configure({ levels: [1, 2, 3] })],
        });
        expect(() => {
            editor.commands.insertBlock('heading', { level: 4 });
        }).toThrow(/invalid attribute/i);
    });
});
```

### Framework Adapter Tests

```typescript
// packages/react/src/__tests__/useEditor.test.tsx

import { renderHook, act } from '@testing-library/react-hooks';
import { useEditor } from '@gotipe/react';

describe('useEditor hook', () => {
    it('returns editor instance', () => {
        const { result } = renderHook(() => useEditor({
            extensions: DefaultPreset,
        }));
        expect(result.current.editor).toBeDefined();
        expect(result.current.editor.getJSON()).toBeDefined();
    });

    it('triggers re-render on document change', () => {
        const { result } = renderHook(() => useEditor({
            extensions: DefaultPreset,
        }));
        let renderCount = 0;
        const { result: stateResult } = renderHook(() => {
            renderCount++;
            return result.current.editor?.getJSON();
        });

        act(() => {
            result.current.editor.commands.insertBlock('paragraph');
        });

        expect(renderCount).toBeGreaterThan(1);
    });

    it('cleans up on unmount', () => {
        const { result, unmount } = renderHook(() => useEditor({
            extensions: DefaultPreset,
        }));
        const destroySpy = vi.spyOn(result.current.editor, 'destroy');
        unmount();
        expect(destroySpy).toHaveBeenCalled();
    });
});
```

---

## Go Tests

### Unit Tests

```go
// apps/cloud/internal/auth/apikey_test.go

func TestHashAPIKey(t *testing.T) {
    key := "gt_live_sk_7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c"
    hash := HashAPIKey(key)

    // Deterministic
    assert.Equal(t, hash, HashAPIKey(key))

    // Different key → different hash
    assert.NotEqual(t, hash, HashAPIKey(key+"x"))
}

func TestValidateAPIKeyFormat(t *testing.T) {
    tests := []struct {
        name  string
        key   string
        valid bool
    }{
        {"valid live key", "gt_live_sk_7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c", true},
        {"valid test key", "gt_test_sk_7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c", true},
        {"missing prefix", "sk_7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c", false},
        {"too short", "gt_live_sk_abc", false},
        {"empty", "", false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            assert.Equal(t, tt.valid, ValidateAPIKeyFormat(tt.key))
        })
    }
}
```

### Integration Tests (testcontainers)

Настоящие PostgreSQL и Valkey в Docker контейнерах, поднимаемых для тестов:

```go
// apps/cloud/internal/storage/postgres_test.go

package storage_test

import (
    "context"
    "testing"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
    "github.com/testcontainers/testcontainers-go"
    "github.com/testcontainers/testcontainers-go/modules/postgres"
    "github.com/testcontainers/testcontainers-go/wait"
)

func setupTestDB(t *testing.T) (*sql.DB, func()) {
    ctx := context.Background()

    pgContainer, err := postgres.Run(ctx,
        "postgres:17-alpine",
        postgres.WithDatabase("gotipe_test"),
        postgres.WithUsername("test"),
        postgres.WithPassword("test"),
        testcontainers.WithWaitStrategy(
            wait.ForLog("database system is ready to accept connections").
                WithOccurrence(2),
        ),
    )
    require.NoError(t, err)

    connStr, _ := pgContainer.ConnectionString(ctx, "sslmode=disable")
    db, err := sql.Open("postgres", connStr)
    require.NoError(t, err)

    // Run migrations
    runMigrations(db)

    cleanup := func() {
        db.Close()
        pgContainer.Terminate(ctx)
    }

    return db, cleanup
}

func TestCreateDocument(t *testing.T) {
    db, cleanup := setupTestDB(t)
    defer cleanup()

    store := storage.NewPostgresStore(db)

    // Create user first
    user, err := store.CreateUser(context.Background(), "test@example.com", "Test User")
    require.NoError(t, err)

    // Create document
    doc, err := store.CreateDocument(context.Background(), storage.CreateDocumentParams{
        ID:     "doc_test1",
        UserID: user.ID,
        Title:  "Test Document",
    })
    require.NoError(t, err)
    assert.Equal(t, "doc_test1", doc.ID)
    assert.Equal(t, int64(1), doc.Version)

    // Get document
    fetched, err := store.GetDocument(context.Background(), "doc_test1")
    require.NoError(t, err)
    assert.Equal(t, "Test Document", fetched.Title)
}

func TestDocumentNotFound(t *testing.T) {
    db, cleanup := setupTestDB(t)
    defer cleanup()

    store := storage.NewPostgresStore(db)

    _, err := store.GetDocument(context.Background(), "nonexistent")
    assert.ErrorIs(t, err, storage.ErrNotFound)
}

func TestPlanDocumentLimit(t *testing.T) {
    db, cleanup := setupTestDB(t)
    defer cleanup()

    store := storage.NewPostgresStore(db)

    user, _ := store.CreateUser(context.Background(), "test@example.com", "Test User")
    // Set user plan to "starter" (limit: 1000 docs)

    // Create documents up to limit — should succeed
    for i := 0; i < 5; i++ {
        _, err := store.CreateDocument(context.Background(), storage.CreateDocumentParams{
            ID:     fmt.Sprintf("doc_%d", i),
            UserID: user.ID,
            Title:  "Doc",
        })
        require.NoError(t, err)
    }
}
```

### API Handler Tests

```go
// apps/cloud/internal/handler/documents_test.go

func TestCreateDocumentHandler(t *testing.T) {
    db, cleanup := setupTestDB(t)
    defer cleanup()

    handler := handler.CreateDocument(db, mockR2())

    body := `{"id":"doc_test","title":"Test","content":{"version":1,"blocks":[]}}`
    req := httptest.NewRequest("POST", "/api/v1/documents", strings.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(middleware.WithUser(req.Context(), "user_1", "pro", []string{"documents"}))

    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)

    assert.Equal(t, http.StatusCreated, rec.Code)

    var resp handler.DocumentResponse
    json.Unmarshal(rec.Body.Bytes(), &resp)
    assert.Equal(t, "doc_test", resp.ID)
    assert.Contains(t, resp.SyncURL, "wss://")
}

func TestCreateDocumentUnauthorized(t *testing.T) {
    handler := handler.CreateDocument(nil, nil)

    req := httptest.NewRequest("POST", "/api/v1/documents", nil)
    // No auth context

    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)

    assert.Equal(t, http.StatusUnauthorized, rec.Code)
}
```

---

## E2E Tests (Playwright)

### Настройка

```typescript
// apps/playground/playwright.config.ts

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,

    use: {
        baseURL: 'http://localhost:5173',
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],

    webServer: {
        command: 'pnpm --filter @gotipe/playground dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
    },
});
```

### Тесты

```typescript
// apps/playground/tests/e2e/editor.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Editor basic operations', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('[data-gotipe-editor]');
    });

    test('types text in editor', async ({ page }) => {
        await page.click('[data-gotipe-editor]');
        await page.keyboard.type('Hello GoTipe');
        await expect(page.locator('[data-gotipe-editor]')).toContainText('Hello GoTipe');
    });

    test('creates heading via slash command', async ({ page }) => {
        await page.click('[data-gotipe-editor]');
        await page.keyboard.type('/heading');
        await page.waitForSelector('[data-gotipe-slash-menu]');
        await page.keyboard.press('Enter');
        await page.keyboard.type('My Heading');
        await expect(page.locator('h1')).toContainText('My Heading');
    });

    test('toggles bold with Cmd+B', async ({ page }) => {
        await page.click('[data-gotipe-editor]');
        await page.keyboard.type('Hello World');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await page.keyboard.press('Meta+b');
        await expect(page.locator('strong')).toContainText('Hello World');
    });

    test('undo/redo with Cmd+Z', async ({ page }) => {
        await page.click('[data-gotipe-editor]');
        await page.keyboard.type('First');
        await page.keyboard.press('Meta+z');
        await expect(page.locator('[data-gotipe-editor]')).not.toContainText('First');
        await page.keyboard.press('Meta+Shift+z');
        await expect(page.locator('[data-gotipe-editor]')).toContainText('First');
    });
});

test.describe('Drag and drop', () => {
    test('reorders blocks via drag handle', async ({ page }) => {
        await page.goto('/');
        // ... create two paragraphs, drag first after second
    });
});

test.describe('Collaboration', () => {
    test('two users see each other cursors', async ({ browser }) => {
        const context1 = await browser.newContext();
        const context2 = await browser.newContext();
        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        await page1.goto('/?doc=collab-test');
        await page2.goto('/?doc=collab-test');

        // User 1 types
        await page1.click('[data-gotipe-editor]');
        await page1.keyboard.type('From User 1');

        // User 2 should see the text
        await expect(page2.locator('[data-gotipe-editor]')).toContainText('From User 1', {
            timeout: 5000,
        });

        await context1.close();
        await context2.close();
    });
});
```

---

## CI Pipeline

### Полный CI workflow

```yaml
# .github/workflows/ci.yml (дополнение)

jobs:
  # ... rust, wasm, typescript, go jobs (см. 11-monorepo.md) ...

  coverage:
    needs: [rust, typescript, go]
    runs-on: ubuntu-latest
    steps:
      - name: Download Rust coverage
        uses: actions/download-artifact@v4
        with:
          name: rust-coverage
      - name: Download TS coverage
        uses: actions/download-artifact@v4
        with:
          name: ts-coverage
      - name: Download Go coverage
        uses: actions/download-artifact@v4
        with:
          name: go-coverage
      - name: Check coverage thresholds
        run: |
          # Rust: >80% line coverage
          RUST_COV=$(cat rust-coverage/percent.txt)
          if (( $(echo "$RUST_COV < 80" | bc -l) )); then
            echo "FAIL: Rust coverage $RUST_COV% < 80%"
            exit 1
          fi
          # TypeScript: >75% line coverage
          TS_COV=$(cat ts-coverage/percent.txt)
          if (( $(echo "$TS_COV < 75" | bc -l) )); then
            echo "FAIL: TS coverage $TS_COV% < 75%"
            exit 1
          fi
          echo "Coverage OK: Rust=$RUST_COV%, TS=$TS_COV%"
```

### Coverage Targets

| Layer | Target | Minimum (CI fail) |
|-------|:------:|:-----------------:|
| Rust crates (gotipe-core) | 90% | 80% |
| Rust crates (gotipe-crdt) | 85% | 80% |
| Rust crates (gotipe-export) | 80% | 70% |
| TypeScript (@gotipe/core) | 85% | 75% |
| TypeScript (framework adapters) | 75% | 60% |
| Go (cloud API) | 80% | 70% |
| Go (sync server) | 75% | 65% |
| E2E (Playwright) | N/A | Все тесты проходят |

---

## Тестирование специфичных компонентов

### CRDT Convergence

Свойство: N peers, применяющих операции в произвольном порядке, ДОЛЖНЫ сходиться к одному документу.

```
Peer A: [op1, op2, op3]
Peer B: [op4, op5]
Peer C: [op6]

After full sync:
  doc_A == doc_B == doc_C  ← MUST be true
```

Тестируется через:
1. **Unit tests** — фиксированные сценарии (concurrent insert, concurrent delete, move+edit)
2. **Property tests** — proptest с random операциями (10K+ итераций)
3. **Simulation tests** — N peers, random network delays, random operation batches

### Schema Validation Soundness

Свойство: невалидный документ НИКОГДА не может быть создан через API.

```
For any sequence of valid transactions T1, T2, ..., Tn:
  schema.validate(apply(T1, T2, ..., Tn)) == Ok
```

### Export Roundtrip

Свойство: Document → Export → Import → Document = identity (для lossless форматов).

| Формат | Roundtrip fidelity | Потери |
|--------|:------------------:|--------|
| JSON | 100% | Нет |
| HTML | 95%+ | Некоторые block-level attrs |
| Markdown | 90%+ | Inline styles, complex tables |
| PDF | N/A | One-way export |
| DOCX | N/A | One-way export |

---

## Локальная разработка

```bash
# Запуск всех тестов
pnpm test                                  # TS tests (vitest)
cargo test --all                           # Rust tests
cd apps/cloud && go test ./...             # Go tests

# Watch mode (разработка)
pnpm --filter @gotipe/core test -- --watch
cargo watch -x "test -p gotipe-core"       # cargo-watch

# Конкретный тест
cargo test -p gotipe-crdt convergence      # По имени
pnpm --filter @gotipe/core test -- -t "toggles bold"

# E2E
pnpm --filter @gotipe/playground test:e2e
pnpm --filter @gotipe/playground test:e2e -- --headed  # С визуализацией

# Coverage
cargo tarpaulin --all --out html           # Rust coverage → tarpaulin-report.html
pnpm --filter @gotipe/core test -- --coverage
cd apps/cloud && go test ./... -coverprofile=cover.out && go tool cover -html=cover.out
```

---

## Связанные документы

- [01-architecture.md](01-architecture.md) — Rust crate structure, performance targets
- [02-collaboration.md](02-collaboration.md) — CRDT engine, sync protocol (convergence requirements)
- [03-editor-core.md](03-editor-core.md) — Schema, transforms, commands (unit test targets)
- [10-cloud.md](10-cloud.md) — Go API server, handler patterns
- [11-monorepo.md](11-monorepo.md) — CI/CD pipeline, test commands
