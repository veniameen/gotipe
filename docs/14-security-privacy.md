# GoTipe — Безопасность и конфиденциальность

> Security by design: безопасность встроена в каждый слой GoTipe — от WASM sandbox на клиенте до encrypted storage на сервере. Данные пользователей не покидают контролируемый периметр без явного согласия.

---

## Содержание

- [Модель угроз (Threat Model)](#модель-угроз-threat-model)
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
- [Связанные документы](#связанные-документы)

---

## Модель угроз (Threat Model)

GoTipe оперирует в нескольких средах: браузер (WASM), server (Go/Rust), AI providers (внешние API). Каждая среда имеет свой набор угроз.

### Таблица угроз

| # | Угроза | Severity | Вектор атаки | Компонент | Mitigation |
|---|--------|----------|-------------|-----------|------------|
| T1 | XSS через editor output | **Critical** | Вставка `<script>` или `onerror` через контент | Client (render) | HTML sanitization в Rust core + JS fallback, CSP headers |
| T2 | HTML injection через paste | **High** | Clipboard содержит malicious HTML | Client (paste) | Paste sanitizer, allowlist элементов |
| T3 | CRDT operation tampering | **High** | Malicious peer отправляет invalid operations | CRDT Engine | Operation validation, schema enforcement, author verification |
| T4 | WASM memory exploits | **Medium** | Crafted input вызывает buffer overflow в WASM | WASM Core | Rust memory safety, WASM sandbox, bounds checking |
| T5 | SQL injection | **Critical** | Malformed API parameters | Server (Go) | Parameterized queries, ORM (sqlx), input validation |
| T6 | WebSocket hijacking | **High** | Перехват WS-соединения, replay attacks | Sync Server | WSS (TLS), JWT validation на handshake, origin check |
| T7 | API key leakage | **High** | Ключ попадает в client-side code или логи | API Gateway | Server-side only keys, key rotation, hash-based storage |
| T8 | AI data leakage | **High** | Конфиденциальные данные отправляются в LLM | AI Proxy | PII detection, self-hosted Ollama option, data flow audit |
| T9 | Supply chain attack | **Medium** | Compromised dependency (npm/crates.io) | Build pipeline | cargo audit, npm audit, lockfile pinning, SBOM |
| T10 | DDoS на sync server | **Medium** | Flood WebSocket connections или operations | Sync Server | Rate limiting, connection limits, IP throttling |
| T11 | Privilege escalation | **High** | User получает admin-права через API manipulation | API Gateway | RBAC enforcement, server-side authorization checks |
| T12 | Data exfiltration | **Critical** | Несанкционированный доступ к документам | Storage Layer | Encryption at rest (AES-256), access control, audit logging |
| T13 | CSRF атаки | **Medium** | Cross-site request к GoTipe API | API Gateway | SameSite cookies, CSRF tokens, Origin header validation |
| T14 | Malicious extensions | **Medium** | Third-party extension исполняет вредоносный код | Extension Host | Extension sandbox, permission model, review process |

### Диаграмма поверхности атаки

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

GoTipe использует многоуровневую защиту от XSS. Sanitization выполняется в Rust core (gotipe-export), что исключает bypass через JS-специфичные уязвимости.

#### Уровень 1: Rust-side sanitization

```rust
// crates/gotipe-export/src/html/sanitizer.rs

use std::collections::{HashMap, HashSet};

/// Allowlist элементов и атрибутов для HTML output
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

    /// Санитизация HTML-строки — удаляет всё, что не в allowlist
    pub fn sanitize(&self, html: &str) -> Result<String, SanitizeError> {
        let fragment = parse_html_fragment(html)?;
        let mut output = String::with_capacity(html.len());

        for node in fragment.walk() {
            match node {
                Node::Element(el) => {
                    if !self.allowed_elements.contains(el.tag.as_str()) {
                        // Элемент удаляется, но дочерние узлы сохраняются
                        continue;
                    }
                    self.sanitize_attrs(&el, &mut output)?;
                }
                Node::Text(text) => {
                    output.push_str(&escape_html(&text));
                }
                _ => {} // Comment, Doctype — удаляются
            }
        }
        Ok(output)
    }

    /// Проверка URI scheme — блокирует javascript:, data: и т.д.
    fn validate_uri(&self, uri: &str) -> bool {
        if let Some(scheme) = uri.split(':').next() {
            self.allowed_uri_schemes.contains(scheme.to_lowercase().as_str())
        } else {
            // Relative URI — допускается
            true
        }
    }
}
```

#### Уровень 2: JS-side sanitization (fallback)

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
  // Принудительно добавляем rel="noopener noreferrer" на все ссылки
  FORBID_CONTENTS: ['script', 'style', 'textarea'],
};

/**
 * Двойная sanitization: Rust (primary) + DOMPurify (fallback).
 * DOMPurify используется только если Rust sanitizer вернул ошибку.
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

Рекомендуемые CSP headers для приложений с GoTipe:

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

| Директива | Значение | Обоснование |
|-----------|----------|-------------|
| `script-src 'wasm-unsafe-eval'` | Разрешает WASM execution | Необходим для gotipe-wasm core |
| `style-src 'unsafe-inline'` | Разрешает inline styles | Editor использует inline styles для marks (color, highlight) |
| `connect-src wss://...` | WebSocket для collaboration | Sync server connection |
| `frame-src 'none'` | Запрещает iframe embedding | Предотвращает clickjacking |
| `object-src 'none'` | Запрещает plugins | Блокирует Flash, Java applets |

### Allowlists

#### Элементы (HTML tags)

| Категория | Разрешённые элементы |
|-----------|---------------------|
| Block | `p`, `h1`-`h6`, `blockquote`, `pre`, `hr`, `div` |
| List | `ul`, `ol`, `li` |
| Inline | `em`, `strong`, `del`, `u`, `code`, `a`, `br`, `span`, `sub`, `sup` |
| Table | `table`, `thead`, `tbody`, `tr`, `th`, `td` |
| Media | `img` (с валидацией src) |
| Запрещены | `script`, `style`, `iframe`, `object`, `embed`, `form`, `input`, `textarea`, `svg`, `math` |

#### Атрибуты (HTML attributes)

| Атрибут | Элементы | Валидация |
|---------|----------|-----------|
| `href` | `a` | Только `http:`, `https:`, `mailto:` — блокируется `javascript:` |
| `src` | `img` | Только `http:`, `https:` — блокируется `data:` в strict mode |
| `target` | `a` | Только `_blank` — принудительно добавляется `rel="noopener noreferrer"` |
| `style` | `span` | Только CSS properties из allowlist |
| `class` | `code` | Только `language-*` pattern |
| `data-*` | Все | Запрещены по умолчанию, явный allowlist для `data-language`, `data-color` |

---

## Input Validation

### Schema-based validation в Rust

Каждый документ GoTipe валидируется через schema, определённую в Rust core. Валидация выполняется на каждую операцию — нельзя вставить block, не описанный в schema. Подробности document model см. в [03-editor-core.md](03-editor-core.md).

```rust
// crates/gotipe-core/src/schema/validator.rs

use crate::schema::{Schema, BlockSpec, MarkSpec};
use crate::document::{Block, Mark, TextSpan};

/// Лимиты для предотвращения DoS через гигантские документы
pub struct ValidationLimits {
    /// Максимальная глубина вложенности блоков
    pub max_depth: usize,              // default: 12
    /// Максимальное количество блоков в документе
    pub max_blocks: usize,             // default: 10_000
    /// Максимальная длина текста в одном span
    pub max_text_length: usize,        // default: 100_000
    /// Максимальное количество marks на одном span
    pub max_marks_per_span: usize,     // default: 20
    /// Максимальный размер атрибута (bytes)
    pub max_attr_size: usize,          // default: 4_096
    /// Максимальный общий размер документа (bytes)
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

/// Валидатор документа — проверяет соответствие schema
pub struct DocumentValidator<'a> {
    schema: &'a Schema,
    limits: ValidationLimits,
}

impl<'a> DocumentValidator<'a> {
    pub fn validate_block(&self, block: &Block, depth: usize) -> Result<(), ValidationError> {
        // 1. Проверка глубины вложенности
        if depth > self.limits.max_depth {
            return Err(ValidationError::MaxDepthExceeded {
                max: self.limits.max_depth,
                actual: depth,
            });
        }

        // 2. Проверка типа блока — должен быть в schema
        let spec = self.schema.block_spec(&block.block_type)
            .ok_or(ValidationError::UnknownBlockType(block.block_type.clone()))?;

        // 3. Валидация атрибутов блока
        self.validate_block_attrs(block, spec)?;

        // 4. Валидация content (text spans, marks)
        self.validate_content(&block.content, spec)?;

        // 5. Рекурсивная валидация children
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
            // Атрибут должен быть объявлен в schema
            let attr_spec = spec.attrs.get(key.as_str())
                .ok_or(ValidationError::UnknownAttribute {
                    block_type: block.block_type.clone(),
                    attr: key.clone(),
                })?;

            // Проверка размера
            let attr_bytes = serde_json::to_vec(value)
                .map_err(|_| ValidationError::InvalidAttrValue)?;
            if attr_bytes.len() > self.limits.max_attr_size {
                return Err(ValidationError::AttrTooLarge {
                    attr: key.clone(),
                    max: self.limits.max_attr_size,
                });
            }

            // Проверка типа значения
            attr_spec.validate_value(value)?;
        }
        Ok(())
    }

    fn validate_mark(&self, mark: &Mark) -> Result<(), ValidationError> {
        let spec = self.schema.mark_spec(&mark.mark_type)
            .ok_or(ValidationError::UnknownMarkType(mark.mark_type.clone()))?;

        // Валидация атрибутов mark (например, href для link)
        for (key, value) in &mark.attrs {
            let attr_spec = spec.attrs.get(key.as_str())
                .ok_or(ValidationError::UnknownMarkAttribute {
                    mark_type: mark.mark_type.clone(),
                    attr: key.clone(),
                })?;
            attr_spec.validate_value(value)?;
        }

        // Специальная проверка для link marks — валидация URL
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

### Валидация на каждом уровне

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

CRDT engine (подробности в [02-collaboration.md](02-collaboration.md)) требует специальных мер безопасности, т.к. каждый peer может генерировать операции.

### Operation Validation

```rust
// crates/gotipe-crdt/src/security.rs

use crate::ops::CrdtOperation;
use crate::doc::CrdtDocument;

/// Валидация CRDT-операции перед применением
pub struct OperationValidator {
    /// Максимальный размер одной операции (bytes)
    max_op_size: usize,
    /// Максимальное количество операций в одном batch
    max_batch_size: usize,
    /// Rate limit: операций в секунду на peer
    max_ops_per_second: u32,
}

impl OperationValidator {
    /// Проверка операции перед merge в документ
    pub fn validate(
        &self,
        op: &CrdtOperation,
        doc: &CrdtDocument,
        peer_state: &PeerState,
    ) -> Result<(), CrdtSecurityError> {
        // 1. Размер операции
        let op_size = op.serialized_size();
        if op_size > self.max_op_size {
            return Err(CrdtSecurityError::OperationTooLarge {
                size: op_size,
                max: self.max_op_size,
            });
        }

        // 2. Author verification — PeerId соответствует authenticated user
        if !peer_state.is_authenticated(&op.peer_id) {
            return Err(CrdtSecurityError::UnauthorizedPeer(op.peer_id.clone()));
        }

        // 3. Causal ordering — операция ссылается на известные dependencies
        if !doc.version.contains(&op.dependencies) {
            return Err(CrdtSecurityError::InvalidCausalOrder);
        }

        // 4. Schema compliance — результат операции соответствует schema
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

| Индикатор | Порог | Действие |
|-----------|-------|----------|
| Operations per second | > 100 ops/s | Throttle + warning |
| Operations per second | > 500 ops/s | Temporary ban (60s) |
| Invalid operations | > 5 за 10 минут | Disconnect + log |
| Document size growth | > 1MB за 1 операцию | Reject operation |
| Causal order violations | > 3 подряд | Disconnect + alert |
| Replay attacks (duplicate ops) | Любой duplicate | Silent reject |

### Conflict Resolution Safety

CRDT-конфликты разрешаются детерминистически — результат одинаков на всех peers:

```
Peer A: insert("Hello") at position 0    ─┐
                                           ├──► Merge: "HelloWorld" (deterministic)
Peer B: insert("World") at position 0    ─┘    PeerId ordering определяет порядок

Правило: при concurrent inserts peer с лексикографически меньшим PeerId идёт первым.
Это математически гарантирует eventual consistency.
```

**Важно:** GoTipe CRDT не использует last-writer-wins для text content (только для block attributes). Это предотвращает потерю данных при concurrent editing.

---

## Authentication & Authorization

### API Key Management

API ключи хранятся как SHA-256 хэши в PostgreSQL. Плейнтекст ключа показывается пользователю один раз при создании.

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

#### Структура API ключа

```
gt_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
│  │    │
│  │    └── 32 символа random (crypto/rand)
│  └── Среда: live / test
└── Prefix: идентификатор GoTipe
```

| Поле | Описание |
|------|----------|
| `key_prefix` | Первые 8 символов (для display в UI: `gt_live_a1b2c3d4...`) |
| `key_hash` | SHA-256 хэш полного ключа |
| `scopes` | Массив разрешений: `["documents:read", "documents:write", "ai:use"]` |
| `expires_at` | Опциональная дата истечения |
| `rate_limit` | Custom rate limit (по умолчанию: plan limit) |

### JWT Tokens

JWT используются для browser-side аутентификации (WebSocket handshake, REST API из SPA).

```typescript
// Пример JWT payload для GoTipe Cloud
interface GoTipeJwtPayload {
  /** Subject — user ID */
  sub: string;
  /** Organization ID */
  org: string;
  /** Роль в организации */
  role: 'viewer' | 'commenter' | 'editor' | 'admin' | 'owner';
  /** Scopes — разрешённые действия */
  scopes: string[];
  /** Document-level permissions (опционально) */
  doc_permissions?: Record<string, 'read' | 'comment' | 'edit'>;
  /** Issued at */
  iat: number;
  /** Expiration (15 minutes) */
  exp: number;
}
```

**Политика JWT:**
- Access token TTL: 15 минут
- Refresh token TTL: 7 дней
- Signing algorithm: ES256 (ECDSA P-256)
- JWT хранится в `httpOnly` cookie (не в localStorage)
- Refresh rotation: каждый refresh token одноразовый

### RBAC (Role-Based Access Control)

| Роль | Документы | Комментарии | Редактирование | AI | Export | Настройки | Billing |
|------|-----------|-------------|----------------|-----|--------|-----------|---------|
| `viewer` | Read | Read | -- | -- | Read | -- | -- |
| `commenter` | Read | Read/Write | -- | -- | Read | -- | -- |
| `editor` | Read | Read/Write | Read/Write | Use | Read/Write | -- | -- |
| `admin` | CRUD | CRUD | Read/Write | Use + Config | CRUD | Read/Write | Read |
| `owner` | CRUD | CRUD | Read/Write | Use + Config | CRUD | CRUD | CRUD |

### Per-Document Permissions

Помимо organization-level roles, GoTipe поддерживает per-document permissions:

```typescript
// Per-document access control
const docPermission = await gotipeCloud.documents.setPermission({
  documentId: 'doc_abc123',
  userId: 'user_xyz789',
  permission: 'edit', // 'read' | 'comment' | 'edit'
  expiresAt: new Date('2025-12-31'),
});
```

Enforcement выполняется на server-side — WebSocket handshake проверяет permission перед подключением к room.

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

GoTipe реализует GDPR by design:

| Принцип GDPR | Реализация в GoTipe |
|---------------|---------------------|
| **Lawfulness** | Обработка данных только с согласия или на основе контракта |
| **Purpose limitation** | Документы хранятся только для предоставления сервиса collaboration |
| **Data minimization** | Собираются только необходимые данные: email, name, document content |
| **Accuracy** | Пользователи могут обновить свои данные через API |
| **Storage limitation** | Configurable retention policy, auto-delete неактивных документов |
| **Integrity & confidentiality** | Encryption at rest + in transit |
| **Accountability** | Audit logging всех операций с данными |

### Data Minimization

GoTipe Cloud собирает минимум данных:

| Данные | Собирается | Цель | Retention |
|--------|-----------|------|-----------|
| Email | Да | Аутентификация, уведомления | До удаления аккаунта |
| Имя | Да | Отображение в collaboration | До удаления аккаунта |
| IP-адрес | Rate limiting only | Безопасность | 24 часа |
| Document content | Да | Сервис | Policy клиента |
| Cursor positions | Transient | Awareness (collaboration) | В памяти, не персистится |
| AI prompts | Нет (по умолчанию) | -- | Не хранятся |
| Usage metrics | Агрегированные | Billing, analytics | 90 дней |

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
│  │  DEK зашифрован через KEK (Key Encryption Key)          │  │
│  │  KEK хранится в: AWS KMS / HashiCorp Vault / env var    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  S3 (CRDT snapshots, exported files)                           │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  SSE-S3 (server-side encryption) или SSE-KMS            │  │
│  │  Bucket policy: deny non-TLS requests                   │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

#### In Transit (TLS 1.3)

| Соединение | Протокол | Минимальная версия |
|------------|----------|-------------------|
| Browser → API Gateway | HTTPS | TLS 1.2 (prefer 1.3) |
| Browser → Sync Server | WSS | TLS 1.2 (prefer 1.3) |
| API Gateway → PostgreSQL | TLS | TLS 1.2 |
| API Gateway → Valkey | TLS | TLS 1.2 |
| AI Proxy → LLM Provider | HTTPS | TLS 1.2 |
| Server → S3 | HTTPS | TLS 1.2 |

### Data Retention & Right to Deletion

```typescript
// Пример: запрос на удаление данных пользователя (GDPR Article 17)
const deletion = await gotipeCloud.admin.requestDataDeletion({
  userId: 'user_xyz789',
  // Опции:
  deleteDocuments: true,         // Удалить все документы, где user — единственный owner
  anonymizeCollabHistory: true,  // Заменить userId на "deleted_user" в CRDT history
  deleteApiKeys: true,           // Отозвать все API ключи
  deleteExports: true,           // Удалить сгенерированные файлы из S3
});

// Результат: deletion выполняется в течение 72 часов
// Возвращается confirmation token для отслеживания статуса
```

**Политика retention:**

| Тип данных | Self-hosted | Cloud Starter | Cloud Pro | Cloud Enterprise |
|------------|-------------|---------------|-----------|------------------|
| Документы | Без ограничений | 1 год после last edit | Без ограничений | Configurable |
| CRDT History | Без ограничений | 90 дней | 1 год | Configurable |
| Audit Logs | Без ограничений | 30 дней | 1 год | 7 лет |
| Exported Files | Без ограничений | 7 дней | 30 дней | Configurable |
| Backups | Ответственность клиента | 30 дней | 90 дней | Configurable |

---

## AI Privacy

AI-интеграция (подробности в [07-ai.md](07-ai.md)) создаёт особые риски для конфиденциальности. GoTipe реализует privacy by design для AI data flow.

### Data Flow для AI запросов

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
│  │              │    │   context (±3    │    │ • SSN/ИНН patterns │   │
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
│  │  logging — only  │    │ • Ollama (local) │──► Данные не покидают   │
│  │  metadata: model,│    │ • OpenAI         │    вашу инфраструктуру  │
│  │  token count,    │    │ • Anthropic      │                         │
│  │  latency)        │    │ • Custom         │                         │
│  └──────────────────┘    └──────────────────┘                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Self-hosted AI (Ollama)

Для максимальной конфиденциальности GoTipe поддерживает self-hosted Ollama — данные не покидают локальную сеть:

```typescript
// Конфигурация Ollama — данные остаются на вашем сервере
const editor = new GoTipeEditor({
  ai: {
    provider: 'ollama',
    config: {
      baseUrl: 'http://localhost:11434',  // Ваш Ollama instance
      model: 'llama3.1:8b',
      // Никакие данные не отправляются в интернет
    },
  },
});
```

### Гарантии по провайдерам

| Аспект | Self-hosted (Ollama) | OpenAI API | Anthropic API |
|--------|---------------------|------------|---------------|
| Данные покидают инфраструктуру | Нет | Да (API call) | Да (API call) |
| Обучение на данных пользователей | Нет | Нет (API ToS) | Нет (API ToS) |
| Хранение запросов провайдером | Нет | 30 дней (abuse) | 30 дней (safety) |
| Compliance-ready | Да | SOC 2 Type II | SOC 2 Type II |
| Рекомендация для HIPAA | Да | С BAA | С BAA |
| Контроль модели | Полный | Нет | Нет |

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

    // ИНН (Россия)
    static ref INN_RE: Regex = Regex::new(
        r"\b\d{10}(\d{2})?\b"
    ).unwrap();
}

/// Конфигурация PII detection
pub struct PiiConfig {
    pub detect_emails: bool,
    pub detect_phones: bool,
    pub detect_credit_cards: bool,
    pub detect_inn: bool,
    pub custom_patterns: Vec<Regex>,
    /// Режим: Redact (заменить на [REDACTED]) или Warn (пометить, не заменять)
    pub mode: PiiMode,
}

pub enum PiiMode {
    /// Автоматическая замена PII на placeholder
    Redact,
    /// Предупреждение пользователю, данные отправляются с согласия
    Warn,
    /// Без проверки (для self-hosted)
    Disabled,
}

impl PiiDetector {
    /// Сканирование текста на наличие PII
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

        // ... аналогично для phone, INN, custom patterns

        matches
    }

    /// Редактирование PII — замена на placeholder
    pub fn redact(&self, text: &str) -> String {
        let matches = self.scan(text);
        let mut result = text.to_string();

        // Замена с конца, чтобы индексы не сдвигались
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

**Конфигурация PII на клиенте:**

```typescript
const editor = new GoTipeEditor({
  ai: {
    privacy: {
      piiDetection: 'redact',    // 'redact' | 'warn' | 'disabled'
      detectEmails: true,
      detectPhones: true,
      detectCreditCards: true,
      customPatterns: [
        /ИНН\s*\d{10,12}/g,     // ИНН (Россия)
        /СНИЛС\s*\d{3}-\d{3}-\d{3}\s*\d{2}/g,
      ],
    },
  },
});
```

---

## Server Security

Серверная часть GoTipe Cloud написана на Go (API Gateway, Sync Server, AI Proxy). Подробности архитектуры см. в [01-architecture.md](01-architecture.md) и [10-cloud.md](10-cloud.md).

### Go API Hardening

```go
// server/main.go — security middleware chain

func setupServer() *chi.Mux {
    r := chi.NewRouter()

    // 1. Request ID для tracing
    r.Use(middleware.RequestID)

    // 2. Panic recovery — не раскрываем stack trace клиенту
    r.Use(middleware.Recoverer)

    // 3. Security headers
    r.Use(securityHeaders)

    // 4. CORS — strict origin checking
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   allowedOrigins, // Из конфига, НЕ "*"
        AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID"},
        ExposedHeaders:   []string{"X-Request-ID"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

    // 5. Rate limiting (по IP + API key)
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
        w.Header().Set("X-XSS-Protection", "0") // Отключён (CSP вместо этого)
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
| REST API (общий) | 100 req/min | 1000 req/min | Custom |
| WebSocket connections | 10 concurrent | 100 concurrent | Custom |
| WebSocket messages | 60 msg/s per conn | 120 msg/s per conn | Custom |
| AI Proxy | 20 req/min | 200 req/min | Custom |
| Export | 10 req/min | 60 req/min | Custom |
| Auth (login) | 5 req/min per IP | 5 req/min per IP | 5 req/min per IP |

Rate limiter использует Valkey (Redis) с sliding window algorithm:

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

    // Sliding window: удаляем устаревшие, добавляем текущий, считаем
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

GoTipe использует parameterized queries через `sqlx` (Go). Raw SQL queries запрещены code review policy.

```go
// Правильно — parameterized query
func GetDocument(ctx context.Context, db *sqlx.DB, id string) (*Document, error) {
    var doc Document
    err := db.GetContext(ctx, &doc,
        "SELECT id, title, content, created_at FROM documents WHERE id = $1", id)
    return &doc, err
}

// ЗАПРЕЩЕНО — конкатенация строк (ловится linter)
// query := "SELECT * FROM documents WHERE id = '" + id + "'"
```

### WebSocket Security

```go
// server/ws/upgrade.go

var upgrader = websocket.Upgrader{
    // 1. Проверка Origin
    CheckOrigin: func(r *http.Request) bool {
        origin := r.Header.Get("Origin")
        return isAllowedOrigin(origin)
    },
    // 2. Размер сообщения
    ReadBufferSize:  4096,
    WriteBufferSize: 4096,
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    // 3. JWT validation перед upgrade
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

    // 6. Ping/pong для обнаружения dead connections
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
            // Rate limit exceeded — отправляем warning
            conn.WriteJSON(ErrorMsg{Code: "RATE_LIMITED"})
            continue
        }

        handleCrdtMessage(claims, docID, message)
    }
}
```

### DDoS Mitigation

| Уровень | Механизм | Реализация |
|---------|----------|------------|
| L3/L4 | IP-based rate limiting | Cloudflare / iptables |
| L7 | Request rate limiting | Go middleware (Valkey) |
| WebSocket | Connection + message limits | Per-IP connection limit, per-conn msg limit |
| Application | Payload size limits | 10MB request body, 1MB WebSocket message |
| Infrastructure | Auto-scaling | Kubernetes HPA на CPU/memory |

---

## Client Security

### WASM Sandbox

WebAssembly выполняется в sandbox браузера — WASM module не имеет прямого доступа к DOM, network, файловой системе. Все взаимодействия проходят через явный JS interop.

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
│  │  wasm-bindgen bridge │  │  Нет доступа к:     │  │
│  │  (typed interface)   │  │  • DOM              │  │
│  │                      │  │  • Network          │  │
│  │                      │  │  • File system      │  │
│  │                      │  │  • globals          │  │
│  └──────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Гарантии WASM sandbox:**
- Линейная память — WASM module работает с собственным linear memory, изолированным от JS heap
- Нет прямого system call доступа — все I/O через imports из JS
- Bounds checking — доступ за пределами linear memory вызывает trap (не undefined behavior)
- Rust memory safety — compile-time гарантии отсутствия buffer overflow, use-after-free, data races

### Clipboard Security

Paste handling — один из главных векторов XSS в rich text editors:

```typescript
// packages/core/src/clipboard/paste-handler.ts

export class PasteHandler {
  private sanitizer: HtmlSanitizer;

  async handlePaste(event: ClipboardEvent): Promise<Block[]> {
    event.preventDefault();

    const items = event.clipboardData?.items;
    if (!items) return [];

    // Приоритет: plain text > sanitized HTML > files
    const plainText = event.clipboardData?.getData('text/plain');
    const html = event.clipboardData?.getData('text/html');

    if (html) {
      // 1. Sanitize HTML через Rust WASM
      const sanitized = this.sanitizer.sanitize(html);

      // 2. Parse sanitized HTML в Block[]
      const blocks = wasmModule.html_to_blocks(sanitized);

      // 3. Validate blocks через schema
      const validated = blocks.filter(block =>
        wasmModule.validate_block(block)
      );

      return validated;
    }

    if (plainText) {
      // Plain text — безопасно, без HTML parsing
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

    // Upload через secure endpoint, получаем URL
    return this.uploadAndCreateImageBlock(file);
  }
}
```

### iframe Sandboxing

Если GoTipe встраивается в iframe (например, для предпросмотра), рекомендуется:

```html
<iframe
  src="https://editor.gotipe.com/embed/doc_abc123"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
  loading="lazy"
  style="border: none; width: 100%; height: 600px;"
></iframe>
```

| sandbox flag | Разрешено | Обоснование |
|-------------|-----------|-------------|
| `allow-scripts` | Да | WASM и JS execution |
| `allow-same-origin` | Да | API requests к GoTipe Cloud |
| `allow-forms` | Нет | Editor не использует HTML forms |
| `allow-popups` | Нет | Предотвращает popup-based attacks |
| `allow-top-navigation` | Нет | iframe не может перенаправить parent |

---

## Dependency Security

### Supply Chain Security

GoTipe использует два package ecosystems: crates.io (Rust) и npm (TypeScript). Оба требуют мониторинга.

#### cargo audit (Rust)

```bash
# CI pipeline — запускается на каждый PR
cargo install cargo-audit
cargo audit

# Автоматические advisory updates
cargo audit fix
```

#### npm audit (TypeScript)

```bash
# CI pipeline
npm audit --omit=dev

# Автоматическое исправление
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
    - cron: '0 8 * * 1'  # Каждый понедельник

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

GoTipe генерирует SBOM в формате CycloneDX для каждого release:

| Компонент | Формат | Содержимое |
|-----------|--------|-----------|
| Rust crates | CycloneDX XML | Все прямые и transitive зависимости |
| npm packages | CycloneDX JSON | Все production-зависимости |
| Go modules | CycloneDX JSON | Server-side зависимости |
| WASM binary | SHA-256 hash | Integrity verification |

### Lockfile Policy

| Ecosystem | Lockfile | Policy |
|-----------|----------|--------|
| Rust | `Cargo.lock` | Committed, exact versions |
| npm | `package-lock.json` | Committed, exact versions |
| Go | `go.sum` | Committed, hash verification |

**Правило:** dependabot / renovate автоматически создают PR для обновлений. Обновления с security advisories merge автоматически после CI pass.

---

## Compliance

### SOC 2 Type II

GoTipe Cloud проходит SOC 2 Type II аудит (planned для v1.0):

| Принцип | Контроли GoTipe |
|---------|-----------------|
| **Security** | Encryption at rest/transit, RBAC, API key management, audit logging |
| **Availability** | Multi-region deployment, health checks, incident response SLA |
| **Processing Integrity** | CRDT mathematical correctness, schema validation, input sanitization |
| **Confidentiality** | Data isolation per organization, encryption, access controls |
| **Privacy** | GDPR compliance, data minimization, retention policies |

### GDPR

| Требование | Реализация | Статус |
|------------|------------|--------|
| Consent management | Cookie banner API, data processing agreement | Готово |
| Right to access (Art. 15) | Data export API (`GET /api/v1/users/me/data`) | Готово |
| Right to deletion (Art. 17) | Data deletion API + 72h SLA | Готово |
| Right to portability (Art. 20) | JSON export всех документов | Готово |
| Data breach notification (Art. 33) | Incident response plan, 72h notification | Документировано |
| DPO contact | privacy@gotipe.com | Настроено |
| Data Processing Agreement | Шаблон DPA для Enterprise | Готово |

### HIPAA (Enterprise)

Для обработки Protected Health Information (PHI) GoTipe Enterprise предоставляет:

| Требование HIPAA | Реализация |
|------------------|------------|
| BAA (Business Associate Agreement) | Подписывается с Enterprise клиентами |
| Encryption (§164.312(a)(2)(iv)) | AES-256-GCM at rest, TLS 1.3 in transit |
| Access controls (§164.312(a)(1)) | RBAC, per-document permissions, MFA |
| Audit controls (§164.312(b)) | Полный audit log всех операций |
| Integrity controls (§164.312(c)(1)) | CRDT integrity verification, checksums |
| Transmission security (§164.312(e)(1)) | TLS 1.3 для всех соединений |
| Self-hosted option | PHI не покидает инфраструктуру клиента |
| AI opt-out | Отключение AI или self-hosted Ollama only |

### Data Residency

GoTipe Cloud поддерживает выбор региона хранения данных:

| Регион | Расположение | Доступность |
|--------|-------------|-------------|
| `eu-west` | Frankfurt, Germany (AWS eu-central-1) | GA |
| `us-east` | Virginia, USA (AWS us-east-1) | GA |
| `us-west` | Oregon, USA (AWS us-west-2) | Planned |
| `ap-southeast` | Singapore (AWS ap-southeast-1) | Planned |
| Self-hosted | Любой | GA |

**Гарантия:** данные, созданные в регионе `eu-west`, никогда не покидают EU. Sync server, database, S3 — всё внутри одного региона.

### Audit Logging

Все security-relevant события записываются в audit log:

```go
// server/audit/logger.go

type AuditEvent struct {
    ID          string    `json:"id"`
    Timestamp   time.Time `json:"timestamp"`
    ActorID     string    `json:"actor_id"`     // User ID или "system"
    ActorIP     string    `json:"actor_ip"`     // Hashed IP (privacy)
    Action      string    `json:"action"`       // "document.read", "user.login", etc.
    ResourceType string   `json:"resource_type"` // "document", "api_key", "user"
    ResourceID  string    `json:"resource_id"`
    Result      string    `json:"result"`       // "success", "denied", "error"
    Metadata    map[string]string `json:"metadata"`
}
```

| Событие | Action | Описание |
|---------|--------|----------|
| Вход в систему | `auth.login` | Email, OAuth provider, IP |
| Неудачный вход | `auth.login_failed` | Причина отказа, IP |
| Создание API key | `api_key.create` | Key prefix, scopes |
| Отзыв API key | `api_key.revoke` | Key prefix |
| Доступ к документу | `document.read` | Document ID |
| Редактирование документа | `document.edit` | Document ID, operation count |
| Удаление документа | `document.delete` | Document ID |
| Изменение прав доступа | `permission.change` | Document ID, target user, old/new permission |
| AI запрос | `ai.request` | Provider, model, token count (без content) |
| Export документа | `export.create` | Document ID, format |
| Data deletion request | `gdpr.deletion_request` | User ID |

---

## Incident Response

### Security Disclosure Policy

GoTipe следует принципу responsible disclosure:

**Контакт:** security@gotipe.com
**PGP Key:** [https://gotipe.com/.well-known/security.txt](https://gotipe.com/.well-known/security.txt)

### Процесс

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

### SLA по Severity

| Severity | Описание | Response SLA | Fix SLA | Пример |
|----------|----------|-------------|---------|--------|
| **Critical** | RCE, data breach, auth bypass | 4 часа | 24 часа | SQL injection, CRDT data corruption |
| **High** | XSS, privilege escalation, data leak | 24 часа | 72 часа | Stored XSS, API key exposure |
| **Medium** | CSRF, information disclosure, DoS | 72 часа | 7 дней | CSRF на settings, error stack trace leak |
| **Low** | Minor info leak, best practice violation | 7 дней | 30 дней | Version disclosure, missing security header |

### CVE Process

1. Получение отчёта через security@gotipe.com
2. Подтверждение получения в течение 24 часов
3. Оценка severity и impact
4. Разработка и тестирование patch
5. Координация с reporter по timeline disclosure
6. Выпуск patch + security advisory
7. Запрос CVE ID (если applicable) через MITRE CNA
8. Публичное раскрытие через 30 дней после patch (или раньше, по согласованию)

### Bug Bounty

| Severity | Reward |
|----------|--------|
| Critical | $500 - $2,000 |
| High | $200 - $500 |
| Medium | $50 - $200 |
| Low | Hall of Fame |

**Scope:** gotipe.com, api.gotipe.com, sync.gotipe.com, npm packages, Rust crates
**Out of scope:** Social engineering, физический доступ, third-party services

---

## Security Checklist

### Self-hosted Deployment

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    SECURITY CHECKLIST — Self-hosted                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Infrastructure:                                                         │
│  [ ] TLS certificates настроены (Let's Encrypt / custom CA)             │
│  [ ] Firewall: только порты 443 (HTTPS) и 8443 (WSS) открыты           │
│  [ ] PostgreSQL не доступен извне (bind 127.0.0.1 или internal network) │
│  [ ] Valkey (Redis) не доступен извне + requirepass                     │
│  [ ] S3 bucket — private, no public access                               │
│  [ ] Docker images pinned по SHA256 digest                               │
│  [ ] Host OS обновлён (security patches)                                 │
│                                                                          │
│  Application:                                                            │
│  [ ] GOTIPE_SECRET_KEY установлен (min 32 bytes, crypto/rand)           │
│  [ ] GOTIPE_ALLOWED_ORIGINS настроен (не "*")                           │
│  [ ] API keys используют scoped permissions                              │
│  [ ] Rate limiting включён                                               │
│  [ ] Audit logging включён                                               │
│  [ ] Default admin password изменён                                      │
│  [ ] Health check endpoint (/healthz) не раскрывает sensitive info       │
│                                                                          │
│  AI (если используется):                                                 │
│  [ ] AI provider API keys хранятся в env vars / secrets manager          │
│  [ ] PII detection включён (mode: redact или warn)                      │
│  [ ] Для конфиденциальных данных: Ollama self-hosted                     │
│  [ ] AI request logging не содержит content                              │
│                                                                          │
│  Database:                                                                │
│  [ ] PostgreSQL: SSL mode = require                                       │
│  [ ] PostgreSQL: отдельный user с минимальными правами                   │
│  [ ] Backups зашифрованы                                                  │
│  [ ] Backup restore протестирован                                         │
│                                                                          │
│  Monitoring:                                                              │
│  [ ] Alerting на failed auth attempts (>10/min)                          │
│  [ ] Alerting на rate limit hits                                          │
│  [ ] Log rotation настроен                                                │
│  [ ] Audit logs отправляются в SIEM (опционально)                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### GoTipe Cloud Deployment

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    SECURITY CHECKLIST — Cloud                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Аккаунт:                                                                │
│  [ ] MFA включён для owner аккаунта                                     │
│  [ ] API keys имеют expiration date                                      │
│  [ ] Неиспользуемые API keys отозваны                                   │
│  [ ] API keys не включены в client-side code                             │
│  [ ] RBAC настроен: минимальные необходимые роли                        │
│                                                                          │
│  Интеграция:                                                             │
│  [ ] CSP headers настроены на стороне приложения                         │
│  [ ] CORS: GOTIPE_ALLOWED_ORIGINS указывает конкретные домены            │
│  [ ] WebSocket endpoint подключается через WSS (не WS)                  │
│  [ ] JWT token rotation настроен (refresh token)                         │
│  [ ] Error handling не раскрывает internal details клиенту               │
│                                                                          │
│  AI:                                                                     │
│  [ ] AI provider выбран в соответствии с compliance требованиями         │
│  [ ] PII detection настроен                                              │
│  [ ] Data retention policy AI провайдера проверена                       │
│  [ ] Пользователи уведомлены об использовании AI                        │
│                                                                          │
│  Data:                                                                   │
│  [ ] Data residency region выбран                                         │
│  [ ] Data retention policy настроена                                      │
│  [ ] DPA (Data Processing Agreement) подписан (если GDPR applicable)     │
│  [ ] Data export протестирован (backup / migration)                      │
│                                                                          │
│  Compliance (если требуется):                                            │
│  [ ] SOC 2 report запрошен у GoTipe                                      │
│  [ ] HIPAA BAA подписан (для PHI данных)                                │
│  [ ] Audit logs включены и ретроспективно доступны                       │
│  [ ] Incident response contacts настроены                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Checklist для разработчиков (Extension Security)

| # | Проверка | Обязательность |
|---|---------|---------------|
| 1 | Extension не использует `eval()` или `Function()` constructor | Required |
| 2 | Extension не обращается к `document.cookie` | Required |
| 3 | Extension не делает network requests к неизвестным доменам | Required |
| 4 | HTML output проходит через sanitizer | Required |
| 5 | User input валидируется через schema | Required |
| 6 | Зависимости проверены через `npm audit` | Required |
| 7 | Extension декларирует необходимые permissions | Recommended |
| 8 | Extension имеет unit tests для edge cases (empty input, max size) | Recommended |
| 9 | Extension документирует security considerations | Recommended |

---

## Связанные документы

| Документ | Relevance |
|----------|-----------|
| [01-architecture.md](01-architecture.md) | Общая архитектура системы, Rust/WASM core, server components |
| [02-collaboration.md](02-collaboration.md) | CRDT engine, sync protocol, WebSocket communication |
| [03-editor-core.md](03-editor-core.md) | Document model, schema engine, transforms, validation |
| [05-extensions.md](05-extensions.md) | Extension architecture, plugin host, permission model |
| [07-ai.md](07-ai.md) | AI integration, provider interface, context builder |
| [08-export-import.md](08-export-import.md) | Export engine, HTML sanitization при import |
| [09-sdk-and-api.md](09-sdk-and-api.md) | TypeScript API, type safety, error handling |
| [10-cloud.md](10-cloud.md) | Cloud architecture, API Gateway, storage layer, pricing |

---

> **Вопросы по безопасности:** security@gotipe.com
> **PGP Key:** [gotipe.com/.well-known/security.txt](https://gotipe.com/.well-known/security.txt)
> **Bug Bounty:** [gotipe.com/security/bounty](https://gotipe.com/security/bounty)
