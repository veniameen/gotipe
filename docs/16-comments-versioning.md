# GoTipe — Comments, Version History & Permissions

## Обзор

GoTipe предоставляет встроенную систему комментариев, историю версий и гранулярную модель прав доступа. Все три подсистемы интегрированы с CRDT-ядром — комментарии и suggestions синхронизируются в real-time, версии строятся на CRDT state vectors, а permissions проверяются и на клиенте (WASM), и на сервере (Go/Rust).

```
┌─────────────────────────────────────────────────────────────────┐
│                   Comments & Versioning Stack                    │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Comments     │  │  Version     │  │  Permissions          │  │
│  │  Extension    │  │  History     │  │  (RBAC)               │  │
│  │              │  │  Extension   │  │                       │  │
│  │ Inline marks │  │  Snapshots   │  │  Viewer / Commenter   │  │
│  │ Threads      │  │  Diff view   │  │  Editor / Admin       │  │
│  │ Suggestions  │  │  Restore     │  │                       │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │
│         │                 │                      │              │
│         ▼                 ▼                      ▼              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              gotipe-crdt (Rust/WASM Core)                 │   │
│  │  CommentMark · SuggestionMark · StateVector · RBAC Check  │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                 │                      │              │
│         ▼                 ▼                      ▼              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              GoTipe Cloud (Go backend)                    │   │
│  │  Comment API · Version Storage (R2) · Permission API      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

Зависимости: система комментариев и versioning используют CRDT engine из [02-collaboration.md](02-collaboration.md), extension API из [05-extensions.md](05-extensions.md), Cloud инфраструктуру из [10-cloud.md](10-cloud.md).

---

## 1. Система комментариев — обзор

GoTipe поддерживает три типа комментариев:

| Тип | Описание | Хранение |
|-----|----------|----------|
| **Inline comment** | Привязан к диапазону текста через `CommentMark` | CRDT mark на text spans |
| **Block comment** | Привязан к конкретному блоку (image, table, code block) | CRDT block attribute |
| **Document comment** | Не привязан к контенту, относится к документу в целом | Отдельный CRDT map |

Все комментарии поддерживают threads (ответы), reactions, и resolution (пометка "resolved").

### Жизненный цикл комментария

```
   Created ──► Active ──► Resolved ──► Deleted
                 │             │
                 │             ▼
                 │         Reopened ──► Active
                 │
                 ▼
             Deleted
```

---

## 2. Comment Architecture

### Модель данных (Rust)

```rust
// crates/gotipe-comments/src/comment.rs

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use gotipe_crdt::PeerId;

/// Уникальный идентификатор комментария
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CommentId(pub String);

/// Тип привязки комментария к контенту
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommentAnchor {
    /// Inline: привязан к диапазону текста в блоке
    Inline {
        block_id: BlockId,
        /// CRDT-позиции (стабильны при concurrent edits)
        from: CrdtPosition,
        to: CrdtPosition,
    },
    /// Block: привязан к целому блоку
    Block {
        block_id: BlockId,
    },
    /// Document: не привязан к контенту
    Document,
}

/// Комментарий
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: CommentId,
    pub anchor: CommentAnchor,
    pub author: PeerId,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<PeerId>,
    pub parent_id: Option<CommentId>, // None = root comment, Some = reply
    pub reactions: Vec<Reaction>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Реакция на комментарий (emoji)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub emoji: String,
    pub user: PeerId,
    pub created_at: DateTime<Utc>,
}

/// Thread — корневой комментарий + все replies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentThread {
    pub root: Comment,
    pub replies: Vec<Comment>,
    pub is_resolved: bool,
}
```

### CommentMark — inline mark для комментариев

Inline комментарии реализованы как mark (см. [05-extensions.md](05-extensions.md)). `CommentMark` — это mark, который сохраняет `comment_id` в attributes и рендерится как highlight поверх текста.

```rust
// crates/gotipe-comments/src/mark.rs

use gotipe_core::extension::{Extension, MarkSpec};

pub struct CommentMarkExtension;

impl Extension for CommentMarkExtension {
    fn name(&self) -> &str { "commentMark" }

    fn marks(&self) -> Vec<MarkSpec> {
        vec![MarkSpec {
            name: "comment".to_string(),
            attrs: vec![
                AttrSpec {
                    name: "commentId".to_string(),
                    attr_type: AttrType::String,
                    required: true,
                },
                AttrSpec {
                    name: "resolved".to_string(),
                    attr_type: AttrType::Bool,
                    default: Some(AttrValue::Bool(false)),
                    required: false,
                },
            ],
            // CommentMark может сосуществовать с bold, italic и другими marks
            excludes: "".to_string(),
            // Несколько комментариев могут перекрываться на одном тексте
            spanning: true,
            inclusive: false,
        }]
    }
}
```

### Интеграция с CRDT

Комментарии хранятся в отдельном CRDT map внутри `CrdtDocument`. Это позволяет:

1. **Concurrent comments** — два пользователя могут одновременно создать комментарии на один и тот же текст без конфликтов.
2. **Стабильные anchor** — позиции `from`/`to` используют CRDT-позиции (не числовые offsets), что позволяет комментарию сохранять привязку к тексту даже при concurrent edits.
3. **Независимый sync** — комментарии синхронизируются вместе с документом, но могут быть resolved/deleted без изменения текста.

```rust
// Внутри CrdtDocument
pub struct CrdtDocument {
    // ... (tree, texts, attrs, version, history)

    /// Comments — CRDT map для хранения комментариев
    comments: CrdtMap<CommentId, Comment>,

    /// Suggestion marks — отдельный CRDT map
    suggestions: CrdtMap<SuggestionId, Suggestion>,
}
```

### Real-time sync комментариев

```
Client A: addComment()                    Client B: видит новый комментарий
    │                                          ▲
    ▼                                          │
  CRDT: insert into comments map            CRDT: merge remote ops
    │                                          ▲
    ▼                                          │
  CommentMark: add mark to text range       CommentMark: mark applied
    │                                          ▲
    ▼                                          │
  Sync: send CrdtOp::Comment + CrdtOp::Text ──┘
```

---

## 3. Comment API (TypeScript)

### @gotipe/comments

```typescript
// packages/comments/src/index.ts

import { Editor } from '@gotipe/core';

export interface CommentOptions {
  /** Контент комментария (plain text или rich text) */
  content: string;
  /** Метаданные (произвольные key-value) */
  metadata?: Record<string, unknown>;
}

export interface CommentPlugin {
  /**
   * Добавить inline комментарий к текущему selection.
   * Создаёт CommentMark на выделенном тексте.
   */
  addComment(options: CommentOptions): Comment;

  /**
   * Добавить block-level комментарий к указанному блоку.
   */
  addBlockComment(blockId: string, options: CommentOptions): Comment;

  /**
   * Добавить document-level комментарий (не привязан к контенту).
   */
  addDocumentComment(options: CommentOptions): Comment;

  /**
   * Ответить на существующий комментарий (thread reply).
   */
  replyToComment(commentId: string, options: CommentOptions): Comment;

  /**
   * Пометить комментарий как resolved.
   */
  resolveComment(commentId: string): void;

  /**
   * Повторно открыть resolved комментарий.
   */
  reopenComment(commentId: string): void;

  /**
   * Удалить комментарий. Если это root — удаляет весь thread.
   */
  deleteComment(commentId: string): void;

  /**
   * Получить все комментарии (фильтр опционален).
   */
  getComments(filter?: CommentFilter): CommentThread[];

  /**
   * Получить комментарии для конкретного блока.
   */
  getBlockComments(blockId: string): CommentThread[];

  /**
   * Добавить reaction (emoji) к комментарию.
   */
  addReaction(commentId: string, emoji: string): void;

  /**
   * Убрать свою reaction.
   */
  removeReaction(commentId: string, emoji: string): void;
}

export interface CommentFilter {
  resolved?: boolean;
  authorId?: string;
  blockId?: string;
  since?: Date;
}
```

### Использование

```typescript
import { GoTipeEditor } from '@gotipe/react';
import { CommentsExtension } from '@gotipe/comments';

const editor = new GoTipeEditor({
  extensions: [
    CommentsExtension.configure({
      // Callback для получения данных пользователя
      getUser: (peerId) => ({
        name: 'Alice',
        avatar: '/avatars/alice.png',
      }),
      // Разрешить resolved комментариям оставаться видимыми
      showResolved: true,
    }),
  ],
});

// Создать inline комментарий на текущем selection
const comment = editor.comments.addComment({
  content: 'Нужно переформулировать этот абзац',
});

// Ответить на комментарий
editor.comments.replyToComment(comment.id, {
  content: 'Согласен, исправлю',
});

// Resolve
editor.comments.resolveComment(comment.id);
```

### Events

```typescript
// Подписка на события комментариев
editor.on('commentAdded', (comment: Comment) => {
  console.log(`New comment by ${comment.author}: ${comment.content}`);
  // Показать notification, обновить sidebar
});

editor.on('commentResolved', (comment: Comment) => {
  console.log(`Comment ${comment.id} resolved by ${comment.resolvedBy}`);
});

editor.on('commentDeleted', (commentId: string) => {
  console.log(`Comment ${commentId} deleted`);
});

editor.on('commentUpdated', (comment: Comment) => {
  // Thread reply, reaction, или edit
});
```

---

## 4. Comment UI Components

### React Components

GoTipe предоставляет headless UI-компоненты для комментариев. Стилизация через CSS — компоненты не навязывают визуальный стиль.

```typescript
// packages/react/src/comments/CommentBubble.tsx

import { useComments, useCurrentComment } from '@gotipe/react';

/**
 * CommentBubble — всплывающий bubble рядом с выделенным комментарием.
 * Появляется при клике на highlighted текст с CommentMark.
 */
export function CommentBubble() {
  const { activeComment, position } = useCurrentComment();

  if (!activeComment) return null;

  return (
    <div
      className="gotipe-comment-bubble"
      style={{ top: position.top, left: position.left }}
    >
      <CommentThread thread={activeComment} />
    </div>
  );
}

/**
 * CommentSidebar — боковая панель со списком всех комментариев.
 * Поддерживает фильтрацию, скролл к комментарию в документе.
 */
export function CommentSidebar() {
  const { threads, filter, setFilter } = useComments();

  return (
    <aside className="gotipe-comment-sidebar">
      <div className="gotipe-comment-filters">
        <button onClick={() => setFilter({ resolved: false })}>
          Open ({threads.filter(t => !t.isResolved).length})
        </button>
        <button onClick={() => setFilter({ resolved: true })}>
          Resolved ({threads.filter(t => t.isResolved).length})
        </button>
      </div>
      {threads.map((thread) => (
        <CommentThreadCard
          key={thread.root.id}
          thread={thread}
          onScrollTo={() => editor.comments.scrollToComment(thread.root.id)}
        />
      ))}
    </aside>
  );
}

/**
 * CommentThread — отображение одного thread (root + replies).
 */
export function CommentThread({ thread }: { thread: CommentThread }) {
  const { replyToComment, resolveComment, deleteComment } = useComments();
  const [replyText, setReplyText] = useState('');

  return (
    <div className="gotipe-comment-thread">
      <CommentCard comment={thread.root} />
      {thread.replies.map((reply) => (
        <CommentCard key={reply.id} comment={reply} isReply />
      ))}
      <CommentInput
        value={replyText}
        onChange={setReplyText}
        onSubmit={() => {
          replyToComment(thread.root.id, { content: replyText });
          setReplyText('');
        }}
        placeholder="Reply..."
      />
      <div className="gotipe-comment-actions">
        <button onClick={() => resolveComment(thread.root.id)}>
          Resolve
        </button>
      </div>
    </div>
  );
}
```

### Highlighting commented text

Текст с `CommentMark` визуально выделяется:

```css
/* Активный (unresolved) комментарий */
.gotipe-comment-highlight {
  background-color: rgba(255, 212, 0, 0.3);
  border-bottom: 2px solid #ffd400;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

/* Hover — усиленный highlight */
.gotipe-comment-highlight:hover {
  background-color: rgba(255, 212, 0, 0.5);
}

/* Resolved комментарий — subtle highlight */
.gotipe-comment-highlight--resolved {
  background-color: rgba(0, 0, 0, 0.04);
  border-bottom: 1px dashed #ccc;
}

/* Перекрывающиеся комментарии — более глубокий цвет */
.gotipe-comment-highlight[data-comment-depth="2"] {
  background-color: rgba(255, 180, 0, 0.35);
}
```

---

## 5. Suggestions / Track Changes

Suggestions (предложенные изменения) — режим редактирования, при котором правки не применяются сразу, а отображаются как diff, который можно принять или отклонить. Аналог Track Changes в Google Docs / Word.

### Типы suggestions

| Тип | Описание | Mark |
|-----|----------|------|
| **Insert** | Добавленный текст | `SuggestionMark { type: "insert" }` |
| **Delete** | Удалённый текст (strikethrough) | `SuggestionMark { type: "delete" }` |
| **Replace** | Замена текста (delete + insert) | Два mark: delete на старый, insert на новый |
| **Format** | Изменение форматирования (bold, italic) | `SuggestionMark { type: "format", oldMarks, newMarks }` |
| **Block change** | Изменение типа блока (paragraph -> heading) | Block attribute suggestion |

### Модель данных

```rust
// crates/gotipe-suggestions/src/suggestion.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestionId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SuggestionType {
    Insert,
    Delete,
    Replace,
    Format {
        old_marks: Vec<Mark>,
        new_marks: Vec<Mark>,
    },
    BlockChange {
        old_block_type: String,
        new_block_type: String,
        old_attrs: HashMap<String, AttrValue>,
        new_attrs: HashMap<String, AttrValue>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suggestion {
    pub id: SuggestionId,
    pub suggestion_type: SuggestionType,
    pub author: PeerId,
    pub created_at: DateTime<Utc>,
    pub anchor: SuggestionAnchor,
    /// Связанный comment thread (опционально)
    pub comment_thread: Option<CommentId>,
    pub status: SuggestionStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SuggestionStatus {
    Pending,
    Accepted { by: PeerId, at: DateTime<Utc> },
    Rejected { by: PeerId, at: DateTime<Utc> },
}
```

### SuggestionMark

```rust
// crates/gotipe-suggestions/src/mark.rs

impl Extension for SuggestionMarkExtension {
    fn name(&self) -> &str { "suggestionMark" }

    fn marks(&self) -> Vec<MarkSpec> {
        vec![MarkSpec {
            name: "suggestion".to_string(),
            attrs: vec![
                AttrSpec::required("suggestionId", AttrType::String),
                AttrSpec::required("type", AttrType::String), // "insert" | "delete" | "format"
                AttrSpec::optional("authorId", AttrType::String),
            ],
            excludes: "".to_string(),
            spanning: true,
            inclusive: false,
        }]
    }
}
```

### Suggestion API (TypeScript)

```typescript
// packages/suggestions/src/index.ts

export interface SuggestionsPlugin {
  /**
   * Включить/выключить режим suggestions.
   * В этом режиме все правки создают suggestions вместо прямых изменений.
   */
  setSuggestionMode(enabled: boolean): void;

  /**
   * Принять suggestion — применить изменение к документу.
   */
  acceptSuggestion(suggestionId: string): void;

  /**
   * Отклонить suggestion — убрать предложенное изменение.
   */
  rejectSuggestion(suggestionId: string): void;

  /**
   * Принять все pending suggestions.
   */
  acceptAllSuggestions(): void;

  /**
   * Отклонить все pending suggestions.
   */
  rejectAllSuggestions(): void;

  /**
   * Получить все suggestions с фильтрами.
   */
  getSuggestions(filter?: SuggestionFilter): Suggestion[];
}

// Пример использования
editor.suggestions.setSuggestionMode(true);

// Теперь любое редактирование создаёт suggestion
editor.commands.insertText('Hello world');
// → создан Suggestion { type: "insert", text: "Hello world" }

// Editor / Admin может принять или отклонить
editor.suggestions.acceptSuggestion('sug_abc123');
```

### Diff rendering

```css
/* Inserted text (suggestion) */
.gotipe-suggestion-insert {
  color: #1a7f37;
  background-color: rgba(26, 127, 55, 0.1);
  text-decoration: underline;
  text-decoration-color: #1a7f37;
}

/* Deleted text (suggestion) — strikethrough */
.gotipe-suggestion-delete {
  color: #cf222e;
  background-color: rgba(207, 34, 46, 0.1);
  text-decoration: line-through;
  text-decoration-color: #cf222e;
}

/* Format change indicator */
.gotipe-suggestion-format {
  border-bottom: 2px dotted #8250df;
}
```

---

## 6. Version History — обзор

GoTipe автоматически сохраняет историю всех изменений документа. Пользователи могут:

- Просматривать timeline всех изменений
- Создавать именованные версии (named snapshots)
- Сравнивать любые две версии (diff view)
- Восстанавливать документ к предыдущей версии
- Видеть, кто и когда внёс конкретные изменения

### Типы versions

| Тип | Описание | Создание |
|-----|----------|----------|
| **Auto-save** | Автоматический snapshot каждые N минут | Timer / idle detection |
| **Named version** | Именованная версия, созданная пользователем | Вручную через API |
| **Milestone** | Специальная версия (publish, review complete) | Workflow events |
| **Restore point** | Создаётся перед restore из старой версии | Автоматически |

```
Timeline:
  ──●────────●────────●────────●────────●────►
   v1       auto     v2      auto      v3
  "Draft"  (5min)  "Review" (5min)   "Final"
                      ▲
                      │
              Named version
```

---

## 7. Version History Architecture

### CRDT State Vectors как основа версий

Каждая версия документа — это CRDT state vector (точка в пространстве операций). Это позволяет:

1. **Инкрементальное хранение** — сохраняются только diff между версиями, не полные копии документа.
2. **Мгновенное сравнение** — diff между двумя версиями вычисляется через разницу state vectors.
3. **Точное attribution** — каждый символ привязан к автору и timestamp через CRDT metadata.

```rust
// crates/gotipe-versioning/src/version.rs

use gotipe_crdt::{StateVector, CrdtDocument};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionId(pub String);

/// Snapshot версии документа
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Version {
    pub id: VersionId,
    pub document_id: String,
    pub name: Option<String>,          // None для auto-save
    pub version_type: VersionType,
    pub state_vector: StateVector,     // CRDT позиция
    pub created_by: PeerId,
    pub created_at: DateTime<Utc>,
    pub description: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
    /// Размер инкрементального snapshot в байтах
    pub snapshot_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionType {
    AutoSave,
    Named,
    Milestone { milestone_type: String },
    RestorePoint { restored_from: VersionId },
}

/// Инкрементальный snapshot — разница между двумя state vectors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncrementalSnapshot {
    /// Base state vector (от какой версии diff)
    pub base_state_vector: StateVector,
    /// CRDT operations между base и этой версией
    pub ops: Vec<CrdtOp>,
    /// Сжатый бинарный формат
    pub compressed_data: Vec<u8>,
}
```

### Хранение snapshots

```
┌────────────────────────────────────────────────────────────────┐
│                    Version Storage Architecture                 │
│                                                                │
│  ┌──────────────────────┐    ┌──────────────────────────────┐ │
│  │     PostgreSQL        │    │    Cloudflare R2              │ │
│  │                      │    │    (S3-compatible)             │ │
│  │  ┌────────────────┐  │    │                              │ │
│  │  │ versions       │  │    │  ┌────────────────────────┐  │ │
│  │  │  id            │  │    │  │ Incremental Snapshots  │  │ │
│  │  │  document_id   │──┼────┼─►│                        │  │ │
│  │  │  name          │  │    │  │ doc_abc/v1.snapshot    │  │ │
│  │  │  version_type  │  │    │  │ doc_abc/v1-v2.delta    │  │ │
│  │  │  state_vector  │  │    │  │ doc_abc/v2-v3.delta    │  │ │
│  │  │  created_by    │  │    │  │ doc_abc/v3.snapshot    │  │ │
│  │  │  created_at    │  │    │  │                        │  │ │
│  │  │  r2_key        │  │    │  │ (zstd compressed)      │  │ │
│  │  │  snapshot_size │  │    │  └────────────────────────┘  │ │
│  │  └────────────────┘  │    │                              │ │
│  │                      │    │  Полный snapshot: каждые     │ │
│  │  ┌────────────────┐  │    │  50 версий (для быстрого     │ │
│  │  │ version_diffs  │  │    │  восстановления)             │ │
│  │  │  from_version  │  │    │                              │ │
│  │  │  to_version    │  │    └──────────────────────────────┘ │
│  │  │  diff_summary  │  │                                     │
│  │  └────────────────┘  │                                     │
│  └──────────────────────┘                                     │
└────────────────────────────────────────────────────────────────┘
```

**Стратегия хранения:**

- **Full snapshot** сохраняется каждые 50 инкрементальных версий (anchor point).
- **Incremental delta** — CRDT ops между двумя соседними версиями, сжатые zstd.
- **Восстановление**: найти ближайший full snapshot + применить цепочку deltas.
- **Retention policy**: auto-save версии старше 30 дней удаляются, named версии хранятся бессрочно.

### SQL Schema

```sql
-- Version metadata (PostgreSQL)
CREATE TABLE versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id),
    name            TEXT,
    version_type    TEXT NOT NULL DEFAULT 'auto_save',
    state_vector    BYTEA NOT NULL,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    description     TEXT,
    r2_key          TEXT NOT NULL,
    snapshot_size   BIGINT NOT NULL,
    is_full         BOOLEAN NOT NULL DEFAULT false,
    base_version_id UUID REFERENCES versions(id),
    metadata        JSONB DEFAULT '{}'
);

CREATE INDEX idx_versions_document ON versions(document_id, created_at DESC);
CREATE INDEX idx_versions_type ON versions(document_id, version_type);

-- Precomputed diffs для быстрого сравнения
CREATE TABLE version_diffs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_version_id UUID NOT NULL REFERENCES versions(id),
    to_version_id   UUID NOT NULL REFERENCES versions(id),
    diff_summary    JSONB NOT NULL, -- { added: 42, deleted: 15, modified_blocks: [...] }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(from_version_id, to_version_id)
);
```

---

## 8. Version History API (TypeScript)

```typescript
// packages/versioning/src/index.ts

export interface VersioningPlugin {
  /**
   * Создать named version (snapshot текущего состояния).
   */
  createVersion(options: CreateVersionOptions): Promise<Version>;

  /**
   * Получить список версий документа.
   */
  listVersions(options?: ListVersionsOptions): Promise<Version[]>;

  /**
   * Получить конкретную версию.
   */
  getVersion(versionId: string): Promise<VersionDetail>;

  /**
   * Восстановить документ к состоянию конкретной версии.
   * Создаёт restore point перед восстановлением.
   */
  restoreVersion(versionId: string): Promise<void>;

  /**
   * Сравнить две версии — получить diff.
   */
  compareVersions(
    fromVersionId: string,
    toVersionId: string
  ): Promise<VersionDiff>;

  /**
   * Настроить auto-save интервал.
   */
  setAutoSaveInterval(intervalMs: number): void;
}

export interface CreateVersionOptions {
  name: string;
  description?: string;
  type?: 'named' | 'milestone';
  metadata?: Record<string, unknown>;
}

export interface ListVersionsOptions {
  type?: VersionType[];
  limit?: number;
  offset?: number;
  since?: Date;
  until?: Date;
}

export interface VersionDiff {
  from: Version;
  to: Version;
  summary: {
    addedChars: number;
    deletedChars: number;
    modifiedBlocks: string[];
    authors: string[];
  };
  /** Structured diff для rendering */
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'insert' | 'delete' | 'modify';
  blockId: string;
  /** Для текстовых блоков — char-level diff */
  textDiff?: TextDiffSegment[];
  /** Для block-level изменений */
  oldBlock?: Block;
  newBlock?: Block;
}
```

### Пример использования

```typescript
import { VersioningExtension } from '@gotipe/versioning';

const editor = new GoTipeEditor({
  extensions: [
    VersioningExtension.configure({
      autoSaveIntervalMs: 5 * 60 * 1000, // auto-save каждые 5 минут
      maxAutoSaveVersions: 100,           // максимум 100 auto-save версий
      fullSnapshotEvery: 50,              // full snapshot каждые 50 версий
    }),
  ],
});

// Создать named version
await editor.versioning.createVersion({
  name: 'v1.0 — Draft',
  description: 'Первый черновик',
});

// Список версий
const versions = await editor.versioning.listVersions({
  type: ['named', 'milestone'],
  limit: 20,
});

// Сравнить две версии
const diff = await editor.versioning.compareVersions(
  versions[0].id,
  versions[1].id,
);
console.log(`Changes: +${diff.summary.addedChars} -${diff.summary.deletedChars}`);

// Восстановить
await editor.versioning.restoreVersion(versions[0].id);
```

### Events

```typescript
editor.on('versionCreated', (version: Version) => {
  console.log(`Version "${version.name}" created`);
});

editor.on('versionRestored', (version: Version) => {
  console.log(`Document restored to version "${version.name}"`);
});

editor.on('autoSaveCompleted', (version: Version) => {
  // UI: показать timestamp последнего auto-save
});
```

---

## 9. Version History UI

### React Components

```typescript
// packages/react/src/versioning/VersionTimeline.tsx

/**
 * VersionTimeline — вертикальный timeline всех версий документа.
 * Группирует auto-save версии, выделяет named versions.
 */
export function VersionTimeline() {
  const { versions, selectedVersion, selectVersion } = useVersioning();

  return (
    <div className="gotipe-version-timeline">
      {versions.map((version, i) => (
        <div
          key={version.id}
          className={cn('gotipe-version-entry', {
            'gotipe-version-entry--named': version.type === 'named',
            'gotipe-version-entry--selected': version.id === selectedVersion?.id,
            'gotipe-version-entry--milestone': version.type === 'milestone',
          })}
          onClick={() => selectVersion(version)}
        >
          <div className="gotipe-version-dot" />
          <div className="gotipe-version-info">
            <span className="gotipe-version-name">
              {version.name || formatDate(version.createdAt)}
            </span>
            <span className="gotipe-version-author">
              {version.createdBy.name}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * DiffView — визуализация различий между двумя версиями.
 * Поддерживает inline diff и side-by-side режимы.
 */
export function DiffView({ diff }: { diff: VersionDiff }) {
  const [mode, setMode] = useState<'inline' | 'side-by-side'>('inline');

  return (
    <div className="gotipe-diff-view">
      <div className="gotipe-diff-header">
        <DiffSummary summary={diff.summary} />
        <DiffModeToggle mode={mode} onChange={setMode} />
      </div>
      <div className="gotipe-diff-content">
        {diff.changes.map((change) => (
          <DiffBlock
            key={change.blockId}
            change={change}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * VersionRestoreDialog — confirmation dialog перед restore.
 */
export function VersionRestoreDialog({
  version,
  onConfirm,
  onCancel,
}: {
  version: Version;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onClose={onCancel}>
      <DialogTitle>Restore version?</DialogTitle>
      <DialogContent>
        <p>
          Document will be restored to <strong>{version.name}</strong>
          {' '}from {formatDate(version.createdAt)}.
        </p>
        <p className="gotipe-dialog-warning">
          A restore point will be created automatically before restoring.
          You can undo this action.
        </p>
      </DialogContent>
      <DialogActions>
        <button onClick={onCancel}>Cancel</button>
        <button onClick={onConfirm} className="gotipe-btn-primary">
          Restore
        </button>
      </DialogActions>
    </Dialog>
  );
}
```

### Branch visualization (для advanced use cases)

Когда несколько пользователей создают named versions одновременно, timeline может разветвляться:

```
    v1 ─── auto ─── v2 ─── auto ─── v3 (main)
                     │
                     └── auto ─── v2.1 (Alice's branch)

    Визуализация как git-graph: линейный timeline
    с merge points для concurrent versions.
```

---

## 10. Модель прав доступа (Permissions)

GoTipe использует RBAC (Role-Based Access Control) с четырьмя базовыми ролями:

| Роль | Чтение | Комментарии | Suggestions | Редактирование | Управление |
|------|--------|-------------|-------------|----------------|------------|
| **Viewer** | Да | Нет | Нет | Нет | Нет |
| **Commenter** | Да | Да | Нет | Нет | Нет |
| **Suggester** | Да | Да | Да | Нет | Нет |
| **Editor** | Да | Да | Да | Да | Нет |
| **Admin** | Да | Да | Да | Да | Да |

### Действия по ролям

```
Viewer:
  ✓ Просмотр документа
  ✓ Просмотр комментариев
  ✓ Просмотр истории версий
  ✗ Всё остальное

Commenter:
  + Создание комментариев
  + Ответы на комментарии
  + Reactions на комментарии
  + Resolve своих комментариев

Suggester:
  + Создание suggestions (track changes)
  + Комментарии к suggestions
  ✗ Accept/reject suggestions (только Editor/Admin)

Editor:
  + Редактирование документа
  + Accept/reject suggestions
  + Resolve любых комментариев
  + Создание named versions
  + Restore версий

Admin:
  + Управление permissions (invite, change role, remove)
  + Удаление комментариев других пользователей
  + Удаление версий
  + Настройка документа (public/private, retention policy)
  + Transfer ownership
```

---

## 11. Permission Architecture

### Модель данных

```rust
// crates/gotipe-permissions/src/lib.rs

/// Роли доступа
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Role {
    Viewer = 0,
    Commenter = 1,
    Suggester = 2,
    Editor = 3,
    Admin = 4,
}

/// Действия, требующие проверки прав
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Action {
    // Document
    ViewDocument,
    EditDocument,
    DeleteDocument,
    // Comments
    AddComment,
    ResolveComment,
    DeleteComment,
    DeleteOthersComment,
    // Suggestions
    CreateSuggestion,
    AcceptSuggestion,
    RejectSuggestion,
    // Versions
    ViewVersionHistory,
    CreateVersion,
    RestoreVersion,
    DeleteVersion,
    // Permissions
    ManagePermissions,
    TransferOwnership,
}

/// Проверка: может ли роль выполнить действие
pub fn can_perform(role: Role, action: Action) -> bool {
    match action {
        Action::ViewDocument | Action::ViewVersionHistory => {
            role >= Role::Viewer
        }
        Action::AddComment | Action::ResolveComment | Action::DeleteComment => {
            role >= Role::Commenter
        }
        Action::CreateSuggestion => {
            role >= Role::Suggester
        }
        Action::EditDocument | Action::AcceptSuggestion
        | Action::RejectSuggestion | Action::CreateVersion
        | Action::RestoreVersion => {
            role >= Role::Editor
        }
        Action::DeleteOthersComment | Action::DeleteVersion
        | Action::ManagePermissions | Action::DeleteDocument => {
            role >= Role::Admin
        }
        Action::TransferOwnership => {
            role == Role::Admin // Только owner/admin
        }
    }
}
```

### Иерархия permissions

```
┌──────────────────────────────────────────────────────┐
│                 Permission Hierarchy                  │
│                                                      │
│  ┌─────────────────────────────────────────┐        │
│  │        Organization Defaults            │        │
│  │  "Все сотрудники = Editor по умолчанию" │        │
│  └────────────────┬────────────────────────┘        │
│                   │ inherits                         │
│                   ▼                                  │
│  ┌─────────────────────────────────────────┐        │
│  │       Workspace / Folder Level          │        │
│  │  "Team A folder = Commenter для Team B" │        │
│  └────────────────┬────────────────────────┘        │
│                   │ inherits (can override)           │
│                   ▼                                  │
│  ┌─────────────────────────────────────────┐        │
│  │        Document Level                   │        │
│  │  "Alice = Admin, Bob = Viewer"          │        │
│  └────────────────┬────────────────────────┘        │
│                   │ most specific wins                │
│                   ▼                                  │
│  ┌─────────────────────────────────────────┐        │
│  │        Effective Permission             │        │
│  │  (computed = max of all sources)        │        │
│  └─────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────┘
```

**Правила наследования:**
1. Document-level permission всегда приоритетнее.
2. Если document-level не задан — берётся workspace/folder level.
3. Если workspace не задан — берётся organization default.
4. Если ничего не задано — доступ отклонён (deny by default).

### Проверки прав: dual enforcement

Permissions проверяются в двух местах:

1. **Клиент (WASM core)** — мгновенная проверка, UI адаптируется (скрываются кнопки, блокируется ввод).
2. **Сервер (Go API / Rust middleware)** — авторитетная проверка, отклоняет unauthorized operations.

```rust
// Клиентская проверка (WASM)
impl EditorState {
    pub fn can_edit(&self) -> bool {
        can_perform(self.current_role, Action::EditDocument)
    }

    pub fn can_comment(&self) -> bool {
        can_perform(self.current_role, Action::AddComment)
    }

    /// Применяется перед каждым Step
    pub fn apply_step(&mut self, step: Step) -> Result<(), EditorError> {
        // Permission check
        let required_action = step.required_action();
        if !can_perform(self.current_role, required_action) {
            return Err(EditorError::InsufficientPermissions {
                role: self.current_role,
                action: required_action,
            });
        }
        // ... apply step
        Ok(())
    }
}
```

```go
// Серверная проверка (Go Cloud API)
// cloud/internal/middleware/permissions.go

func RequirePermission(action string) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID := c.GetString("user_id")
        docID := c.Param("document_id")

        role, err := permissionService.GetEffectiveRole(c, userID, docID)
        if err != nil {
            c.AbortWithStatusJSON(403, gin.H{"error": "access denied"})
            return
        }

        if !canPerform(role, action) {
            c.AbortWithStatusJSON(403, gin.H{
                "error":  "insufficient permissions",
                "role":   role,
                "action": action,
            })
            return
        }

        c.Set("role", role)
        c.Next()
    }
}
```

### SQL Schema для permissions

```sql
-- Document permissions
CREATE TABLE document_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id     UUID REFERENCES teams(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('viewer','commenter','suggester','editor','admin')),
    granted_by  UUID NOT NULL REFERENCES users(id),
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(document_id, user_id),
    UNIQUE(document_id, team_id),
    CHECK (user_id IS NOT NULL OR team_id IS NOT NULL)
);

-- Organization defaults
CREATE TABLE organization_defaults (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    default_role    TEXT NOT NULL DEFAULT 'viewer',
    UNIQUE(organization_id)
);

-- Permission audit log (см. 14-security-privacy.md)
CREATE TABLE permission_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    actor_id    UUID NOT NULL,
    action      TEXT NOT NULL,
    target_user UUID,
    old_role    TEXT,
    new_role    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 12. Permission API (TypeScript)

```typescript
// packages/permissions/src/index.ts

export interface PermissionsPlugin {
  /**
   * Установить permission для пользователя на документ.
   */
  setPermission(options: SetPermissionOptions): Promise<void>;

  /**
   * Получить все permissions для документа.
   */
  getPermissions(documentId: string): Promise<DocumentPermissions>;

  /**
   * Проверить permission (client-side, мгновенно).
   */
  checkPermission(action: Action): boolean;

  /**
   * Получить effective role текущего пользователя.
   */
  getCurrentRole(): Role;

  /**
   * Удалить permission (revoke access).
   */
  revokePermission(documentId: string, userId: string): Promise<void>;

  /**
   * Получить public link settings.
   */
  getPublicAccess(documentId: string): Promise<PublicAccessSettings>;

  /**
   * Установить public access (anyone with link).
   */
  setPublicAccess(
    documentId: string,
    settings: PublicAccessSettings
  ): Promise<void>;
}

export interface SetPermissionOptions {
  documentId: string;
  userId?: string;
  teamId?: string;
  email?: string; // Invite по email (создаёт pending invite)
  role: Role;
}

export interface DocumentPermissions {
  owner: UserPermission;
  permissions: UserPermission[];
  publicAccess: PublicAccessSettings | null;
}

export interface UserPermission {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: Role;
  grantedAt: Date;
  grantedBy: string;
}

export interface PublicAccessSettings {
  enabled: boolean;
  role: 'viewer' | 'commenter'; // Public access ограничен viewer/commenter
  expiresAt?: Date;
}
```

### Пример использования

```typescript
// Проверить права перед показом UI
if (editor.permissions.checkPermission('editDocument')) {
  showToolbar();
}

if (editor.permissions.checkPermission('addComment')) {
  showCommentButton();
}

// Установить permission
await editor.permissions.setPermission({
  documentId: 'doc_123',
  email: 'bob@example.com',
  role: 'editor',
});

// Public link (anyone with link = viewer)
await editor.permissions.setPublicAccess('doc_123', {
  enabled: true,
  role: 'viewer',
});
```

### Events

```typescript
editor.on('permissionChanged', (event: PermissionChangedEvent) => {
  console.log(`${event.userId} role changed to ${event.newRole}`);

  // Обновить UI: скрыть/показать элементы управления
  if (event.userId === currentUserId) {
    updateEditorUI(event.newRole);
  }
});

editor.on('accessRevoked', (event: AccessRevokedEvent) => {
  // Если текущий пользователь потерял доступ
  if (event.userId === currentUserId) {
    showAccessDeniedScreen();
  }
});
```

---

## 13. Интеграция с Collaboration

### Комментарии в multi-user среде

Комментарии — CRDT-aware. При concurrent операциях:

| Сценарий | Поведение |
|----------|-----------|
| Два пользователя комментируют один текст | Оба CommentMark сосуществуют (overlapping highlights) |
| Пользователь A resolve, пользователь B reply | Reply сохраняется, resolved status обновляется через LWW |
| Текст под комментарием удалён | CommentMark удаляется, комментарий переходит в "orphaned" состояние |
| Пользователь A редактирует текст в диапазоне комментария | CommentMark автоматически расширяется/сужается через CRDT positions |

### Suggestions в multi-user среде

```
Сценарий: Alice и Bob оба в suggestion mode

Alice (Suggester):
  Вводит "Hello" → Suggestion { type: insert, text: "Hello", author: Alice }

Bob (Suggester):
  Удаляет "World" → Suggestion { type: delete, text: "World", author: Bob }

Charlie (Editor):
  Видит оба suggestions, может accept/reject каждый независимо.

CRDT гарантирует: suggestions от разных авторов не конфликтуют,
даже если затрагивают перекрывающиеся диапазоны текста.
```

### Конфликты и resolution

```rust
// Стратегии разрешения конфликтов для comments/suggestions

/// Comment conflicts: LWW (Last Writer Wins) для mutable полей
/// - resolved_at, resolved_by: LWW по timestamp
/// - content (edit): LWW по timestamp
/// - reactions: add-wins set (добавления никогда не теряются)

/// Suggestion conflicts:
/// - Два overlapping insert suggestions: оба сохраняются,
///   editor решает порядок accept
/// - Accept + concurrent edit в том же диапазоне:
///   CRDT merge корректно обрабатывает (insert по CRDT-позиции)
/// - Reject + concurrent edit: rejected text остаётся удалённым,
///   concurrent edit применяется к оставшемуся тексту

impl CrdtDocument {
    /// Merge remote comment operations
    pub fn merge_comment_ops(&mut self, ops: &[CrdtOp]) -> Result<(), CrdtError> {
        for op in ops {
            match op {
                CrdtOp::CommentAdd(comment) => {
                    self.comments.insert(comment.id.clone(), comment.clone());
                }
                CrdtOp::CommentUpdate { id, field, value, timestamp } => {
                    if let Some(comment) = self.comments.get_mut(id) {
                        // LWW: apply only if timestamp is newer
                        comment.lww_update(field, value, *timestamp);
                    }
                }
                CrdtOp::CommentDelete(id) => {
                    self.comments.remove(id);
                }
                _ => {}
            }
        }
        Ok(())
    }
}
```

### Presence + Comments

Когда пользователь просматривает комментарий, его присутствие отображается:

```typescript
// Presence integration
editor.on('commentViewed', (event) => {
  // Broadcast через presence channel
  editor.collaboration.broadcastPresence({
    type: 'viewing_comment',
    commentId: event.commentId,
    userId: currentUserId,
  });
});

// Другие пользователи видят, кто просматривает комментарий
editor.on('presenceUpdated', (peers) => {
  const viewingComment = peers.filter(
    p => p.state?.type === 'viewing_comment'
  );
  // Показать аватары рядом с комментарием
});
```

---

## 14. Сравнение с конкурентами

### Comments

| Feature | GoTipe | Tiptap | Google Docs | Notion |
|---------|--------|--------|-------------|--------|
| Inline comments | Да (CRDT mark) | Да (Yjs + extension) | Да | Да |
| Block comments | Да | Нет (custom) | Нет | Да (block discussion) |
| Document comments | Да | Нет | Нет | Нет |
| Comment threads | Да | Да (Pro) | Да | Да |
| Comment reactions | Да | Нет | Да | Да |
| Offline comments | Да (CRDT) | Частично | Нет | Нет |
| Real-time sync | Да | Да (Cloud required) | Да | Да |
| Overlapping comments | Да | Ограничено | Да | Нет |
| Comment API | Open-source | Pro tier ($) | Нет | Нет |
| Self-hosted | Да | Enterprise ($$$) | Нет | Нет |

### Suggestions / Track Changes

| Feature | GoTipe | Tiptap | Google Docs | Notion |
|---------|--------|--------|-------------|--------|
| Suggestion mode | Да | Pro tier ($) | Да | Нет |
| Insert suggestions | Да | Да (Pro) | Да | Нет |
| Delete suggestions | Да | Да (Pro) | Да | Нет |
| Format suggestions | Да | Нет | Да | Нет |
| Block change suggestions | Да | Нет | Частично | Нет |
| Accept/reject individual | Да | Да (Pro) | Да | N/A |
| Accept/reject all | Да | Нет | Да | N/A |
| Suggestion threads | Да | Нет | Да | N/A |
| CRDT-based diff | Да | Yjs-based | OT-based | N/A |

### Version History

| Feature | GoTipe | Tiptap | Google Docs | Notion |
|---------|--------|--------|-------------|--------|
| Auto-save versions | Да | Нет (manual) | Да | Да |
| Named versions | Да | Нет | Нет | Нет |
| Diff view | Да (char-level) | Нет | Да (limited) | Нет |
| Side-by-side diff | Да | Нет | Нет | Нет |
| Restore version | Да | Нет (manual) | Да | Да (paid) |
| Version branches | Да (basic) | Нет | Нет | Нет |
| Incremental storage | Да (CRDT deltas) | N/A | Да | Да |
| Retention policy | Configurable | N/A | 30 days (free) | 30 days (free) |
| Self-hosted storage | Да (Cloudflare R2) | N/A | Нет | Нет |
| API access | Да | Нет | Limited (Docs API) | Нет |

### Permissions

| Feature | GoTipe | Tiptap | Google Docs | Notion |
|---------|--------|--------|-------------|--------|
| Viewer role | Да | Нет (DIY) | Да | Да |
| Commenter role | Да | Нет (DIY) | Да | Да |
| Suggester role | Да | Нет | Нет | Нет |
| Editor role | Да | Нет (DIY) | Да | Да |
| Admin role | Да | Нет (DIY) | Да (Owner) | Да |
| Permission API | Да | Нет | Да (Drive API) | Да |
| Organization defaults | Да | Нет | Да (Workspace) | Да |
| Public links | Да | Нет | Да | Да |
| Expiring links | Да | Нет | Нет | Нет |
| Client-side enforcement | Да (WASM) | Нет | Нет (server only) | Нет |
| Permission audit log | Да | Нет | Да (Admin) | Да (Enterprise) |
| Self-hosted RBAC | Да | Нет | Нет | Нет |

### Итоги сравнения

**GoTipe vs Tiptap:** Tiptap предлагает comments и suggestions только в Pro/Enterprise тарифах. GoTipe предоставляет всё open-source с MIT лицензией. CRDT-based versioning и встроенный RBAC — уникальные преимущества GoTipe.

**GoTipe vs Google Docs:** Google Docs имеет зрелую систему comments и suggestions, но полностью cloud-зависима, не self-hosted, и не имеет открытого API для customization. GoTipe предлагает comparable functionality с offline support и self-hosted deployment.

**GoTipe vs Notion:** Notion не поддерживает suggestion mode и имеет базовую историю версий (только paid plan). GoTipe значительно превосходит Notion по функциональности comments/versioning/permissions.

---

## Конфигурация и настройка

### Полная конфигурация для production

```typescript
import { GoTipeEditor } from '@gotipe/react';
import { CommentsExtension } from '@gotipe/comments';
import { SuggestionsExtension } from '@gotipe/suggestions';
import { VersioningExtension } from '@gotipe/versioning';
import { PermissionsExtension } from '@gotipe/permissions';
import { CollaborationExtension } from '@gotipe/collaboration';

const editor = new GoTipeEditor({
  extensions: [
    CollaborationExtension.configure({
      document: 'doc_abc123',
      endpoint: 'wss://sync.gotipe.cloud',
      token: authToken,
    }),

    CommentsExtension.configure({
      getUser: async (peerId) => fetchUser(peerId),
      showResolved: false,
      allowReactions: true,
      maxThreadDepth: 10,
    }),

    SuggestionsExtension.configure({
      // Автоматически включить suggestion mode для Suggesters
      autoEnableForRole: 'suggester',
      showAuthorColors: true,
    }),

    VersioningExtension.configure({
      autoSaveIntervalMs: 5 * 60 * 1000,
      maxAutoSaveVersions: 200,
      fullSnapshotEvery: 50,
      retentionDays: {
        autoSave: 30,
        named: Infinity,
        milestone: Infinity,
      },
      storage: {
        type: 's3',
        bucket: 'gotipe-versions',
        region: 'eu-central-1',
      },
    }),

    PermissionsExtension.configure({
      // Получить permissions с сервера при инициализации
      fetchPermissions: async (docId) => {
        const res = await fetch(`/api/documents/${docId}/permissions`);
        return res.json();
      },
      // Callback при изменении роли — обновить UI
      onRoleChanged: (newRole) => {
        updateUIForRole(newRole);
      },
      defaultPublicRole: 'viewer',
    }),
  ],
});
```

### Self-hosted конфигурация

```yaml
# docker-compose.yml — comments, versioning, permissions
services:
  gotipe-sync:
    image: gotipe/sync-server:latest
    environment:
      DATABASE_URL: postgres://gotipe:password@postgres:5432/gotipe
      R2_ACCOUNT_ID: ${R2_ACCOUNT_ID}
      R2_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID}
      R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY}
      R2_BUCKET: gotipe-versions
      VERSION_AUTO_SAVE_INTERVAL: 300  # seconds
      VERSION_FULL_SNAPSHOT_EVERY: 50
      VERSION_RETENTION_DAYS: 30
      PERMISSIONS_DEFAULT_ROLE: viewer

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: gotipe
      POSTGRES_USER: gotipe
      POSTGRES_PASSWORD: password
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

---

## Связанные документы

| Документ | Связь |
|----------|-------|
| [02-collaboration.md](02-collaboration.md) | CRDT engine, real-time sync, presence — фундамент для comments и versioning |
| [03-editor-core.md](03-editor-core.md) | Document model, marks, steps — используются CommentMark и SuggestionMark |
| [05-extensions.md](05-extensions.md) | Extension API — comments, suggestions, versioning реализованы как extensions |
| [09-sdk-and-api.md](09-sdk-and-api.md) | TypeScript API — типы Comment, Version, Permission |
| [10-cloud.md](10-cloud.md) | Cloud infrastructure — Cloudflare R2 storage, PostgreSQL, WebSocket sync |
| [14-security-privacy.md](14-security-privacy.md) | Security model — audit logs, encryption, permission enforcement |
