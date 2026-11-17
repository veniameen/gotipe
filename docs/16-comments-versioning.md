# GoTipe — Comments, Version History & Permissions

> **Historical specification, not a guide to the current API.** The examples, timelines,
> performance comparisons, commercial terms and promises below do not confirm an
> implementation or the availability of the service. Current references: [contracts](development/editor-contracts.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and the manifest
> of each package, not by this document.

## Overview

GoTipe provides a built-in comment system, version history and a granular access permission model. All three subsystems are integrated with the CRDT core: comments and suggestions sync in real time, versions are built on CRDT state vectors, and permissions are checked both on the client (WASM) and on the server (Go/Rust).

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

Dependencies: the comment and versioning systems use the CRDT engine from [02-collaboration.md](02-collaboration.md), the extension API from [05-extensions.md](05-extensions.md), and the Cloud infrastructure from [10-cloud.md](10-cloud.md).

---

## 1. Comment System — Overview

GoTipe supports three types of comments:

| Type | Description | Storage |
|------|-------------|---------|
| **Inline comment** | Attached to a text range via `CommentMark` | CRDT mark on text spans |
| **Block comment** | Attached to a specific block (image, table, code block) | CRDT block attribute |
| **Document comment** | Not attached to content, belongs to the document as a whole | Separate CRDT map |

All comments support threads (replies), reactions, and resolution (marking as "resolved").

### Comment Lifecycle

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

### Data Model (Rust)

```rust
// crates/gotipe-comments/src/comment.rs

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use gotipe_crdt::PeerId;

/// Unique comment identifier
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CommentId(pub String);

/// How a comment is anchored to content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommentAnchor {
    /// Inline: attached to a text range in a block
    Inline {
        block_id: BlockId,
        /// CRDT positions (stable under concurrent edits)
        from: CrdtPosition,
        to: CrdtPosition,
    },
    /// Block: attached to a whole block
    Block {
        block_id: BlockId,
    },
    /// Document: not attached to content
    Document,
}

/// Comment
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

/// Reaction to a comment (emoji)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub emoji: String,
    pub user: PeerId,
    pub created_at: DateTime<Utc>,
}

/// Thread: the root comment plus all replies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentThread {
    pub root: Comment,
    pub replies: Vec<Comment>,
    pub is_resolved: bool,
}
```

### CommentMark — Inline Mark for Comments

Inline comments are implemented as a mark (see [05-extensions.md](05-extensions.md)). `CommentMark` is a mark that stores `comment_id` in its attributes and renders as a highlight over the text.

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
            // CommentMark can coexist with bold, italic and other marks
            excludes: "".to_string(),
            // Several comments can overlap on the same text
            spanning: true,
            inclusive: false,
        }]
    }
}
```

### CRDT Integration

Comments are stored in a separate CRDT map inside `CrdtDocument`. This allows:

1. **Concurrent comments**: two users can create comments on the same text at the same time without conflicts.
2. **Stable anchors**: the `from`/`to` positions use CRDT positions (not numeric offsets), so a comment keeps its binding to the text even under concurrent edits.
3. **Independent sync**: comments sync together with the document, but can be resolved or deleted without changing the text.

```rust
// Inside CrdtDocument
pub struct CrdtDocument {
    // ... (tree, texts, attrs, version, history)

    /// Comments: CRDT map that stores comments
    comments: CrdtMap<CommentId, Comment>,

    /// Suggestion marks: a separate CRDT map
    suggestions: CrdtMap<SuggestionId, Suggestion>,
}
```

### Real-time Comment Sync

```
Client A: addComment()                    Client B: sees the new comment
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
  /** Comment content (plain text or rich text) */
  content: string;
  /** Metadata (arbitrary key-value) */
  metadata?: Record<string, unknown>;
}

export interface CommentPlugin {
  /**
   * Add an inline comment to the current selection.
   * Creates a CommentMark on the selected text.
   */
  addComment(options: CommentOptions): Comment;

  /**
   * Add a block-level comment to the given block.
   */
  addBlockComment(blockId: string, options: CommentOptions): Comment;

  /**
   * Add a document-level comment (not attached to content).
   */
  addDocumentComment(options: CommentOptions): Comment;

  /**
   * Reply to an existing comment (thread reply).
   */
  replyToComment(commentId: string, options: CommentOptions): Comment;

  /**
   * Mark a comment as resolved.
   */
  resolveComment(commentId: string): void;

  /**
   * Reopen a resolved comment.
   */
  reopenComment(commentId: string): void;

  /**
   * Delete a comment. If it is a root comment, the whole thread is deleted.
   */
  deleteComment(commentId: string): void;

  /**
   * Get all comments (the filter is optional).
   */
  getComments(filter?: CommentFilter): CommentThread[];

  /**
   * Get the comments for a specific block.
   */
  getBlockComments(blockId: string): CommentThread[];

  /**
   * Add a reaction (emoji) to a comment.
   */
  addReaction(commentId: string, emoji: string): void;

  /**
   * Remove your own reaction.
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

### Usage

```typescript
import { GoTipeEditor } from '@gotipe/react';
import { CommentsExtension } from '@gotipe/comments';

const editor = new GoTipeEditor({
  extensions: [
    CommentsExtension.configure({
      // Callback that returns user data
      getUser: (peerId) => ({
        name: 'Alice',
        avatar: '/avatars/alice.png',
      }),
      // Let resolved comments stay visible
      showResolved: true,
    }),
  ],
});

// Create an inline comment on the current selection
const comment = editor.comments.addComment({
  content: 'This paragraph needs rewording',
});

// Reply to the comment
editor.comments.replyToComment(comment.id, {
  content: 'Agreed, I will fix it',
});

// Resolve
editor.comments.resolveComment(comment.id);
```

### Events

```typescript
// Subscribe to comment events
editor.on('commentAdded', (comment: Comment) => {
  console.log(`New comment by ${comment.author}: ${comment.content}`);
  // Show a notification, update the sidebar
});

editor.on('commentResolved', (comment: Comment) => {
  console.log(`Comment ${comment.id} resolved by ${comment.resolvedBy}`);
});

editor.on('commentDeleted', (commentId: string) => {
  console.log(`Comment ${commentId} deleted`);
});

editor.on('commentUpdated', (comment: Comment) => {
  // Thread reply, reaction, or edit
});
```

---

## 4. Comment UI Components

### React Components

GoTipe provides headless UI components for comments. Styling is done through CSS; the components do not impose a visual style.

```typescript
// packages/react/src/comments/CommentBubble.tsx

import { useComments, useCurrentComment } from '@gotipe/react';

/**
 * CommentBubble: a popup bubble next to the highlighted comment.
 * Appears on click on highlighted text with a CommentMark.
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
 * CommentSidebar: a side panel listing all comments.
 * Supports filtering and scrolling to the comment in the document.
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
 * CommentThread: renders a single thread (root + replies).
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

### Highlighting Commented Text

Text with a `CommentMark` is visually highlighted:

```css
/* Active (unresolved) comment */
.gotipe-comment-highlight {
  background-color: rgba(255, 212, 0, 0.3);
  border-bottom: 2px solid #ffd400;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

/* Hover: stronger highlight */
.gotipe-comment-highlight:hover {
  background-color: rgba(255, 212, 0, 0.5);
}

/* Resolved comment: subtle highlight */
.gotipe-comment-highlight--resolved {
  background-color: rgba(0, 0, 0, 0.04);
  border-bottom: 1px dashed #ccc;
}

/* Overlapping comments: a deeper color */
.gotipe-comment-highlight[data-comment-depth="2"] {
  background-color: rgba(255, 180, 0, 0.35);
}
```

### Comments UX Flow (Google Docs-like)

The full user flow for creating and managing comments:

#### Creating a Comment

```
1. Select text → an "Add comment" button (💬) appears in the Bubble Menu
   ┌────────────────────────────────────────────────────────┐
   │ ✨ Improve │ Paragraph ▾ │ B I U S </> 🔗 │ A▾ │ 💬 │
   └────────────────────────────────────────────────────────┘
                                                       ↑
                                              "Add comment" button

2. Click → the text is highlighted and a comment input appears on the right:
   ┌───────────────────────────────────────────────────────────┐
   │ Document text with [highlighted comment range] here.      │
   │                                              ┌──────────┐│
   │                                              │ 💬 Alice ││
   │                                              │          ││
   │                                              │ [Type    ││
   │                                              │  comment]││
   │                                              │          ││
   │                                              │ [Cancel] ││
   │                                              │ [Submit] ││
   │                                              └──────────┘│
   └───────────────────────────────────────────────────────────┘
```

#### Comment Sidebar (right panel)

All comments are shown in a sidebar to the right of the document. Each comment is a bubble aligned in height with the text it is attached to.

```
┌─── Document ────────────────────────┬── Comment Sidebar ──────────┐
│                                     │                             │
│ Some text here.                     │                             │
│                                     │                             │
│ Text with [comment highlight] in    │ ┌─────────────────────────┐ │
│ this paragraph. More text follows.  │ │ Alice · 2 hours ago     │ │
│                                     │ │                         │ │
│                                     │ │ "comment highlight"     │ │
│                                     │ │ This needs rewording.   │ │
│                                     │ │                         │ │
│                                     │ │   Bob · 1 hour ago     │ │
│                                     │ │   Agreed, will fix.    │ │
│                                     │ │                         │ │
│                                     │ │ [Reply...]  [Resolve ✓]│ │
│                                     │ └─────────────────────────┘ │
│                                     │                             │
│ Another paragraph with [second      │ ┌─────────────────────────┐ │
│ comment] on different text.         │ │ Charlie · 30 min ago    │ │
│                                     │ │                         │ │
│                                     │ │ Great point here!       │ │
│                                     │ │                         │ │
│                                     │ │ [Reply...]  [Resolve ✓]│ │
│                                     │ └─────────────────────────┘ │
└─────────────────────────────────────┴─────────────────────────────┘
```

#### Comment Thread Popover

Clicking highlighted text opens a thread popover:

```
┌────────────────────────────────────┐
│ Alice · 2 hours ago                │
│                                    │
│ "original highlighted text"        │  ← quoted text (italic, border-left)
│                                    │
│ This needs rewording for clarity.  │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Bob · 1 hour ago               │ │  ← reply
│ │ Agreed, I'll update it.        │ │
│ └────────────────────────────────┘ │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ Reply...                     │   │  ← reply input
│ └──────────────────────────────┘   │
│                                    │
│ [Resolve ✓]                       │
└────────────────────────────────────┘
```

#### Comment Navigation

Navigation between comments (prev/next):

```
┌────────────────────────────────────┐
│ ◄  2 / 7 comments  ►              │  ← navigation bar
└────────────────────────────────────┘
```

| Element | Description |
|---------|-------------|
| Counter | `N / Total`: current / total active comments |
| Arrows `◄` `►` | Jump to the previous/next comment. The document scrolls to the comment position |
| Filter | Tabs: "Open" (N) / "Resolved" (N) |

#### Comment Visual Specifications

| Property | Value |
|----------|-------|
| Comment highlight | `rgba(255, 212, 0, 0.25)` background + `2px solid rgba(255, 212, 0, 0.5)` border-bottom |
| Comment highlight hover | `rgba(255, 212, 0, 0.4)` background |
| Resolved highlight | `rgba(0, 0, 0, 0.04)` background, `1px dashed --gt-border` border-bottom |
| Sidebar width | 280px, collapsible |
| Comment bubble | `--gt-bg`, `--gt-shadow-sm`, border-radius 12px, padding 12px |
| Author name | 13px, font-weight 600, `--gt-text` |
| Timestamp | 12px, `--gt-text-tertiary` |
| Quoted text | 13px, italic, `--gt-text-secondary`, 2px `--gt-border` border-left, padding-left 8px |
| Reply input | border-radius 8px, `--gt-bg-hover` background, placeholder "Reply..." |
| Resolve button | Ghost button, `--gt-success` color on hover |
| Thread connector | Vertical line 1px `--gt-border` connecting root to replies |

---

## 5. Suggestions / Track Changes

Suggestions (proposed changes) are an editing mode in which edits are not applied immediately but shown as a diff that can be accepted or rejected. It is the equivalent of Track Changes in Google Docs / Word.

### Suggestion Types

| Type | Description | Mark |
|-----|----------|------|
| **Insert** | Added text | `SuggestionMark { type: "insert" }` |
| **Delete** | Deleted text (strikethrough) | `SuggestionMark { type: "delete" }` |
| **Replace** | Text replacement (delete + insert) | Two marks: delete on the old text, insert on the new |
| **Format** | Formatting change (bold, italic) | `SuggestionMark { type: "format", oldMarks, newMarks }` |
| **Block change** | Block type change (paragraph -> heading) | Block attribute suggestion |

### Data Model

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
    /// Linked comment thread (optional)
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
   * Turn suggestion mode on or off.
   * In this mode all edits create suggestions instead of direct changes.
   */
  setSuggestionMode(enabled: boolean): void;

  /**
   * Accept a suggestion: apply the change to the document.
   */
  acceptSuggestion(suggestionId: string): void;

  /**
   * Reject a suggestion: remove the proposed change.
   */
  rejectSuggestion(suggestionId: string): void;

  /**
   * Accept all pending suggestions.
   */
  acceptAllSuggestions(): void;

  /**
   * Reject all pending suggestions.
   */
  rejectAllSuggestions(): void;

  /**
   * Get all suggestions, with filters.
   */
  getSuggestions(filter?: SuggestionFilter): Suggestion[];
}

// Usage example
editor.suggestions.setSuggestionMode(true);

// Now any edit creates a suggestion
editor.commands.insertText('Hello world');
// → creates Suggestion { type: "insert", text: "Hello world" }

// An Editor / Admin can accept or reject it
editor.suggestions.acceptSuggestion('sug_abc123');
```

### Diff Rendering

```css
/* Inserted text (suggestion) */
.gotipe-suggestion-insert {
  color: #1a7f37;
  background-color: rgba(26, 127, 55, 0.1);
  text-decoration: underline;
  text-decoration-color: #1a7f37;
}

/* Deleted text (suggestion): strikethrough */
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

## 6. Version History — Overview

GoTipe automatically saves the history of all document changes. Users can:

- Browse a timeline of all changes
- Create named versions (named snapshots)
- Compare any two versions (diff view)
- Restore the document to a previous version
- See who made specific changes and when

### Version Types

| Type | Description | Creation |
|------|-------------|----------|
| **Auto-save** | Automatic snapshot every N minutes | Timer / idle detection |
| **Named version** | A named version created by a user | Manually via the API |
| **Milestone** | A special version (publish, review complete) | Workflow events |
| **Restore point** | Created before a restore from an old version | Automatically |

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

### CRDT State Vectors as the Basis of Versions

Every document version is a CRDT state vector (a point in the operation space). This allows:

1. **Incremental storage**: only the diff between versions is saved, not full copies of the document.
2. **Instant comparison**: the diff between two versions is computed from the difference of state vectors.
3. **Exact attribution**: every character is tied to an author and a timestamp through CRDT metadata.

```rust
// crates/gotipe-versioning/src/version.rs

use gotipe_crdt::{StateVector, CrdtDocument};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionId(pub String);

/// Snapshot of a document version
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Version {
    pub id: VersionId,
    pub document_id: String,
    pub name: Option<String>,          // None for auto-save
    pub version_type: VersionType,
    pub state_vector: StateVector,     // CRDT position
    pub created_by: PeerId,
    pub created_at: DateTime<Utc>,
    pub description: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
    /// Size of the incremental snapshot in bytes
    pub snapshot_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionType {
    AutoSave,
    Named,
    Milestone { milestone_type: String },
    RestorePoint { restored_from: VersionId },
}

/// Incremental snapshot: the difference between two state vectors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncrementalSnapshot {
    /// Base state vector (the version the diff is taken from)
    pub base_state_vector: StateVector,
    /// CRDT operations between the base and this version
    pub ops: Vec<CrdtOp>,
    /// Compressed binary format
    pub compressed_data: Vec<u8>,
}
```

### Snapshot Storage

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
│  │                      │    │  Full snapshot: every        │ │
│  │  ┌────────────────┐  │    │  50 versions (for fast       │ │
│  │  │ version_diffs  │  │    │  restore)                    │ │
│  │  │  from_version  │  │    │                              │ │
│  │  │  to_version    │  │    └──────────────────────────────┘ │
│  │  │  diff_summary  │  │                                     │
│  │  └────────────────┘  │                                     │
│  └──────────────────────┘                                     │
└────────────────────────────────────────────────────────────────┘
```

**Storage strategy:**

- A **full snapshot** is saved every 50 incremental versions (anchor point).
- An **incremental delta** is the CRDT ops between two adjacent versions, compressed with zstd.
- **Restore**: find the nearest full snapshot and apply the chain of deltas.
- **Retention policy**: auto-save versions older than 30 days are deleted, named versions are kept indefinitely.

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

-- Precomputed diffs for fast comparison
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
   * Create a named version (a snapshot of the current state).
   */
  createVersion(options: CreateVersionOptions): Promise<Version>;

  /**
   * Get the list of document versions.
   */
  listVersions(options?: ListVersionsOptions): Promise<Version[]>;

  /**
   * Get a specific version.
   */
  getVersion(versionId: string): Promise<VersionDetail>;

  /**
   * Restore the document to the state of a specific version.
   * Creates a restore point before restoring.
   */
  restoreVersion(versionId: string): Promise<void>;

  /**
   * Compare two versions: get the diff.
   */
  compareVersions(
    fromVersionId: string,
    toVersionId: string
  ): Promise<VersionDiff>;

  /**
   * Configure the auto-save interval.
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
  /** Structured diff for rendering */
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'insert' | 'delete' | 'modify';
  blockId: string;
  /** For text blocks: char-level diff */
  textDiff?: TextDiffSegment[];
  /** For block-level changes */
  oldBlock?: Block;
  newBlock?: Block;
}
```

### Usage Example

```typescript
import { VersioningExtension } from '@gotipe/versioning';

const editor = new GoTipeEditor({
  extensions: [
    VersioningExtension.configure({
      autoSaveIntervalMs: 5 * 60 * 1000, // auto-save every 5 minutes
      maxAutoSaveVersions: 100,           // at most 100 auto-save versions
      fullSnapshotEvery: 50,              // full snapshot every 50 versions
    }),
  ],
});

// Create a named version
await editor.versioning.createVersion({
  name: 'v1.0 — Draft',
  description: 'First draft',
});

// List versions
const versions = await editor.versioning.listVersions({
  type: ['named', 'milestone'],
  limit: 20,
});

// Compare two versions
const diff = await editor.versioning.compareVersions(
  versions[0].id,
  versions[1].id,
);
console.log(`Changes: +${diff.summary.addedChars} -${diff.summary.deletedChars}`);

// Restore
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
  // UI: show the timestamp of the last auto-save
});
```

---

## 9. Version History UI

### React Components

```typescript
// packages/react/src/versioning/VersionTimeline.tsx

/**
 * VersionTimeline: a vertical timeline of all document versions.
 * Groups auto-save versions and highlights named versions.
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
 * DiffView: visualizes the differences between two versions.
 * Supports inline diff and side-by-side modes.
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
 * VersionRestoreDialog: confirmation dialog before a restore.
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

### Branch Visualization (for advanced use cases)

When several users create named versions at the same time, the timeline can branch:

```
    v1 ─── auto ─── v2 ─── auto ─── v3 (main)
                     │
                     └── auto ─── v2.1 (Alice's branch)

    Visualization like a git graph: a linear timeline
    with merge points for concurrent versions.
```

---

## 10. Permissions Model

GoTipe uses RBAC (Role-Based Access Control) with five base roles:

| Role | Read | Comments | Suggestions | Editing | Management |
|------|------|----------|-------------|---------|------------|
| **Viewer** | Yes | No | No | No | No |
| **Commenter** | Yes | Yes | No | No | No |
| **Suggester** | Yes | Yes | Yes | No | No |
| **Editor** | Yes | Yes | Yes | Yes | No |
| **Admin** | Yes | Yes | Yes | Yes | Yes |

### Actions by Role

```
Viewer:
  ✓ View the document
  ✓ View comments
  ✓ View version history
  ✗ Everything else

Commenter:
  + Create comments
  + Reply to comments
  + Reactions on comments
  + Resolve their own comments

Suggester:
  + Create suggestions (track changes)
  + Comment on suggestions
  ✗ Accept/reject suggestions (Editor/Admin only)

Editor:
  + Edit the document
  + Accept/reject suggestions
  + Resolve any comments
  + Create named versions
  + Restore versions

Admin:
  + Manage permissions (invite, change role, remove)
  + Delete other users' comments
  + Delete versions
  + Configure the document (public/private, retention policy)
  + Transfer ownership
```

---

## 11. Permission Architecture

### Data Model

```rust
// crates/gotipe-permissions/src/lib.rs

/// Access roles
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Role {
    Viewer = 0,
    Commenter = 1,
    Suggester = 2,
    Editor = 3,
    Admin = 4,
}

/// Actions that require a permission check
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

/// Check whether a role can perform an action
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
            role == Role::Admin // Owner/admin only
        }
    }
}
```

### Permission Hierarchy

```
┌──────────────────────────────────────────────────────┐
│                 Permission Hierarchy                  │
│                                                      │
│  ┌─────────────────────────────────────────┐        │
│  │        Organization Defaults            │        │
│  │  "All employees = Editor by default"    │        │
│  └────────────────┬────────────────────────┘        │
│                   │ inherits                         │
│                   ▼                                  │
│  ┌─────────────────────────────────────────┐        │
│  │       Workspace / Folder Level          │        │
│  │  "Team A folder = Commenter for Team B" │        │
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

**Inheritance rules:**
1. A document-level permission always takes priority.
2. If no document-level permission is set, the workspace/folder level is used.
3. If no workspace level is set, the organization default is used.
4. If nothing is set, access is denied (deny by default).

### Permission Checks: Dual Enforcement

Permissions are checked in two places:

1. **Client (WASM core)**: an instant check, and the UI adapts (buttons are hidden, input is blocked).
2. **Server (Go API / Rust middleware)**: the authoritative check, which rejects unauthorized operations.

```rust
// Client-side check (WASM)
impl EditorState {
    pub fn can_edit(&self) -> bool {
        can_perform(self.current_role, Action::EditDocument)
    }

    pub fn can_comment(&self) -> bool {
        can_perform(self.current_role, Action::AddComment)
    }

    /// Applied before every Step
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
// Server-side check (Go Cloud API)
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

### SQL Schema for Permissions

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

-- Permission audit log (see 14-security-privacy.md)
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
   * Set a user's permission on a document.
   */
  setPermission(options: SetPermissionOptions): Promise<void>;

  /**
   * Get all permissions for a document.
   */
  getPermissions(documentId: string): Promise<DocumentPermissions>;

  /**
   * Check a permission (client-side, instant).
   */
  checkPermission(action: Action): boolean;

  /**
   * Get the current user's effective role.
   */
  getCurrentRole(): Role;

  /**
   * Remove a permission (revoke access).
   */
  revokePermission(documentId: string, userId: string): Promise<void>;

  /**
   * Get the public link settings.
   */
  getPublicAccess(documentId: string): Promise<PublicAccessSettings>;

  /**
   * Set public access (anyone with the link).
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
  email?: string; // Invite by email (creates a pending invite)
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
  role: 'viewer' | 'commenter'; // Public access is limited to viewer/commenter
  expiresAt?: Date;
}
```

### Usage Example

```typescript
// Check permissions before showing the UI
if (editor.permissions.checkPermission('editDocument')) {
  showToolbar();
}

if (editor.permissions.checkPermission('addComment')) {
  showCommentButton();
}

// Set a permission
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

  // Update the UI: hide/show controls
  if (event.userId === currentUserId) {
    updateEditorUI(event.newRole);
  }
});

editor.on('accessRevoked', (event: AccessRevokedEvent) => {
  // If the current user lost access
  if (event.userId === currentUserId) {
    showAccessDeniedScreen();
  }
});
```

---

## 13. Collaboration Integration

### Comments in a Multi-user Environment

Comments are CRDT-aware. With concurrent operations:

| Scenario | Behavior |
|----------|----------|
| Two users comment on the same text | Both CommentMarks coexist (overlapping highlights) |
| User A resolves, user B replies | The reply is kept, the resolved status is updated via LWW |
| The text under a comment is deleted | The CommentMark is removed, the comment becomes "orphaned" |
| User A edits text inside the comment range | The CommentMark expands/shrinks automatically via CRDT positions |

### Suggestions in a Multi-user Environment

```
Scenario: Alice and Bob are both in suggestion mode

Alice (Suggester):
  Types "Hello" → Suggestion { type: insert, text: "Hello", author: Alice }

Bob (Suggester):
  Deletes "World" → Suggestion { type: delete, text: "World", author: Bob }

Charlie (Editor):
  Sees both suggestions and can accept/reject each one independently.

The CRDT guarantees that suggestions from different authors do not conflict,
even when they touch overlapping text ranges.
```

### Conflicts and Resolution

```rust
// Conflict resolution strategies for comments/suggestions

/// Comment conflicts: LWW (Last Writer Wins) for mutable fields
/// - resolved_at, resolved_by: LWW by timestamp
/// - content (edit): LWW by timestamp
/// - reactions: add-wins set (additions are never lost)

/// Suggestion conflicts:
/// - Two overlapping insert suggestions: both are kept,
///   the editor decides the order of acceptance
/// - Accept + concurrent edit in the same range:
///   CRDT merge handles it correctly (insert at the CRDT position)
/// - Reject + concurrent edit: the rejected text stays deleted,
///   the concurrent edit is applied to the remaining text

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

When a user views a comment, their presence is shown:

```typescript
// Presence integration
editor.on('commentViewed', (event) => {
  // Broadcast through the presence channel
  editor.collaboration.broadcastPresence({
    type: 'viewing_comment',
    commentId: event.commentId,
    userId: currentUserId,
  });
});

// Other users see who is viewing the comment
editor.on('presenceUpdated', (peers) => {
  const viewingComment = peers.filter(
    p => p.state?.type === 'viewing_comment'
  );
  // Show avatars next to the comment
});
```

---

## 14. Comparison with Competitors

### Comments

| Feature | GoTipe | Tiptap | Google Docs | Notion |
|---------|--------|--------|-------------|--------|
| Inline comments | Yes (CRDT mark) | Yes (Yjs + extension) | Yes | Yes |
| Block comments | Yes | No (custom) | No | Yes (block discussion) |
| Document comments | Yes | No | No | No |
| Comment threads | Yes | Yes (Pro) | Yes | Yes |
| Comment reactions | Yes | No | Yes | Yes |
| Offline comments | Yes (CRDT) | Partial | No | No |
| Real-time sync | Yes | Yes (Cloud required) | Yes | Yes |
| Overlapping comments | Yes | Limited | Yes | No |
| Comment API | Open-source | Pro tier ($) | No | No |
| Self-hosted | Yes | Enterprise ($$$) | No | No |

### Suggestions / Track Changes

| Feature | GoTipe | Tiptap | Google Docs | Notion |
|---------|--------|--------|-------------|--------|
| Suggestion mode | Yes | Pro tier ($) | Yes | No |
| Insert suggestions | Yes | Yes (Pro) | Yes | No |
| Delete suggestions | Yes | Yes (Pro) | Yes | No |
| Format suggestions | Yes | No | Yes | No |
| Block change suggestions | Yes | No | Partial | No |
| Accept/reject individual | Yes | Yes (Pro) | Yes | N/A |
| Accept/reject all | Yes | No | Yes | N/A |
| Suggestion threads | Yes | No | Yes | N/A |
| CRDT-based diff | Yes | Yjs-based | OT-based | N/A |

### Version History

| Feature | GoTipe | Tiptap | Google Docs | Notion |
|---------|--------|--------|-------------|--------|
| Auto-save versions | Yes | No (manual) | Yes | Yes |
| Named versions | Yes | No | No | No |
| Diff view | Yes (char-level) | No | Yes (limited) | No |
| Side-by-side diff | Yes | No | No | No |
| Restore version | Yes | No (manual) | Yes | Yes (paid) |
| Version branches | Yes (basic) | No | No | No |
| Incremental storage | Yes (CRDT deltas) | N/A | Yes | Yes |
| Retention policy | Configurable | N/A | 30 days (free) | 30 days (free) |
| Self-hosted storage | Yes (Cloudflare R2) | N/A | No | No |
| API access | Yes | No | Limited (Docs API) | No |

### Permissions

| Feature | GoTipe | Tiptap | Google Docs | Notion |
|---------|--------|--------|-------------|--------|
| Viewer role | Yes | No (DIY) | Yes | Yes |
| Commenter role | Yes | No (DIY) | Yes | Yes |
| Suggester role | Yes | No | No | No |
| Editor role | Yes | No (DIY) | Yes | Yes |
| Admin role | Yes | No (DIY) | Yes (Owner) | Yes |
| Permission API | Yes | No | Yes (Drive API) | Yes |
| Organization defaults | Yes | No | Yes (Workspace) | Yes |
| Public links | Yes | No | Yes | Yes |
| Expiring links | Yes | No | No | No |
| Client-side enforcement | Yes (WASM) | No | No (server only) | No |
| Permission audit log | Yes | No | Yes (Admin) | Yes (Enterprise) |
| Self-hosted RBAC | Yes | No | No | No |

### Comparison Summary

**GoTipe vs Tiptap:** Tiptap offers comments and suggestions only in its Pro/Enterprise tiers. GoTipe provides everything as open source under the MIT license. CRDT-based versioning and built-in RBAC are unique advantages of GoTipe.

**GoTipe vs Google Docs:** Google Docs has a mature comments and suggestions system, but it is fully cloud-dependent, not self-hosted, and has no open API for customization. GoTipe offers comparable functionality with offline support and self-hosted deployment.

**GoTipe vs Notion:** Notion does not support suggestion mode and has a basic version history (paid plan only). GoTipe is significantly ahead of Notion in comments/versioning/permissions functionality.

---

## Configuration and Setup

### Full Production Configuration

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
      // Automatically turn on suggestion mode for Suggesters
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
      // Fetch permissions from the server on initialization
      fetchPermissions: async (docId) => {
        const res = await fetch(`/api/documents/${docId}/permissions`);
        return res.json();
      },
      // Callback on role change: update the UI
      onRoleChanged: (newRole) => {
        updateUIForRole(newRole);
      },
      defaultPublicRole: 'viewer',
    }),
  ],
});
```

### Self-hosted Configuration

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

## Related Documents

| Document | Relationship |
|----------|--------------|
| [02-collaboration.md](02-collaboration.md) | CRDT engine, real-time sync, presence: the foundation for comments and versioning |
| [03-editor-core.md](03-editor-core.md) | Document model, marks, steps: used by CommentMark and SuggestionMark |
| [05-extensions.md](05-extensions.md) | Extension API: comments, suggestions and versioning are implemented as extensions |
| [09-sdk-and-api.md](09-sdk-and-api.md) | TypeScript API: the Comment, Version and Permission types |
| [10-cloud.md](10-cloud.md) | Cloud infrastructure: Cloudflare R2 storage, PostgreSQL, WebSocket sync |
| [14-security-privacy.md](14-security-privacy.md) | Security model: audit logs, encryption, permission enforcement |
