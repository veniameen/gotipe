# GoTipe — Security and Privacy

> **Historical specification, not a guide to the current API.** The examples, timelines,
> performance comparisons, commercial terms and promises below do not confirm an
> implementation or the availability of the service. Current references:
> [contracts](development/editor-contracts.md), [code map](development/code-map.md),
> [checks](development/testing.md), [release plan](22-release-readiness.md). Licenses are
> defined by `LICENSE` and the manifest of each package, not by this document.

> Security by design: security is built into every layer of GoTipe, from the WASM sandbox on the client to encrypted storage on the server. User data does not leave the controlled perimeter without explicit consent.

---

## Contents

- [Threat Model](#threat-model)
- [Content Security](#content-security)
- [Input Validation](#input-validation)
- [CRDT Security](#crdt-security)
- [Authentication & Authorization](#authentication--authorization)
- [Data Privacy](#data-privacy)
- [AI Privacy](#ai-privacy)
- [Server Security](#server-security)
- [Client Security](#client-security)
- [Dependency Security](#dependency-security)
- [Compliance](#compliance)
- [Incident Response](#incident-response)
- [Security Checklist](#security-checklist)
- [Related documents](#related-documents)

---

## Threat Model

GoTipe operates in several environments: the browser (WASM), the server (Go/Rust), and AI providers (external APIs). Each environment has its own set of threats.

### Threat table

| # | Threat | Severity | Attack vector | Component | Mitigation |
|---|--------|----------|-------------|-----------|------------|
| T1 | XSS through editor output | **Critical** | Inserting `<script>` or `onerror` through content | Client (render) | HTML sanitization in the Rust core + JS fallback, CSP headers |
| T2 | HTML injection through paste | **High** | Clipboard contains malicious HTML | Client (paste) | Paste sanitizer, element allowlist |
| T3 | CRDT operation tampering | **High** | A malicious peer sends invalid operations | CRDT Engine | Operation validation, schema enforcement, author verification |
| T4 | WASM memory exploits | **Medium** | Crafted input causes a buffer overflow in WASM | WASM Core | Rust memory safety, WASM sandbox, bounds checking |
| T5 | SQL injection | **Critical** | Malformed API parameters | Server (Go) | Parameterized queries, ORM (sqlx), input validation |
| T6 | WebSocket hijacking | **High** | Interception of the WS connection, replay attacks | Sync Server | WSS (TLS), JWT validation on handshake, origin check |
| T7 | API key leakage | **High** | A key ends up in client-side code or logs | API Gateway | Server-side only keys, key rotation, hash-based storage |
| T8 | AI data leakage | **High** | Confidential data is sent to an LLM | AI Proxy | PII detection, self-hosted Ollama option, data flow audit |
| T9 | Supply chain attack | **Medium** | Compromised dependency (npm/crates.io) | Build pipeline | cargo audit, npm audit, lockfile pinning, SBOM |
| T10 | DDoS on the sync server | **Medium** | Flood of WebSocket connections or operations | Sync Server | Rate limiting, connection limits, IP throttling |
| T11 | Privilege escalation | **High** | A user gains admin rights through API manipulation | API Gateway | RBAC enforcement, server-side authorization checks |
| T12 | Data exfiltration | **Critical** | Unauthorized access to documents | Storage Layer | Encryption at rest (AES-256), access control, audit logging |
| T13 | CSRF attacks | **Medium** | Cross-site request to the GoTipe API | API Gateway | SameSite cookies, CSRF tokens, Origin header validation |
| T14 | Malicious extensions | **Medium** | A third-party extension runs malicious code | Extension Host | Extension sandbox, permission model, review process |

### Attack surface diagram

```
                         ┌─────────────────┐
                         │   ATTACKER       │
                         └────────┬────────┘
                                  │
            ┌─────────────────────┼──────────────────────┐
            │                     │                      │
            ▼                     ▼                      ▼
  ┌──────────────────┐  ┌─────────────────┐   ┌──────────────────┐
  │  CLIENT SURFACE  │  │  NETWORK LAYER  │   │  SERVER SURFACE  │
  │                  │  │                 │   │                  │
  │  • Clipboard     │  │  • WebSocket    │   │  • REST API      │
  │  • HTML render   │  │  • HTTP/REST    │   │  • Database      │
  │  • Extensions    │  │  • AI API calls │   │  • File storage  │
  │  • WASM module   │  │  • DNS          │   │  • AI Proxy      │
  │  • iframe embeds │  │                 │   │  • Export service │
  └──────────────────┘  └─────────────────┘   └──────────────────┘
```

---

## Content Security

### XSS Prevention

GoTipe uses layered XSS protection. Sanitization runs in the Rust core (gotipe-export), which rules out bypasses through JS-specific vulnerabilities.

#### Level 1: Rust-side sanitization

```rust
// crates/gotipe-export/src/html/sanitizer.rs

use std::collections::{HashMap, HashSet};

/// Allowlist of elements and attributes for HTML output
pub struct HtmlSanitizer {
    allowed_elements: HashSet<&'static str>,
    allowed_attrs: HashMap<&'static str, HashSet<&'static str>>,
    allowed_css_props: HashSet<&'static str>,
    allowed_uri_schemes: HashSet<&'static str>,
}

impl HtmlSanitizer {
    pub fn strict() -> Self {
        Self {
            allowed_elements: [
                "p", "h1", "h2", "h3", "h4", "h5", "h6",
                "ul", "ol", "li", "blockquote", "pre", "code",
                "em", "strong", "del", "u", "a", "br", "hr",
                "table", "thead", "tbody", "tr", "th", "td",
                "img", "span", "div", "sub", "sup",
            ].into_iter().collect(),

            allowed_attrs: HashMap::from([
                ("a", ["href", "title", "target", "rel"].into_iter().collect()),
                ("img", ["src", "alt", "width", "height"].into_iter().collect()),
                ("td", ["colspan", "rowspan"].into_iter().collect()),
                ("th", ["colspan", "rowspan"].into_iter().collect()),
                ("pre", ["data-language"].into_iter().collect()),
                ("code", ["class"].into_iter().collect()),
                ("span", ["style", "data-color"].into_iter().collect()),
            ]),

            allowed_css_props: [
                "color", "background-color", "font-weight",
                "font-style", "text-decoration", "text-align",
            ].into_iter().collect(),

            allowed_uri_schemes: [
                "http", "https", "mailto",
            ].into_iter().collect(),
        }
    }

    /// Sanitizes an HTML string: removes everything that is not in the allowlist
    pub fn sanitize(&self, html: &str) -> Result<String, SanitizeError> {
        let fragment = parse_html_fragment(html)?;
        let mut output = String::with_capacity(html.len());

        for node in fragment.walk() {
            match node {
                Node::Element(el) => {
                    if !self.allowed_elements.contains(el.tag.as_str()) {
                        // The element is removed, but its child nodes are kept
                        continue;
                    }
                    self.sanitize_attrs(&el, &mut output)?;
                }
                Node::Text(text) => {
                    output.push_str(&escape_html(&text));
                }
                _ => {} // Comment, Doctype are removed
            }
        }
        Ok(output)
    }

    /// URI scheme check: blocks javascript:, data:, etc.
    fn validate_uri(&self, uri: &str) -> bool {
        if let Some(scheme) = uri.split(':').next() {
            self.allowed_uri_schemes.contains(scheme.to_lowercase().as_str())
        } else {
            // Relative URI is allowed
            true
        }
    }
}
```

#### Level 2: JS-side sanitization (fallback)

```typescript
// packages/core/src/security/sanitizer.ts

import DOMPurify from 'dompurify';

const SANITIZER_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'em', 'strong', 'del', 'u', 'a', 'br', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'span', 'div', 'sub', 'sup',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel', 'src', 'alt',
    'width', 'height', 'colspan', 'rowspan',
    'data-language', 'class', 'style', 'data-color',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
  // Force rel="noopener noreferrer" on all links
  FORBID_CONTENTS: ['script', 'style', 'textarea'],
};

/**
 * Double sanitization: Rust (primary) + DOMPurify (fallback).
 * DOMPurify is used only if the Rust sanitizer returned an error.
 */
export function sanitizeHtml(html: string): string {
  try {
    // Primary: Rust WASM sanitizer
    return wasmModule.sanitize_html(html);
  } catch {
    // Fallback: DOMPurify
    return DOMPurify.sanitize(html, SANITIZER_CONFIG);
  }
}
```

### Content Security Policy (CSP)

Recommended CSP headers for applications that use GoTipe:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' wss://sync.gotipe.com https://api.gotipe.com;
  worker-src 'self' blob:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
```

| Directive | Value | Rationale |
|-----------|----------|-------------|
| `script-src 'wasm-unsafe-eval'` | Allows WASM execution | Required for the gotipe-wasm core |
| `style-src 'unsafe-inline'` | Allows inline styles | The editor uses inline styles for marks (color, highlight) |
| `connect-src wss://...` | WebSocket for collaboration | Sync server connection |
| `frame-src 'none'` | Forbids iframe embedding | Prevents clickjacking |
| `object-src 'none'` | Forbids plugins | Blocks Flash, Java applets |

### Allowlists

#### Elements (HTML tags)

| Category | Allowed elements |
|-----------|---------------------|
| Block | `p`, `h1`-`h6`, `blockquote`, `pre`, `hr`, `div` |
| List | `ul`, `ol`, `li` |
| Inline | `em`, `strong`, `del`, `u`, `code`, `a`, `br`, `span`, `sub`, `sup` |
| Table | `table`, `thead`, `tbody`, `tr`, `th`, `td` |
| Media | `img` (with `src` validation) |
| Forbidden | `script`, `style`, `iframe`, `object`, `embed`, `form`, `input`, `textarea`, `svg`, `math` |

#### Attributes (HTML attributes)

| Attribute | Elements | Validation |
|---------|----------|-----------|
| `href` | `a` | Only `http:`, `https:`, `mailto:`; `javascript:` is blocked |
| `src` | `img` | Only `http:`, `https:`; `data:` is blocked in strict mode |
| `target` | `a` | Only `_blank`; `rel="noopener noreferrer"` is added forcibly |
| `style` | `span` | Only CSS properties from the allowlist |
| `class` | `code` | Only the `language-*` pattern |
| `data-*` | All | Forbidden by default, explicit allowlist for `data-language`, `data-color` |

---

## Input Validation

### Schema-based validation in Rust

Every GoTipe document is validated against a schema defined in the Rust core. Validation runs on every operation: you cannot insert a block that the schema does not describe. For the document model, see [03-editor-core.md](03-editor-core.md).

```rust
// crates/gotipe-core/src/schema/validator.rs

use crate::schema::{Schema, BlockSpec, MarkSpec};
use crate::document::{Block, Mark, TextSpan};

/// Limits to prevent DoS through giant documents
pub struct ValidationLimits {
    /// Maximum block nesting depth
    pub max_depth: usize,              // default: 12
    /// Maximum number of blocks in a document
    pub max_blocks: usize,             // default: 10_000
    /// Maximum text length in one span
    pub max_text_length: usize,        // default: 100_000
    /// Maximum number of marks on one span
    pub max_marks_per_span: usize,     // default: 20
    /// Maximum attribute size (bytes)
    pub max_attr_size: usize,          // default: 4_096
    /// Maximum total document size (bytes)
    pub max_document_size: usize,      // default: 10_485_760 (10MB)
}

impl Default for ValidationLimits {
    fn default() -> Self {
        Self {
            max_depth: 12,
            max_blocks: 10_000,
            max_text_length: 100_000,
            max_marks_per_span: 20,
            max_attr_size: 4_096,
            max_document_size: 10 * 1024 * 1024,
        }
    }
}

/// Document validator: checks conformance with the schema
pub struct DocumentValidator<'a> {
    schema: &'a Schema,
    limits: ValidationLimits,
}

impl<'a> DocumentValidator<'a> {
    pub fn validate_block(&self, block: &Block, depth: usize) -> Result<(), ValidationError> {
        // 1. Check nesting depth
        if depth > self.limits.max_depth {
            return Err(ValidationError::MaxDepthExceeded {
                max: self.limits.max_depth,
                actual: depth,
            });
        }

        // 2. Check the block type: it must be in the schema
        let spec = self.schema.block_spec(&block.block_type)
            .ok_or(ValidationError::UnknownBlockType(block.block_type.clone()))?;

        // 3. Validate block attributes
        self.validate_block_attrs(block, spec)?;

        // 4. Validate content (text spans, marks)
        self.validate_content(&block.content, spec)?;

        // 5. Recursively validate children
        for child in &block.children {
            if !spec.allowed_children.contains(&child.block_type) {
                return Err(ValidationError::InvalidChild {
                    parent: block.block_type.clone(),
                    child: child.block_type.clone(),
                });
            }
            self.validate_block(child, depth + 1)?;
        }

        Ok(())
    }

    fn validate_block_attrs(
        &self,
        block: &Block,
        spec: &BlockSpec,
    ) -> Result<(), ValidationError> {
        for (key, value) in &block.attrs {
            // The attribute must be declared in the schema
            let attr_spec = spec.attrs.get(key.as_str())
                .ok_or(ValidationError::UnknownAttribute {
                    block_type: block.block_type.clone(),
                    attr: key.clone(),
                })?;

            // Size check
            let attr_bytes = serde_json::to_vec(value)
                .map_err(|_| ValidationError::InvalidAttrValue)?;
            if attr_bytes.len() > self.limits.max_attr_size {
                return Err(ValidationError::AttrTooLarge {
                    attr: key.clone(),
                    max: self.limits.max_attr_size,
                });
            }

            // Value type check
            attr_spec.validate_value(value)?;
        }
        Ok(())
    }

    fn validate_mark(&self, mark: &Mark) -> Result<(), ValidationError> {
        let spec = self.schema.mark_spec(&mark.mark_type)
            .ok_or(ValidationError::UnknownMarkType(mark.mark_type.clone()))?;

        // Validate mark attributes (e.g. href for link)
        for (key, value) in &mark.attrs {
            let attr_spec = spec.attrs.get(key.as_str())
                .ok_or(ValidationError::UnknownMarkAttribute {
                    mark_type: mark.mark_type.clone(),
                    attr: key.clone(),
                })?;
            attr_spec.validate_value(value)?;
        }

        // Special check for link marks: URL validation
        if mark.mark_type == "link" {
            if let Some(href) = mark.attrs.get("href") {
                self.validate_url(href.as_str()
                    .ok_or(ValidationError::InvalidAttrValue)?)?;
            }
        }

        Ok(())
    }
}
```

### Validation at every level

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌───────────────┐
│  User input │ ──► │ Paste / API  │ ──► │ Rust Validator │ ──► │ CRDT Apply    │
│  (keyboard, │     │ sanitizer    │     │ (schema check) │     │ (if valid)    │
│   paste,    │     │              │     │                │     │               │
│   API call) │     │ • Strip tags │     │ • Type check   │     │ • Broadcast   │
│             │     │ • Allowlist  │     │ • Attr check   │     │ • Persist     │
│             │     │ • URI check  │     │ • Depth check  │     │               │
└─────────────┘     └──────────────┘     └────────────────┘     └───────────────┘
                                                │
                                                ▼ (invalid)
                                         ┌────────────────┐
                                         │ Reject + Error │
                                         │ (no side       │
                                         │  effects)      │
                                         └────────────────┘
```

---

## CRDT Security

The CRDT engine (details in [02-collaboration.md](02-collaboration.md)) requires dedicated security measures, because every peer can generate operations.

### Operation Validation

```rust
// crates/gotipe-crdt/src/security.rs

use crate::ops::CrdtOperation;
use crate::doc::CrdtDocument;

/// Validation of a CRDT operation before it is applied
pub struct OperationValidator {
    /// Maximum size of a single operation (bytes)
    max_op_size: usize,
    /// Maximum number of operations in one batch
    max_batch_size: usize,
    /// Rate limit: operations per second per peer
    max_ops_per_second: u32,
}

impl OperationValidator {
    /// Checks an operation before it is merged into the document
    pub fn validate(
        &self,
        op: &CrdtOperation,
        doc: &CrdtDocument,
        peer_state: &PeerState,
    ) -> Result<(), CrdtSecurityError> {
        // 1. Operation size
        let op_size = op.serialized_size();
        if op_size > self.max_op_size {
            return Err(CrdtSecurityError::OperationTooLarge {
                size: op_size,
                max: self.max_op_size,
            });
        }

        // 2. Author verification: PeerId matches the authenticated user
        if !peer_state.is_authenticated(&op.peer_id) {
            return Err(CrdtSecurityError::UnauthorizedPeer(op.peer_id.clone()));
        }

        // 3. Causal ordering: the operation refers to known dependencies
        if !doc.version.contains(&op.dependencies) {
            return Err(CrdtSecurityError::InvalidCausalOrder);
        }

        // 4. Schema compliance: the result of the operation matches the schema
        let simulated_doc = doc.simulate_apply(op)?;
        self.schema_validator.validate_document(&simulated_doc)?;

        // 5. Rate limiting
        if peer_state.ops_in_last_second(&op.peer_id) > self.max_ops_per_second {
            return Err(CrdtSecurityError::RateLimitExceeded {
                peer: op.peer_id.clone(),
                limit: self.max_ops_per_second,
            });
        }

        Ok(())
    }
}
```

### Malicious Peer Detection

| Indicator | Threshold | Action |
|-----------|-------|----------|
| Operations per second | > 100 ops/s | Throttle + warning |
| Operations per second | > 500 ops/s | Temporary ban (60s) |
| Invalid operations | > 5 in 10 minutes | Disconnect + log |
| Document size growth | > 1MB in 1 operation | Reject operation |
| Causal order violations | > 3 in a row | Disconnect + alert |
| Replay attacks (duplicate ops) | Any duplicate | Silent reject |

### Conflict Resolution Safety

CRDT conflicts are resolved deterministically: the result is the same on all peers:

```
Peer A: insert("Hello") at position 0    ─┐
                                           ├──► Merge: "HelloWorld" (deterministic)
Peer B: insert("World") at position 0    ─┘    PeerId ordering determines the order

Rule: for concurrent inserts, the peer with the lexicographically smaller PeerId goes first.
This mathematically guarantees eventual consistency.
```

**Important:** the GoTipe CRDT does not use last-writer-wins for text content (only for block attributes). This prevents data loss during concurrent editing.

---

## Authentication & Authorization

### API Key Management

API keys are stored as SHA-256 hashes in PostgreSQL. The plaintext key is shown to the user once, at creation.

```
┌────────────┐     ┌──────────────┐     ┌───────────────────┐
│  Developer │     │  GoTipe API  │     │   PostgreSQL      │
│            │     │  Gateway     │     │                   │
│  gt_live_  │────►│  SHA-256     │────►│  key_hash         │
│  a1b2c3... │     │  hash(key)   │     │  key_prefix       │
│            │     │  lookup      │     │  scopes           │
└────────────┘     └──────────────┘     │  last_used_at     │
                                        │  expires_at       │
                                        └───────────────────┘
```

#### API key structure

```
gt_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
│  │    │
│  │    └── 32 random characters (crypto/rand)
│  └── Environment: live / test
└── Prefix: GoTipe identifier
```

| Field | Description |
|------|----------|
| `key_prefix` | First 8 characters (for display in the UI: `gt_live_a1b2c3d4...`) |
| `key_hash` | SHA-256 hash of the full key |
| `scopes` | Array of permissions: `["documents:read", "documents:write", "ai:use"]` |
| `expires_at` | Optional expiration date |
| `rate_limit` | Custom rate limit (default: plan limit) |

### JWT Tokens

JWTs are used for browser-side authentication (WebSocket handshake, REST API from the SPA).

```typescript
// Example JWT payload for GoTipe Cloud
interface GoTipeJwtPayload {
  /** Subject — user ID */
  sub: string;
  /** Organization ID */
  org: string;
  /** Role in the organization */
  role: 'viewer' | 'commenter' | 'editor' | 'admin' | 'owner';
  /** Scopes: permitted actions */
  scopes: string[];
  /** Document-level permissions (optional) */
  doc_permissions?: Record<string, 'read' | 'comment' | 'edit'>;
  /** Issued at */
  iat: number;
  /** Expiration (15 minutes) */
  exp: number;
}
```

**JWT policy:**
- Access token TTL: 15 minutes
- Refresh token TTL: 7 days
- Signing algorithm: ES256 (ECDSA P-256)
- The JWT is stored in an `httpOnly` cookie (not in localStorage)
- Refresh rotation: every refresh token is single-use

### JWT Blocklist (Revocation)

Revoked JWTs (logout, password change, session revoke) are stored in Valkey until their TTL expires:

```go
// apps/cloud/internal/auth/blocklist.go

const valkeyBlocklistDB = 1  // Separate DB for the blocklist

type JWTBlocklist struct {
    client *redis.Client  // Valkey client, db=1
}

func NewJWTBlocklist(valkeyURL string) *JWTBlocklist {
    client := redis.NewClient(&redis.Options{
        Addr: valkeyURL,
        DB:   valkeyBlocklistDB,
    })
    return &JWTBlocklist{client: client}
}

// Revoke: add a JWT to the blocklist
func (bl *JWTBlocklist) Revoke(ctx context.Context, tokenHash string, expiresAt time.Time) error {
    ttl := time.Until(expiresAt)
    if ttl <= 0 {
        return nil  // Already expired, no point in blocking
    }
    return bl.client.Set(ctx, "blocked:"+tokenHash, "1", ttl).Err()
}

// IsRevoked: check whether a JWT has been revoked
func (bl *JWTBlocklist) IsRevoked(ctx context.Context, tokenHash string) bool {
    exists, err := bl.client.Exists(ctx, "blocked:"+tokenHash).Result()
    if err != nil {
        // Graceful degradation: if Valkey is unavailable, treat the token as valid
        // (it expires within 15 minutes anyway)
        return false
    }
    return exists > 0
}

// RevokeAllForUser: revoke all of a user's sessions (on password change)
func (bl *JWTBlocklist) RevokeAllForUser(ctx context.Context, userID string) error {
    return bl.client.Set(ctx,
        "user_revoked:"+userID,
        time.Now().Unix(),
        15*time.Minute,  // Max JWT TTL
    ).Err()
}
```

**Valkey configuration for the blocklist:**
- DB 1 (separate from the main cache in DB 0)
- `maxmemory-policy noeviction`: a blocked token must not be evicted by accident
- AOF persistence: the blocklist survives a restart
- TTL on every key = the remaining lifetime of the JWT (automatic cleanup)

**Revocation scenarios:**

| Event | Action |
|---------|----------|
| Logout | `Revoke(tokenHash, token.exp)` |
| Password change | `RevokeAllForUser(userID)` |
| API key deletion | `Revoke(keyHash, key.exp)` |
| Suspicious activity | `RevokeAllForUser(userID)` + email notification |
| GDPR deletion | `RevokeAllForUser(userID)` + delete all data |

### RBAC (Role-Based Access Control)

| Role | Documents | Comments | Editing | AI | Export | Settings | Billing |
|------|-----------|-------------|----------------|-----|--------|-----------|---------|
| `viewer` | Read | Read | -- | -- | Read | -- | -- |
| `commenter` | Read | Read/Write | -- | -- | Read | -- | -- |
| `editor` | Read | Read/Write | Read/Write | Use | Read/Write | -- | -- |
| `admin` | CRUD | CRUD | Read/Write | Use + Config | CRUD | Read/Write | Read |
| `owner` | CRUD | CRUD | Read/Write | Use + Config | CRUD | CRUD | CRUD |

### Per-Document Permissions

In addition to organization-level roles, GoTipe supports per-document permissions:

```typescript
// Per-document access control
const docPermission = await gotipeCloud.documents.setPermission({
  documentId: 'doc_abc123',
  userId: 'user_xyz789',
  permission: 'edit', // 'read' | 'comment' | 'edit'
  expiresAt: new Date('2025-12-31'),
});
```

Enforcement happens on the server side: the WebSocket handshake checks the permission before connecting to a room.

```go
// server/middleware/auth.go

func AuthorizeDocument(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        claims := r.Context().Value(ctxKeyClaims).(*JwtClaims)
        docID := chi.URLParam(r, "documentID")
        requiredPerm := methodToPermission(r.Method)

        // 1. Organization-level role check
        if hasOrgPermission(claims.Role, requiredPerm) {
            next.ServeHTTP(w, r)
            return
        }

        // 2. Document-level permission check
        perm, err := db.GetDocPermission(r.Context(), docID, claims.Sub)
        if err != nil || !perm.Allows(requiredPerm) {
            http.Error(w, "Forbidden", http.StatusForbidden)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

---

## Data Privacy

### GDPR Compliance

GoTipe implements GDPR by design:

| GDPR principle | Implementation in GoTipe |
|---------------|---------------------|
| **Lawfulness** | Data is processed only with consent or on the basis of a contract |
| **Purpose limitation** | Documents are stored only to provide the collaboration service |
| **Data minimization** | Only the necessary data is collected: email, name, document content |
| **Accuracy** | Users can update their data through the API |
| **Storage limitation** | Configurable retention policy, auto-delete of inactive documents |
| **Integrity & confidentiality** | Encryption at rest + in transit |
| **Accountability** | Audit logging of all operations on data |

### Data Minimization

GoTipe Cloud collects a minimum of data:

| Data | Collected | Purpose | Retention |
|--------|-----------|------|-----------|
| Email | Yes | Authentication, notifications | Until the account is deleted |
| Name | Yes | Display in collaboration | Until the account is deleted |
| IP address | Rate limiting only | Security | 24 hours |
| Document content | Yes | Service | Customer policy |
| Cursor positions | Transient | Awareness (collaboration) | In memory, not persisted |
| AI prompts | No (by default) | -- | Not stored |
| Usage metrics | Aggregated | Billing, analytics | 90 days |

### Encryption

#### At Rest (AES-256-GCM)

```
┌────────────────────────────────────────────────────────────────┐
│                    Storage Layer                                │
│                                                                │
│  PostgreSQL                                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  documents.content_encrypted = AES-256-GCM(             │  │
│  │      key = DEK (Data Encryption Key),                   │  │
│  │      plaintext = CRDT snapshot bytes,                   │  │
│  │      aad = document_id                                  │  │
│  │  )                                                      │  │
│  │                                                         │  │
│  │  DEK is encrypted with a KEK (Key Encryption Key)       │  │
│  │  KEK is stored in: AWS KMS / HashiCorp Vault / env var  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  Cloudflare R2 (CRDT snapshots, exported files)                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  SSE (server-side encryption by R2)                     │  │
│  │  Bucket policy: deny non-TLS requests                   │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

#### In Transit (TLS 1.3)

| Connection | Protocol | Minimum version |
|------------|----------|-------------------|
| Browser → API Gateway | HTTPS | TLS 1.2 (prefer 1.3) |
| Browser → Sync Server | WSS | TLS 1.2 (prefer 1.3) |
| API Gateway → PostgreSQL | TLS | TLS 1.2 |
| API Gateway → Valkey | TLS | TLS 1.2 |
| AI Proxy → LLM Provider | HTTPS | TLS 1.2 |
| Server → R2 | HTTPS | TLS 1.2 |

### Data Retention & Right to Deletion

```typescript
// Example: a request to delete a user's data (GDPR Article 17)
const deletion = await gotipeCloud.admin.requestDataDeletion({
  userId: 'user_xyz789',
  // Options:
  deleteDocuments: true,         // Delete all documents where the user is the only owner
  anonymizeCollabHistory: true,  // Replace userId with "deleted_user" in the CRDT history
  deleteApiKeys: true,           // Revoke all API keys
  deleteExports: true,           // Delete generated files from R2
});

// Result: deletion completes within 72 hours
// A confirmation token is returned for tracking the status
```

**Retention policy:**

| Data type | Self-hosted | Cloud Starter | Cloud Pro | Cloud Enterprise |
|------------|-------------|---------------|-----------|------------------|
| Documents | Unlimited | 1 year after last edit | Unlimited | Configurable |
| CRDT History | Unlimited | 90 days | 1 year | Configurable |
| Audit Logs | Unlimited | 30 days | 1 year | 7 years |
| Exported Files | Unlimited | 7 days | 30 days | Configurable |
| Backups | Customer's responsibility | 30 days | 90 days | Configurable |

---

## AI Privacy

The AI integration (details in [07-ai.md](07-ai.md)) creates particular privacy risks. GoTipe implements privacy by design for the AI data flow.

### Data flow for AI requests

```
┌────────────────────────────────────────────────────────────────────────┐
│                           CLIENT                                        │
│                                                                        │
│  ┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐   │
│  │ Document     │───►│ ContextBuilder   │───►│ PII Detector       │   │
│  │ (WASM state) │    │ (Rust/WASM)      │    │ (Rust/WASM)        │   │
│  │              │    │                  │    │                    │   │
│  │ • Full doc   │    │ • Selection only │    │ • Email regex      │   │
│  │ • All blocks │    │ • Surrounding    │    │ • Phone regex      │   │
│  │              │    │   context (±3    │    │ • SSN/INN patterns │   │
│  │              │    │   blocks)        │    │ • Credit card      │   │
│  │              │    │ • Block types    │    │ • Custom patterns  │   │
│  │              │    │ • No metadata    │    │                    │   │
│  └──────────────┘    └──────────────────┘    └────────┬───────────┘   │
│                                                       │               │
│                                    ┌──────────────────┘               │
│                                    ▼                                   │
│                     ┌──────────────────────┐                          │
│                     │ Sanitized AI Request │                          │
│                     │ (minimal context,    │                          │
│                     │  PII redacted)       │                          │
│                     └──────────┬───────────┘                          │
└────────────────────────────────┼──────────────────────────────────────┘
                                 │ HTTPS (TLS 1.3)
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        AI PROXY (GoTipe Cloud / Self-hosted)            │
│                                                                        │
│  ┌──────────────────┐    ┌──────────────────┐                         │
│  │ Request Logger   │    │ Provider Router  │                         │
│  │ (NO content      │    │                  │                         │
│  │  logging — only  │    │ • Ollama (local) │──► Data does not leave  │
│  │  metadata: model,│    │ • OpenAI         │    your infrastructure  │
│  │  token count,    │    │ • Anthropic      │                         │
│  │  latency)        │    │ • Custom         │                         │
│  └──────────────────┘    └──────────────────┘                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Self-hosted AI (Ollama)

For maximum privacy, GoTipe supports self-hosted Ollama: data does not leave the local network:

```typescript
// Ollama configuration: data stays on your server
const editor = new GoTipeEditor({
  ai: {
    provider: 'ollama',
    config: {
      baseUrl: 'http://localhost:11434',  // Your Ollama instance
      model: 'llama3.1:8b',
      // No data is sent to the internet
    },
  },
});
```

### Guarantees by provider

| Aspect | Self-hosted (Ollama) | OpenAI API | Anthropic API |
|--------|---------------------|------------|---------------|
| Data leaves the infrastructure | No | Yes (API call) | Yes (API call) |
| Training on user data | No | No (API ToS) | No (API ToS) |
| Request retention by the provider | No | 30 days (abuse) | 30 days (safety) |
| Compliance-ready | Yes | SOC 2 Type II | SOC 2 Type II |
| Recommended for HIPAA | Yes | With BAA | With BAA |
| Model control | Full | None | None |

### PII Detection & Redaction

```rust
// crates/gotipe-ai/src/privacy/pii.rs

use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    static ref EMAIL_RE: Regex = Regex::new(
        r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
    ).unwrap();

    static ref PHONE_RE: Regex = Regex::new(
        r"(\+?\d{1,3}[\s\-]?)?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{2,4}"
    ).unwrap();

    static ref CREDIT_CARD_RE: Regex = Regex::new(
        r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b"
    ).unwrap();

    // INN (Russian taxpayer ID)
    static ref INN_RE: Regex = Regex::new(
        r"\b\d{10}(\d{2})?\b"
    ).unwrap();
}

/// PII detection configuration
pub struct PiiConfig {
    pub detect_emails: bool,
    pub detect_phones: bool,
    pub detect_credit_cards: bool,
    pub detect_inn: bool,
    pub custom_patterns: Vec<Regex>,
    /// Mode: Redact (replace with [REDACTED]) or Warn (flag, do not replace)
    pub mode: PiiMode,
}

pub enum PiiMode {
    /// Automatically replace PII with a placeholder
    Redact,
    /// Warn the user; data is sent with their consent
    Warn,
    /// No scanning (for self-hosted)
    Disabled,
}

impl PiiDetector {
    /// Scans text for PII
    pub fn scan(&self, text: &str) -> Vec<PiiMatch> {
        let mut matches = Vec::new();

        if self.config.detect_emails {
            for m in EMAIL_RE.find_iter(text) {
                matches.push(PiiMatch {
                    kind: PiiKind::Email,
                    range: m.start()..m.end(),
                    text: m.as_str().to_string(),
                });
            }
        }

        if self.config.detect_credit_cards {
            for m in CREDIT_CARD_RE.find_iter(text) {
                if luhn_check(m.as_str()) {
                    matches.push(PiiMatch {
                        kind: PiiKind::CreditCard,
                        range: m.start()..m.end(),
                        text: m.as_str().to_string(),
                    });
                }
            }
        }

        // ... likewise for phone, INN, custom patterns

        matches
    }

    /// PII redaction: replacement with a placeholder
    pub fn redact(&self, text: &str) -> String {
        let matches = self.scan(text);
        let mut result = text.to_string();

        // Replace from the end so indices do not shift
        for m in matches.iter().rev() {
            let placeholder = match m.kind {
                PiiKind::Email => "[EMAIL_REDACTED]",
                PiiKind::Phone => "[PHONE_REDACTED]",
                PiiKind::CreditCard => "[CARD_REDACTED]",
                PiiKind::Inn => "[INN_REDACTED]",
                PiiKind::Custom(ref name) => "[REDACTED]",
            };
            result.replace_range(m.range.clone(), placeholder);
        }

        result
    }
}
```

**PII configuration on the client:**

```typescript
const editor = new GoTipeEditor({
  ai: {
    privacy: {
      piiDetection: 'redact',    // 'redact' | 'warn' | 'disabled'
      detectEmails: true,
      detectPhones: true,
      detectCreditCards: true,
      customPatterns: [
        /ИНН\s*\d{10,12}/g,     // INN (Russian taxpayer ID)
        /СНИЛС\s*\d{3}-\d{3}-\d{3}\s*\d{2}/g,  // SNILS (Russian pension insurance number)
      ],
    },
  },
});
```

---

## Server Security

The GoTipe Cloud server side is written in Go (API Gateway, Sync Server, AI Proxy). For the architecture details, see [01-architecture.md](01-architecture.md) and [10-cloud.md](10-cloud.md).

### Go API Hardening

```go
// server/main.go — security middleware chain

func setupServer() *chi.Mux {
    r := chi.NewRouter()

    // 1. Request ID for tracing
    r.Use(middleware.RequestID)

    // 2. Panic recovery: do not expose the stack trace to the client
    r.Use(middleware.Recoverer)

    // 3. Security headers
    r.Use(securityHeaders)

    // 4. CORS — strict origin checking
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   allowedOrigins, // From config, NOT "*"
        AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID"},
        ExposedHeaders:   []string{"X-Request-ID"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

    // 5. Rate limiting (by IP + API key)
    r.Use(rateLimiter.Handler)

    // 6. Request size limit (10MB max)
    r.Use(middleware.RequestSize(10 * 1024 * 1024))

    // 7. Timeout (30 seconds)
    r.Use(middleware.Timeout(30 * time.Second))

    return r
}

func securityHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("X-XSS-Protection", "0") // Disabled (CSP is used instead)
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
        next.ServeHTTP(w, r)
    })
}
```

### Rate Limiting

| Endpoint | Limit (Starter) | Limit (Pro) | Limit (Enterprise) |
|----------|-----------------|-------------|---------------------|
| REST API (general) | 100 req/min | 1000 req/min | Custom |
| WebSocket connections | 10 concurrent | 100 concurrent | Custom |
| WebSocket messages | 60 msg/s per conn | 120 msg/s per conn | Custom |
| AI Proxy | 20 req/min | 200 req/min | Custom |
| Export | 10 req/min | 60 req/min | Custom |
| Auth (login) | 5 req/min per IP | 5 req/min per IP | 5 req/min per IP |

The rate limiter uses Valkey (Redis) with a sliding window algorithm:

```go
// server/ratelimit/limiter.go

type RateLimiter struct {
    client *valkey.Client
}

func (rl *RateLimiter) Allow(key string, limit int, window time.Duration) (bool, error) {
    ctx := context.Background()
    now := time.Now().UnixMilli()
    windowStart := now - window.Milliseconds()

    pipe := rl.client.Pipeline()

    // Sliding window: remove stale entries, add the current one, count
    pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(windowStart, 10))
    pipe.ZAdd(ctx, key, valkey.Z{Score: float64(now), Member: now})
    countCmd := pipe.ZCard(ctx, key)
    pipe.Expire(ctx, key, window)

    _, err := pipe.Exec(ctx)
    if err != nil {
        return false, err
    }

    return countCmd.Val() <= int64(limit), nil
}
```

### SQL Injection Prevention

GoTipe uses parameterized queries through `sqlx` (Go). Raw SQL queries are forbidden by the code review policy.

```go
// Correct: parameterized query
func GetDocument(ctx context.Context, db *sqlx.DB, id string) (*Document, error) {
    var doc Document
    err := db.GetContext(ctx, &doc,
        "SELECT id, title, content, created_at FROM documents WHERE id = $1", id)
    return &doc, err
}

// FORBIDDEN: string concatenation (caught by the linter)
// query := "SELECT * FROM documents WHERE id = '" + id + "'"
```

### WebSocket Security

```go
// server/ws/upgrade.go

var upgrader = websocket.Upgrader{
    // 1. Check Origin
    CheckOrigin: func(r *http.Request) bool {
        origin := r.Header.Get("Origin")
        return isAllowedOrigin(origin)
    },
    // 2. Message size
    ReadBufferSize:  4096,
    WriteBufferSize: 4096,
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    // 3. JWT validation before the upgrade
    claims, err := validateJWT(r)
    if err != nil {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // 4. Document permission check
    docID := chi.URLParam(r, "documentID")
    if !hasDocPermission(claims, docID, "read") {
        http.Error(w, "Forbidden", http.StatusForbidden)
        return
    }

    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer conn.Close()

    // 5. Message size limit
    conn.SetReadLimit(maxMessageSize) // 1MB

    // 6. Ping/pong to detect dead connections
    conn.SetReadDeadline(time.Now().Add(pongWait))
    conn.SetPongHandler(func(string) error {
        conn.SetReadDeadline(time.Now().Add(pongWait))
        return nil
    })

    // 7. Per-connection rate limiting
    limiter := rate.NewLimiter(rate.Limit(120), 10) // 120 msg/s, burst 10

    for {
        _, message, err := conn.ReadMessage()
        if err != nil {
            break
        }

        if !limiter.Allow() {
            // Rate limit exceeded: send a warning
            conn.WriteJSON(ErrorMsg{Code: "RATE_LIMITED"})
            continue
        }

        handleCrdtMessage(claims, docID, message)
    }
}
```

### DDoS Mitigation

| Level | Mechanism | Implementation |
|---------|----------|------------|
| L3/L4 | IP-based rate limiting | Cloudflare / iptables |
| L7 | Request rate limiting | Go middleware (Valkey) |
| WebSocket | Connection + message limits | Per-IP connection limit, per-conn msg limit |
| Application | Payload size limits | 10MB request body, 1MB WebSocket message |
| Infrastructure | Auto-scaling | Kubernetes HPA on CPU/memory |

---

## Client Security

### WASM Sandbox

WebAssembly runs in the browser sandbox: a WASM module has no direct access to the DOM, the network, or the file system. All interaction goes through an explicit JS interop.

```
┌─────────────────────────────────────────────────────┐
│                    Browser                            │
│                                                     │
│  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │   JavaScript         │  │   WASM Sandbox      │  │
│  │                      │  │                     │  │
│  │  • DOM access        │◄─┤  • gotipe-core      │  │
│  │  • Network (fetch)   │  │  • gotipe-crdt      │  │
│  │  • Clipboard API     │  │  • gotipe-ai        │  │
│  │  • localStorage      │  │  • gotipe-export    │  │
│  │                      │──►│                     │  │
│  │  wasm-bindgen bridge │  │  No access to:      │  │
│  │  (typed interface)   │  │  • DOM              │  │
│  │                      │  │  • Network          │  │
│  │                      │  │  • File system      │  │
│  │                      │  │  • globals          │  │
│  └──────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**WASM sandbox guarantees:**
- Linear memory: a WASM module works with its own linear memory, isolated from the JS heap
- No direct system call access: all I/O goes through imports from JS
- Bounds checking: access outside linear memory causes a trap (not undefined behavior)
- Rust memory safety: compile-time guarantees against buffer overflow, use-after-free, data races

### Clipboard Security

Paste handling is one of the main XSS vectors in rich text editors:

```typescript
// packages/core/src/clipboard/paste-handler.ts

export class PasteHandler {
  private sanitizer: HtmlSanitizer;

  async handlePaste(event: ClipboardEvent): Promise<Block[]> {
    event.preventDefault();

    const items = event.clipboardData?.items;
    if (!items) return [];

    // Priority: plain text > sanitized HTML > files
    const plainText = event.clipboardData?.getData('text/plain');
    const html = event.clipboardData?.getData('text/html');

    if (html) {
      // 1. Sanitize HTML through Rust WASM
      const sanitized = this.sanitizer.sanitize(html);

      // 2. Parse the sanitized HTML into Block[]
      const blocks = wasmModule.html_to_blocks(sanitized);

      // 3. Validate blocks against the schema
      const validated = blocks.filter(block =>
        wasmModule.validate_block(block)
      );

      return validated;
    }

    if (plainText) {
      // Plain text is safe, no HTML parsing
      return this.textToBlocks(plainText);
    }

    // File paste (images) — validate MIME type
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        return this.handleImagePaste(item);
      }
    }

    return [];
  }

  private handleImagePaste(item: DataTransferItem): Promise<Block[]> {
    const file = item.getAsFile();
    if (!file) return Promise.resolve([]);

    // Validate: max size 10MB, allowed MIME types only
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      console.warn('GoTipe: rejected paste — invalid image type or size');
      return Promise.resolve([]);
    }

    // Upload through a secure endpoint, get a URL
    return this.uploadAndCreateImageBlock(file);
  }
}
```

### iframe Sandboxing

If GoTipe is embedded in an iframe (for example, for preview), the recommended setup is:

```html
<iframe
  src="https://editor.gotipe.com/embed/doc_abc123"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
  loading="lazy"
  style="border: none; width: 100%; height: 600px;"
></iframe>
```

| sandbox flag | Allowed | Rationale |
|-------------|-----------|-------------|
| `allow-scripts` | Yes | WASM and JS execution |
| `allow-same-origin` | Yes | API requests to GoTipe Cloud |
| `allow-forms` | No | The editor does not use HTML forms |
| `allow-popups` | No | Prevents popup-based attacks |
| `allow-top-navigation` | No | The iframe cannot redirect the parent |

---

## Dependency Security

### Supply Chain Security

GoTipe uses two package ecosystems: crates.io (Rust) and npm (TypeScript). Both require monitoring.

#### cargo audit (Rust)

```bash
# CI pipeline: runs on every PR
cargo install cargo-audit
cargo audit

# Automatic advisory updates
cargo audit fix
```

#### npm audit (TypeScript)

```bash
# CI pipeline
npm audit --omit=dev

# Automatic fixing
npm audit fix
```

### CI Pipeline Security

```yaml
# .github/workflows/security.yml

name: Security Audit
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 8 * * 1'  # Every Monday

jobs:
  rust-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rustsec/audit-check@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  npm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm audit --audit-level=moderate

  sbom-generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate SBOM (Rust)
        run: cargo install cargo-cyclonedx && cargo cyclonedx --all
      - name: Generate SBOM (npm)
        run: npx @cyclonedx/cyclonedx-npm --output-file npm-sbom.json
      - uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: |
            *-bom.xml
            npm-sbom.json

  license-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check Rust licenses
        run: |
          cargo install cargo-deny
          cargo deny check licenses
      - name: Check npm licenses
        run: npx license-checker --failOn 'GPL-3.0;AGPL-3.0'
```

### SBOM (Software Bill of Materials)

GoTipe generates an SBOM in CycloneDX format for every release:

| Component | Format | Contents |
|-----------|--------|-----------|
| Rust crates | CycloneDX XML | All direct and transitive dependencies |
| npm packages | CycloneDX JSON | All production dependencies |
| Go modules | CycloneDX JSON | Server-side dependencies |
| WASM binary | SHA-256 hash | Integrity verification |

### Lockfile Policy

| Ecosystem | Lockfile | Policy |
|-----------|----------|--------|
| Rust | `Cargo.lock` | Committed, exact versions |
| npm | `package-lock.json` | Committed, exact versions |
| Go | `go.sum` | Committed, hash verification |

**Rule:** dependabot / renovate automatically create PRs for updates. Updates with security advisories are merged automatically after CI passes.

---

## Compliance

### SOC 2 Type II

GoTipe Cloud undergoes a SOC 2 Type II audit (planned for v1.0):

| Principle | GoTipe controls |
|---------|-----------------|
| **Security** | Encryption at rest/transit, RBAC, API key management, audit logging |
| **Availability** | Multi-region deployment, health checks, incident response SLA |
| **Processing Integrity** | CRDT mathematical correctness, schema validation, input sanitization |
| **Confidentiality** | Data isolation per organization, encryption, access controls |
| **Privacy** | GDPR compliance, data minimization, retention policies |

### GDPR

| Requirement | Implementation | Status |
|------------|------------|--------|
| Consent management | Cookie banner API, data processing agreement | Done |
| Right to access (Art. 15) | Data export API (`GET /api/v1/users/me/data`) | Done |
| Right to deletion (Art. 17) | Data deletion API + 72h SLA | Done |
| Right to portability (Art. 20) | JSON export of all documents | Done |
| Data breach notification (Art. 33) | Incident response plan, 72h notification | Documented |
| DPO contact | privacy@gotipe.com | Configured |
| Data Processing Agreement | DPA template for Enterprise | Done |

### HIPAA (Enterprise)

To process Protected Health Information (PHI), GoTipe Enterprise provides:

| HIPAA requirement | Implementation |
|------------------|------------|
| BAA (Business Associate Agreement) | Signed with Enterprise customers |
| Encryption (§164.312(a)(2)(iv)) | AES-256-GCM at rest, TLS 1.3 in transit |
| Access controls (§164.312(a)(1)) | RBAC, per-document permissions, MFA |
| Audit controls (§164.312(b)) | Full audit log of all operations |
| Integrity controls (§164.312(c)(1)) | CRDT integrity verification, checksums |
| Transmission security (§164.312(e)(1)) | TLS 1.3 for all connections |
| Self-hosted option | PHI does not leave the customer's infrastructure |
| AI opt-out | AI disabled, or self-hosted Ollama only |

### Data Residency

GoTipe Cloud supports choosing the region where data is stored:

| Region | Location | Availability |
|--------|-------------|-------------|
| `eu-central` | Falkenstein/Nuremberg, Germany (Hetzner FSN/NBG) | GA |
| `us-east` | Ashburn, Virginia, USA (Hetzner ASH) | GA |
| `us-west` | Hillsboro, Oregon, USA (Hetzner HIL) | Planned |
| `ap-southeast` | Singapore (Hetzner SIN) | Planned |
| Self-hosted | Any | GA |

**Guarantee:** data created in the `eu-central` region never leaves the EU. Sync server, database, R2: everything stays within one region.

### Audit Logging

All security-relevant events are written to the audit log:

```go
// server/audit/logger.go

type AuditEvent struct {
    ID          string    `json:"id"`
    Timestamp   time.Time `json:"timestamp"`
    ActorID     string    `json:"actor_id"`     // User ID or "system"
    ActorIP     string    `json:"actor_ip"`     // Hashed IP (privacy)
    Action      string    `json:"action"`       // "document.read", "user.login", etc.
    ResourceType string   `json:"resource_type"` // "document", "api_key", "user"
    ResourceID  string    `json:"resource_id"`
    Result      string    `json:"result"`       // "success", "denied", "error"
    Metadata    map[string]string `json:"metadata"`
}
```

| Event | Action | Description |
|---------|--------|----------|
| Login | `auth.login` | Email, OAuth provider, IP |
| Failed login | `auth.login_failed` | Reason for refusal, IP |
| API key creation | `api_key.create` | Key prefix, scopes |
| API key revocation | `api_key.revoke` | Key prefix |
| Document access | `document.read` | Document ID |
| Document editing | `document.edit` | Document ID, operation count |
| Document deletion | `document.delete` | Document ID |
| Permission change | `permission.change` | Document ID, target user, old/new permission |
| AI request | `ai.request` | Provider, model, token count (no content) |
| Document export | `export.create` | Document ID, format |
| Data deletion request | `gdpr.deletion_request` | User ID |

---

## Incident Response

### Security Disclosure Policy

GoTipe follows the principle of responsible disclosure:

**Contact:** security@gotipe.com
**PGP Key:** [https://gotipe.com/.well-known/security.txt](https://gotipe.com/.well-known/security.txt)

### Process

```
┌──────────────────────────────────────────────────────────────┐
│                 INCIDENT RESPONSE PROCESS                     │
│                                                              │
│  1. REPORT         2. TRIAGE           3. FIX                │
│  ┌──────────┐     ┌──────────────┐    ┌──────────────┐      │
│  │ security │     │ Severity     │    │ Patch        │      │
│  │ @gotipe  │────►│ assessment   │───►│ development  │      │
│  │ .com     │     │ (24h SLA)    │    │              │      │
│  └──────────┘     └──────────────┘    └──────┬───────┘      │
│                                              │               │
│  4. RELEASE        5. DISCLOSE         6. POST-MORTEM       │
│  ┌──────────────┐ ┌──────────────┐    ┌──────────────┐      │
│  │ Security     │ │ Public       │    │ Root cause   │      │
│  │ patch        │─►│ advisory     │───►│ analysis     │      │
│  │ release      │ │ (CVE if      │    │ + process    │      │
│  │              │ │  applicable) │    │ improvement  │      │
│  └──────────────┘ └──────────────┘    └──────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

### SLA by severity

| Severity | Description | Response SLA | Fix SLA | Example |
|----------|----------|-------------|---------|--------|
| **Critical** | RCE, data breach, auth bypass | 4 hours | 24 hours | SQL injection, CRDT data corruption |
| **High** | XSS, privilege escalation, data leak | 24 hours | 72 hours | Stored XSS, API key exposure |
| **Medium** | CSRF, information disclosure, DoS | 72 hours | 7 days | CSRF on settings, error stack trace leak |
| **Low** | Minor info leak, best practice violation | 7 days | 30 days | Version disclosure, missing security header |

### CVE Process

1. Receive the report at security@gotipe.com
2. Acknowledge receipt within 24 hours
3. Assess severity and impact
4. Develop and test the patch
5. Coordinate the disclosure timeline with the reporter
6. Release the patch + security advisory
7. Request a CVE ID (if applicable) through the MITRE CNA
8. Public disclosure 30 days after the patch (or earlier, by agreement)

### Bug Bounty

| Severity | Reward |
|----------|--------|
| Critical | $500 - $2,000 |
| High | $200 - $500 |
| Medium | $50 - $200 |
| Low | Hall of Fame |

**Scope:** gotipe.com, api.gotipe.com, sync.gotipe.com, npm packages, Rust crates
**Out of scope:** Social engineering, physical access, third-party services

---

## Security Checklist

### Self-hosted Deployment

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    SECURITY CHECKLIST — Self-hosted                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Infrastructure:                                                         │
│  [ ] TLS certificates configured (Let's Encrypt / custom CA)            │
│  [ ] Firewall: only ports 443 (HTTPS) and 8443 (WSS) are open          │
│  [ ] PostgreSQL is not public (bind localhost or private network)       │
│  [ ] Valkey (Redis) is not reachable from outside + requirepass         │
│  [ ] R2 bucket — private, no public access                               │
│  [ ] Docker images pinned by SHA256 digest                               │
│  [ ] Host OS is up to date (security patches)                            │
│                                                                          │
│  Application:                                                            │
│  [ ] GOTIPE_SECRET_KEY is set (min 32 bytes, crypto/rand)               │
│  [ ] GOTIPE_ALLOWED_ORIGINS is configured (not "*")                     │
│  [ ] API keys use scoped permissions                                     │
│  [ ] Rate limiting is enabled                                            │
│  [ ] Audit logging is enabled                                            │
│  [ ] Default admin password is changed                                   │
│  [ ] Health check endpoint (/healthz) does not expose sensitive info     │
│                                                                          │
│  AI (if used):                                                           │
│  [ ] AI provider API keys are stored in env vars / a secrets manager     │
│  [ ] PII detection is enabled (mode: redact or warn)                    │
│  [ ] For confidential data: self-hosted Ollama                           │
│  [ ] AI request logging does not contain content                         │
│                                                                          │
│  Database:                                                                │
│  [ ] PostgreSQL: SSL mode = require                                       │
│  [ ] PostgreSQL: separate user with minimal privileges                   │
│  [ ] Backups are encrypted                                                │
│  [ ] Backup restore is tested                                             │
│                                                                          │
│  Monitoring:                                                              │
│  [ ] Alerting on failed auth attempts (>10/min)                          │
│  [ ] Alerting on rate limit hits                                          │
│  [ ] Log rotation is configured                                           │
│  [ ] Audit logs are shipped to a SIEM (optional)                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### GoTipe Cloud Deployment

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    SECURITY CHECKLIST — Cloud                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Account:                                                                │
│  [ ] MFA is enabled for the owner account                               │
│  [ ] API keys have an expiration date                                    │
│  [ ] Unused API keys are revoked                                        │
│  [ ] API keys are not included in client-side code                       │
│  [ ] RBAC is configured: minimum necessary roles                        │
│                                                                          │
│  Integration:                                                            │
│  [ ] CSP headers are configured on the application side                  │
│  [ ] CORS: GOTIPE_ALLOWED_ORIGINS lists specific domains                 │
│  [ ] The WebSocket endpoint is connected over WSS (not WS)              │
│  [ ] JWT token rotation is configured (refresh token)                    │
│  [ ] Error handling does not expose internal details to the client       │
│                                                                          │
│  AI:                                                                     │
│  [ ] AI provider is chosen according to compliance requirements          │
│  [ ] PII detection is configured                                         │
│  [ ] The AI provider's data retention policy has been reviewed           │
│  [ ] Users are notified about the use of AI                             │
│                                                                          │
│  Data:                                                                   │
│  [ ] Data residency region is chosen                                      │
│  [ ] Data retention policy is configured                                  │
│  [ ] DPA (Data Processing Agreement) is signed (if GDPR applies)         │
│  [ ] Data export is tested (backup / migration)                          │
│                                                                          │
│  Compliance (if required):                                               │
│  [ ] SOC 2 report is requested from GoTipe                               │
│  [ ] HIPAA BAA is signed (for PHI data)                                 │
│  [ ] Audit logs are enabled and retrospectively available                │
│  [ ] Incident response contacts are configured                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Developer checklist (Extension Security)

| # | Check | Required? |
|---|---------|---------------|
| 1 | The extension does not use `eval()` or the `Function()` constructor | Required |
| 2 | The extension does not access `document.cookie` | Required |
| 3 | The extension does not make network requests to unknown domains | Required |
| 4 | HTML output goes through the sanitizer | Required |
| 5 | User input is validated against the schema | Required |
| 6 | Dependencies are checked with `npm audit` | Required |
| 7 | The extension declares the permissions it needs | Recommended |
| 8 | The extension has unit tests for edge cases (empty input, max size) | Recommended |
| 9 | The extension documents its security considerations | Recommended |

---

## Related documents

| Document | Relevance |
|----------|-----------|
| [01-architecture.md](01-architecture.md) | Overall system architecture, Rust/WASM core, server components |
| [02-collaboration.md](02-collaboration.md) | CRDT engine, sync protocol, WebSocket communication |
| [03-editor-core.md](03-editor-core.md) | Document model, schema engine, transforms, validation |
| [05-extensions.md](05-extensions.md) | Extension architecture, plugin host, permission model |
| [07-ai.md](07-ai.md) | AI integration, provider interface, context builder |
| [08-export-import.md](08-export-import.md) | Export engine, HTML sanitization on import |
| [09-sdk-and-api.md](09-sdk-and-api.md) | TypeScript API, type safety, error handling |
| [10-cloud.md](10-cloud.md) | Cloud architecture, API Gateway, storage layer, pricing |

---

> **Security questions:** security@gotipe.com
> **PGP Key:** [gotipe.com/.well-known/security.txt](https://gotipe.com/.well-known/security.txt)
> **Bug Bounty:** [gotipe.com/security/bounty](https://gotipe.com/security/bounty)
