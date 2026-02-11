# GoTipe — Промт для реализации Фазы 6: Apps & Documentation

## Контекст

Ты реализуешь финальную фазу GoTipe — demo приложения, документацию, OpenAPI spec, landing page и root-level файлы проекта. Фазы 1-5 (Rust crates, TypeScript packages, Go Cloud, инфраструктура, CI/CD) уже реализованы.

Фаза 6 = `apps/playground/`, `docs-site/`, `apps/cloud/api/openapi.yaml`, `apps/landing/`, root files. Каждый файл должен быть **полностью рабочим** — не placeholder-ы.

## Обязательные правила

1. **Playground = Vite + React 19:** Использует `@gotipe/core`, `@gotipe/react`, `@gotipe/collaboration`, `@gotipe/ai`, все из workspace
2. **Extension system:** Все block types и marks через `defineExtension()`. НЕ создавать блоки вне extension system
3. **WASM owns state:** EditorState в WASM. JS получает ViewState. Изменения через `dispatch(Transaction)`
4. **CSS tokens:** `--gt-*` переменные, `.gotipe-*` классы. НЕ hardcoded цвета
5. **Docs site = Mintlify:** `mint.json` config, MDX content, auto-generated API reference из OpenAPI
6. **OpenAPI 3.1:** Полная спецификация всех REST API endpoints из Phase 3. Совместима с Mintlify
7. **Landing = Next.js → Vercel:** Marketing page с pricing, comparison table, live demo embed
8. **`data-gotipe-*` attributes:** Для E2E тестирования (Playwright selectors)
9. **Lazy WASM:** PDF ~400KB и DOCX ~60KB — lazy `import()`. Не бандлить в core
10. **Conditional exports:** `"types"` ВСЕГДА первым в package.json exports

## Порядок реализации

```
6.1 Playground → 6.2 OpenAPI spec → 6.3 Docs site (Mintlify) → 6.4 Landing page → 6.5 Root files → 6.6 Verify
```

---

## 6.1 `apps/playground/` — Vite + React Demo

### `apps/playground/package.json`

```json
{
  "name": "@gotipe/playground",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@gotipe/core": "workspace:*",
    "@gotipe/react": "workspace:*",
    "@gotipe/collaboration": "workspace:*",
    "@gotipe/comments": "workspace:*",
    "@gotipe/suggestions": "workspace:*",
    "@gotipe/versions": "workspace:*",
    "@gotipe/ai": "workspace:*",
    "@gotipe/i18n": "workspace:*",
    "@gotipe/theme": "workspace:*",
    "@gotipe/export": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0",
    "typescript": "^5.7.0"
  }
}
```

### `apps/playground/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@gotipe/wasm'], // WASM loaded dynamically
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
      },
    },
  },
});
```

### `apps/playground/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GoTipe Playground</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `apps/playground/src/main.tsx`

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### `apps/playground/src/App.tsx`

Main demo app с навигацией между примерами:

```tsx
import { useState } from 'react';
import { BasicExample } from './examples/basic';
import { CollaborationExample } from './examples/collaboration';
import { CommentsExample } from './examples/comments';
import { SuggestionsExample } from './examples/suggestions';
import { VersionsExample } from './examples/versions';
import { AIExample } from './examples/ai';
import { CustomExample } from './examples/custom';
import { I18nExample } from './examples/i18n';

const EXAMPLES = {
  basic: { name: 'Basic Editor', component: BasicExample },
  collaboration: { name: 'Collaboration', component: CollaborationExample },
  comments: { name: 'Comments', component: CommentsExample },
  suggestions: { name: 'Track Changes', component: SuggestionsExample },
  versions: { name: 'Versions', component: VersionsExample },
  ai: { name: 'AI Features', component: AIExample },
  custom: { name: 'Custom Extensions', component: CustomExample },
  i18n: { name: 'i18n & RTL', component: I18nExample },
} as const;

type ExampleKey = keyof typeof EXAMPLES;

export function App() {
  const [active, setActive] = useState<ExampleKey>('basic');
  const ActiveComponent = EXAMPLES[active].component;

  return (
    <div className="gotipe-playground" data-gotipe-playground>
      <header className="gotipe-playground-header" data-gotipe-header>
        <h1>GoTipe Playground</h1>
        <nav>
          {(Object.entries(EXAMPLES) as [ExampleKey, typeof EXAMPLES[ExampleKey]][]).map(
            ([key, { name }]) => (
              <button
                key={key}
                data-gotipe-nav={key}
                className={active === key ? 'active' : ''}
                onClick={() => setActive(key)}
              >
                {name}
              </button>
            ),
          )}
        </nav>
      </header>
      <main className="gotipe-playground-main" data-gotipe-main>
        <ActiveComponent />
      </main>
    </div>
  );
}
```

### `apps/playground/src/examples/basic.tsx`

Minimal editor with default preset:

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';

export function BasicExample() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'heading',
          attrs: { level: 1 },
          content: [{ text: 'Welcome to GoTipe', marks: [] }],
          children: [],
        },
        {
          id: 'b2',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'This is a ', marks: [] },
            { text: 'block-first', marks: [{ type: 'bold' }] },
            { text: ' rich text editor powered by Rust/WASM.', marks: [] },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="basic">
      <EditorContent editor={editor} />
    </div>
  );
}
```

### `apps/playground/src/examples/collaboration.tsx`

Real-time collaboration demo — two editors, same document, colored cursors:

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';
import { Collaboration } from '@gotipe/collaboration';
import { useState } from 'react';

export function CollaborationExample() {
  const [documentId] = useState(() => `demo-${Date.now()}`);

  const editor1 = useEditor({
    extensions: [
      DefaultPreset,
      Collaboration.configure({
        serverUrl: `ws://${window.location.hostname}:8081`,
        documentId,
        token: 'demo-token',
        user: { name: 'Alice', color: '#FF6B6B' },
      }),
    ],
  });

  const editor2 = useEditor({
    extensions: [
      DefaultPreset,
      Collaboration.configure({
        serverUrl: `ws://${window.location.hostname}:8081`,
        documentId,
        token: 'demo-token',
        user: { name: 'Bob', color: '#4ECDC4' },
      }),
    ],
  });

  return (
    <div data-gotipe-example="collaboration" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div>
        <h3>Alice</h3>
        <EditorContent editor={editor1} />
      </div>
      <div>
        <h3>Bob</h3>
        <EditorContent editor={editor2} />
      </div>
    </div>
  );
}
```

### `apps/playground/src/examples/comments.tsx`

Comments demo: inline comments, threads, reactions:

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';
import { Comments } from '@gotipe/comments';

export function CommentsExample() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      Comments.configure({
        currentUser: { id: 'user-1', name: 'Alice' },
      }),
    ],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'Select text and click "Add Comment" to create inline comments. ', marks: [] },
            { text: 'Comments support threads, reactions, and resolution.', marks: [] },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="comments">
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <EditorContent editor={editor} />
        </div>
        {/* CommentSidebar from @gotipe/block-editor would go here */}
      </div>
    </div>
  );
}
```

### `apps/playground/src/examples/suggestions.tsx`

Track changes demo: suggestion mode, accept/reject:

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';
import { Suggestions } from '@gotipe/suggestions';
import { useState } from 'react';

export function SuggestionsExample() {
  const [mode, setMode] = useState<'editing' | 'suggesting'>('editing');

  const editor = useEditor({
    extensions: [
      DefaultPreset,
      Suggestions.configure({
        currentUser: { id: 'user-1', name: 'Alice' },
        mode,
      }),
    ],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'Toggle "Suggesting" mode and make edits. Changes appear as tracked suggestions that can be accepted or rejected.', marks: [] },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="suggestions">
      <div style={{ marginBottom: '1rem' }}>
        <button
          data-gotipe-mode="editing"
          onClick={() => setMode('editing')}
          className={mode === 'editing' ? 'active' : ''}
        >
          Editing
        </button>
        <button
          data-gotipe-mode="suggesting"
          onClick={() => setMode('suggesting')}
          className={mode === 'suggesting' ? 'active' : ''}
        >
          Suggesting
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

### `apps/playground/src/examples/versions.tsx`

Version history demo: timeline, diff view, restore:

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';
import { Versions } from '@gotipe/versions';

export function VersionsExample() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      Versions.configure({
        autoSave: { enabled: true, intervalMs: 30000 },
      }),
    ],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'Edit this document. Versions are auto-saved every 30 seconds. You can also manually create named versions.', marks: [] },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="versions">
      <div style={{ marginBottom: '1rem' }}>
        <button
          data-gotipe-action="create-version"
          onClick={() => editor?.commands.createVersion({ name: `Version ${Date.now()}` })}
        >
          Create Named Version
        </button>
        <button
          data-gotipe-action="show-history"
          onClick={() => editor?.commands.toggleVersionHistory()}
        >
          Show History
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

### `apps/playground/src/examples/ai.tsx`

AI features demo: ghost text, command palette:

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';
import { AIInline } from '@gotipe/ai';

export function AIExample() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      AIInline.configure({
        apiUrl: '/api/v1/ai',
        token: 'demo-token',
        provider: 'openai',
        model: 'gpt-4o-mini',
        ghostText: { enabled: true, debounceMs: 500 },
      }),
    ],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'Start typing to see AI ghost text suggestions. Press Tab to accept, Escape to dismiss.', marks: [] },
          ],
          children: [],
        },
        {
          id: 'b2',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'Use Cmd+J (or Ctrl+J) to open the AI command palette for rewriting, summarizing, or expanding text.', marks: [] },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="ai">
      <EditorContent editor={editor} />
    </div>
  );
}
```

### `apps/playground/src/examples/custom.tsx`

Custom extensions demo:

```tsx
import { createEditor, MinimalPreset, defineExtension } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';

// Custom callout block extension
const CalloutExtension = defineExtension({
  name: 'callout',
  schema: {
    type: 'block',
    attrs: {
      emoji: { default: '💡' },
      variant: { default: 'info' }, // info, warning, error, success
    },
    content: 'richText',
  },
  commands: {
    insertCallout:
      (attrs = {}) =>
      ({ commands }) => {
        commands.insertBlock({ type: 'callout', attrs: { emoji: '💡', variant: 'info', ...attrs } });
      },
  },
  keybindings: {
    'Mod-Shift-c': 'insertCallout',
  },
});

export function CustomExample() {
  const editor = useEditor({
    extensions: [MinimalPreset, CalloutExtension],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'This editor uses MinimalPreset + a custom Callout extension. Press Cmd+Shift+C to insert a callout.', marks: [] },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="custom">
      <EditorContent editor={editor} />
    </div>
  );
}
```

### `apps/playground/src/examples/i18n.tsx`

Internationalization demo: locale switcher, RTL support:

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';
import { I18n } from '@gotipe/i18n';
import { useState } from 'react';

const LOCALES = ['en', 'ru', 'ar', 'zh', 'ja', 'de', 'fr'] as const;

export function I18nExample() {
  const [locale, setLocale] = useState<string>('en');

  const editor = useEditor({
    extensions: [
      DefaultPreset,
      I18n.configure({ locale }),
    ],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'Switch the locale to see translated UI labels and RTL layout (Arabic).', marks: [] },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="i18n">
      <div style={{ marginBottom: '1rem' }}>
        {LOCALES.map((loc) => (
          <button
            key={loc}
            data-gotipe-locale={loc}
            className={locale === loc ? 'active' : ''}
            onClick={() => setLocale(loc)}
          >
            {loc.toUpperCase()}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

### `apps/playground/src/styles.css`

```css
/* apps/playground/src/styles.css */
@import '@gotipe/theme/base.css';

:root {
  font-family: var(--gt-font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
}

body {
  margin: 0;
  background: var(--gt-bg, #ffffff);
  color: var(--gt-text, #1a1a1a);
}

.gotipe-playground {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}

.gotipe-playground-header {
  border-bottom: 1px solid var(--gt-border, #e5e5e5);
  padding-bottom: 1rem;
  margin-bottom: 2rem;
}

.gotipe-playground-header h1 {
  margin: 0 0 1rem;
  font-size: var(--gt-text-2xl, 24px);
}

.gotipe-playground-header nav {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.gotipe-playground-header nav button {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--gt-border, #e5e5e5);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: var(--gt-text-sm, 14px);
  color: var(--gt-text-secondary, #666);
  transition: all 0.15s;
}

.gotipe-playground-header nav button:hover {
  background: var(--gt-bg-hover, #f5f5f5);
  color: var(--gt-text, #1a1a1a);
}

.gotipe-playground-header nav button.active {
  background: var(--gt-accent, #2563eb);
  color: var(--gt-accent-text, #ffffff);
  border-color: var(--gt-accent, #2563eb);
}

.gotipe-playground-main {
  min-height: 400px;
}

/* Editor container */
.gotipe-editor {
  border: 1px solid var(--gt-border, #e5e5e5);
  border-radius: 8px;
  padding: 1rem;
  min-height: 300px;
  outline: none;
}

.gotipe-editor:focus-within {
  border-color: var(--gt-border-focus, #2563eb);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
```

---

## 6.2 `apps/cloud/api/openapi.yaml` — OpenAPI 3.1 Spec

Полная спецификация REST API. Используется Mintlify для auto-generated API reference.

```yaml
# apps/cloud/api/openapi.yaml
openapi: 3.1.0
info:
  title: GoTipe Cloud API
  version: 1.0.0
  description: |
    GoTipe Cloud — managed backend for GoTipe editor.
    Provides collaboration sync, AI proxy, document export, and analytics.
  contact:
    email: support@gotipe.com
    url: https://gotipe.com
  license:
    name: Proprietary
    url: https://gotipe.com/terms

servers:
  - url: https://api.gotipe.com/v1
    description: Production
  - url: http://localhost:8080/v1
    description: Local development

security:
  - BearerAuth: []

tags:
  - name: Documents
    description: Document CRUD operations
  - name: Comments
    description: Document comments and threads
  - name: Versions
    description: Document version history
  - name: Organizations
    description: Organization and team management
  - name: Billing
    description: Subscription and billing management
  - name: Exports
    description: Document export (PDF, DOCX, HTML, Markdown)
  - name: AI
    description: AI proxy for completions and suggestions
  - name: Auth
    description: Authentication and API keys
  - name: Health
    description: Health and readiness checks

paths:
  # ── Documents ──
  /documents:
    post:
      tags: [Documents]
      summary: Create document
      operationId: createDocument
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateDocumentRequest'
      responses:
        '201':
          description: Document created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DocumentResponse'
        '402':
          $ref: '#/components/responses/QuotaExceeded'
    get:
      tags: [Documents]
      summary: List documents
      operationId: listDocuments
      parameters:
        - name: limit
          in: query
          schema: { type: integer, default: 20, maximum: 100 }
        - name: offset
          in: query
          schema: { type: integer, default: 0 }
        - name: sort
          in: query
          schema: { type: string, default: 'updated_at:desc' }
      responses:
        '200':
          description: Document list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DocumentListResponse'

  /documents/{id}:
    get:
      tags: [Documents]
      summary: Get document
      operationId: getDocument
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Document details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DocumentDetailResponse'
        '404':
          $ref: '#/components/responses/NotFound'
    delete:
      tags: [Documents]
      summary: Delete document
      operationId: deleteDocument
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '204':
          description: Document deleted

  # ── Comments ──
  /documents/{documentId}/comments:
    get:
      tags: [Comments]
      summary: List comments
      operationId: listComments
      parameters:
        - name: documentId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Comment list
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Comment'
    post:
      tags: [Comments]
      summary: Create comment
      operationId: createComment
      parameters:
        - name: documentId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateCommentRequest'
      responses:
        '201':
          description: Comment created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Comment'

  # ── Versions ──
  /documents/{documentId}/versions:
    get:
      tags: [Versions]
      summary: List versions
      operationId: listVersions
      parameters:
        - name: documentId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Version list
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Version'
    post:
      tags: [Versions]
      summary: Create named version
      operationId: createVersion
      parameters:
        - name: documentId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateVersionRequest'
      responses:
        '201':
          description: Version created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Version'

  /documents/{documentId}/versions/{versionId}/restore:
    post:
      tags: [Versions]
      summary: Restore version
      operationId: restoreVersion
      parameters:
        - name: documentId
          in: path
          required: true
          schema: { type: string }
        - name: versionId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Version restored

  # ── Exports ──
  /exports:
    post:
      tags: [Exports]
      summary: Create export job
      operationId: createExport
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateExportRequest'
      responses:
        '202':
          description: Export job created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ExportJob'

  /exports/{id}:
    get:
      tags: [Exports]
      summary: Get export status / download
      description: Returns status JSON while pending/processing. Returns 302 redirect to download URL when completed.
      operationId: getExport
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Export status (pending/processing)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ExportJob'
        '302':
          description: Redirect to download URL (completed)

  # ── AI ──
  /ai/complete:
    post:
      tags: [AI]
      summary: AI completion
      description: Proxies request to AI provider (OpenAI/Anthropic/Gemini). Supports SSE streaming.
      operationId: aiComplete
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AICompleteRequest'
      responses:
        '200':
          description: AI completion (SSE stream or JSON)
          content:
            text/event-stream:
              schema:
                type: string
            application/json:
              schema:
                $ref: '#/components/schemas/AICompleteResponse'

  # ── Auth ──
  /auth/token:
    post:
      tags: [Auth]
      summary: Generate JWT token
      description: Generate short-lived JWT for client-side use (WebSocket, restricted API access)
      operationId: createToken
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTokenRequest'
      responses:
        '200':
          description: JWT token
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TokenResponse'

  /api-keys:
    post:
      tags: [Auth]
      summary: Create API key
      operationId: createApiKey
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateApiKeyRequest'
      responses:
        '201':
          description: API key created (key shown only once)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiKeyResponse'
    get:
      tags: [Auth]
      summary: List API keys
      operationId: listApiKeys
      responses:
        '200':
          description: API key list
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ApiKeySummary'

  # ── Users ──
  /users/me:
    get:
      tags: [Auth]
      summary: Get current user
      operationId: getCurrentUser
      responses:
        '200':
          description: Current user with usage info
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'

  # ── Organizations ──
  /organizations:
    post:
      tags: [Organizations]
      summary: Create organization
      operationId: createOrganization
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOrganizationRequest'
      responses:
        '201':
          description: Organization created

  # ── Billing ──
  /billing/subscribe:
    post:
      tags: [Billing]
      summary: Create subscription
      operationId: createSubscription
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateSubscriptionRequest'
      responses:
        '200':
          description: Stripe checkout session URL

  /billing/usage:
    get:
      tags: [Billing]
      summary: Get usage summary
      operationId: getUsage
      responses:
        '200':
          description: Usage summary for current billing period

  /billing/webhooks:
    post:
      tags: [Billing]
      summary: Stripe webhook handler
      description: Always returns 200 (never 5xx for Stripe webhooks)
      security: []
      responses:
        '200':
          description: Webhook processed

  # ── Health ──
  /healthz:
    get:
      tags: [Health]
      summary: Liveness probe
      security: []
      responses:
        '200':
          description: Service is alive

  /readyz:
    get:
      tags: [Health]
      summary: Readiness probe
      security: []
      responses:
        '200':
          description: All dependencies healthy
        '503':
          description: One or more dependencies unhealthy

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      description: API key (gt_live_...) or JWT token

  responses:
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/APIError'
    QuotaExceeded:
      description: Plan quota exceeded
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/APIError'

  schemas:
    APIError:
      type: object
      required: [code, message]
      properties:
        code: { type: string, example: 'NOT_FOUND' }
        message: { type: string, example: 'Resource not found' }

    CreateDocumentRequest:
      type: object
      required: [id, title]
      properties:
        id: { type: string, example: 'doc_k7x9m2' }
        title: { type: string, example: 'Project Spec' }
        content: { type: object, description: 'Initial document content (Block[] format)' }

    DocumentResponse:
      type: object
      properties:
        id: { type: string }
        title: { type: string }
        version: { type: integer }
        size_bytes: { type: integer }
        sync_url: { type: string, format: uri }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }

    DocumentListResponse:
      type: object
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/DocumentResponse' } }
        total: { type: integer }
        limit: { type: integer }
        offset: { type: integer }

    DocumentDetailResponse:
      allOf:
        - $ref: '#/components/schemas/DocumentResponse'
        - type: object
          properties:
            content: { type: object }
            collaborators:
              type: array
              items:
                type: object
                properties:
                  user_id: { type: string }
                  role: { type: string, enum: [viewer, commenter, editor, admin] }
                  added_at: { type: string, format: date-time }

    Comment:
      type: object
      properties:
        id: { type: string }
        document_id: { type: string }
        anchor_type: { type: string, enum: [inline, block, document] }
        anchor_data: { type: object }
        author_id: { type: string }
        content: { type: string }
        parent_id: { type: string, nullable: true }
        resolved_at: { type: string, format: date-time, nullable: true }
        created_at: { type: string, format: date-time }

    CreateCommentRequest:
      type: object
      required: [anchor_type, content]
      properties:
        anchor_type: { type: string, enum: [inline, block, document] }
        anchor_data: { type: object }
        content: { type: string }
        parent_id: { type: string, description: 'Reply to existing comment' }

    Version:
      type: object
      properties:
        id: { type: string }
        document_id: { type: string }
        name: { type: string }
        version_type: { type: string, enum: [auto, manual] }
        created_by: { type: string }
        created_at: { type: string, format: date-time }
        description: { type: string }

    CreateVersionRequest:
      type: object
      required: [name]
      properties:
        name: { type: string }
        description: { type: string }

    CreateExportRequest:
      type: object
      required: [document_id, format]
      properties:
        document_id: { type: string }
        format: { type: string, enum: [pdf, docx, html, md] }

    ExportJob:
      type: object
      properties:
        id: { type: string }
        document_id: { type: string }
        format: { type: string }
        status: { type: string, enum: [pending, processing, completed, failed] }
        created_at: { type: string, format: date-time }

    AICompleteRequest:
      type: object
      required: [command]
      properties:
        provider: { type: string, enum: [openai, anthropic, gemini], default: openai }
        model: { type: string, default: 'gpt-4o-mini' }
        document_context:
          type: object
          properties:
            blocks_before: { type: array }
            blocks_after: { type: array }
            selection: { type: string }
        command: { type: string, enum: [complete, rewrite, summarize, expand, translate, fix_grammar] }
        prompt: { type: string }
        stream: { type: boolean, default: true }

    AICompleteResponse:
      type: object
      properties:
        content: { type: string }
        usage:
          type: object
          properties:
            input_tokens: { type: integer }
            output_tokens: { type: integer }

    CreateTokenRequest:
      type: object
      properties:
        user_id: { type: string }
        document_ids: { type: array, items: { type: string } }
        scopes: { type: array, items: { type: string } }
        expires_in: { type: integer, description: 'Seconds', default: 3600 }

    TokenResponse:
      type: object
      properties:
        token: { type: string }
        expires_at: { type: string, format: date-time }

    CreateApiKeyRequest:
      type: object
      required: [name, scopes]
      properties:
        name: { type: string }
        scopes: { type: array, items: { type: string, enum: [documents, ai, export, admin] } }

    ApiKeyResponse:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        key: { type: string, description: 'Shown only once at creation' }
        key_prefix: { type: string }
        scopes: { type: array, items: { type: string } }
        created_at: { type: string, format: date-time }

    ApiKeySummary:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        key_prefix: { type: string }
        scopes: { type: array, items: { type: string } }
        last_used_at: { type: string, format: date-time, nullable: true }
        created_at: { type: string, format: date-time }

    UserResponse:
      type: object
      properties:
        id: { type: string }
        email: { type: string }
        name: { type: string }
        plan: { type: string }
        usage:
          type: object
          properties:
            documents: { type: integer }
            documents_limit: { type: integer }
            ai_requests: { type: integer }
            ai_requests_limit: { type: integer }
            exports: { type: integer }
            exports_limit: { type: integer }

    CreateOrganizationRequest:
      type: object
      required: [name]
      properties:
        name: { type: string }

    CreateSubscriptionRequest:
      type: object
      required: [plan]
      properties:
        plan: { type: string, enum: [starter, pro, business] }
        success_url: { type: string, format: uri }
        cancel_url: { type: string, format: uri }
```

---

## 6.3 `docs-site/` — Mintlify Documentation

### `docs-site/mint.json`

```json
{
  "$schema": "https://mintlify.com/schema.json",
  "name": "GoTipe",
  "logo": {
    "dark": "/images/logo-dark.svg",
    "light": "/images/logo-light.svg"
  },
  "favicon": "/images/favicon.svg",
  "colors": {
    "primary": "#2563eb",
    "light": "#60a5fa",
    "dark": "#1d4ed8"
  },
  "topbarLinks": [
    { "name": "GitHub", "url": "https://github.com/gotipe/gotipe" }
  ],
  "topbarCtaButton": {
    "name": "Playground",
    "url": "https://playground.gotipe.com"
  },
  "tabs": [
    { "name": "Guides", "url": "guides" },
    { "name": "API Reference", "url": "api-reference" },
    { "name": "SDKs", "url": "sdks" }
  ],
  "navigation": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "quickstart"]
    },
    {
      "group": "Guides",
      "pages": [
        "guides/extensions",
        "guides/react",
        "guides/vue",
        "guides/svelte",
        "guides/solid",
        "guides/collaboration",
        "guides/comments",
        "guides/versions",
        "guides/ai",
        "guides/export",
        "guides/theming",
        "guides/i18n",
        "guides/self-hosted",
        "guides/cloud",
        "guides/security"
      ]
    },
    {
      "group": "Migration",
      "pages": [
        "migration/from-tiptap",
        "migration/from-prosemirror",
        "migration/from-lexical",
        "migration/from-slate"
      ]
    },
    {
      "group": "API Reference",
      "pages": ["api-reference/overview"]
    }
  ],
  "api": {
    "baseUrl": "https://api.gotipe.com/v1",
    "auth": {
      "method": "bearer"
    }
  },
  "openapi": "apps/cloud/api/openapi.yaml",
  "footerSocials": {
    "github": "https://github.com/gotipe/gotipe",
    "x": "https://x.com/gotipe_editor"
  },
  "analytics": {
    "plausible": {
      "domain": "docs.gotipe.com"
    }
  }
}
```

### `docs-site/introduction.mdx`

```mdx
---
title: Introduction
description: GoTipe — Rust/WASM rich text editor framework with Notion-like UX
---

# GoTipe

GoTipe is a **block-first rich text editor** powered by Rust and WebAssembly. It combines the performance of native code with the flexibility of a modern web framework.

## Key Features

- **Rust/WASM Core** — EditorState lives in WASM for maximum performance (<1ms keystroke processing)
- **Block-First Model** — Documents are arrays of blocks (not ProseMirror node trees)
- **Real-Time Collaboration** — Custom CRDT engine with binary sync protocol
- **AI-First** — Ghost text, command palette, provider fallback chain
- **Multi-Framework** — React, Vue, Svelte, Solid adapters
- **Full Export** — PDF (typst), DOCX, HTML, Markdown

## Architecture

```
Your App → @gotipe/react → @gotipe/core → WASM (Rust)
                                ↓
                     @gotipe/collaboration → GoTipe Cloud
```

## Quick Install

```bash
npm install @gotipe/core @gotipe/react
```

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';

function MyEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
  });
  return <EditorContent editor={editor} />;
}
```

## Licensing

| Package | License |
|---------|---------|
| @gotipe/core, adapters, collaboration, ai, export | MIT |
| @gotipe/block-editor, theme, ai-ui | Commercial (from $149/yr) |
| GoTipe Cloud | Managed service (from $29/mo, includes Block Editor) |
```

### `docs-site/quickstart.mdx`

```mdx
---
title: Quickstart
description: Get GoTipe running in 5 minutes
---

# Quickstart

## 1. Install

<CodeGroup>

```bash npm
npm install @gotipe/core @gotipe/react @gotipe/wasm
```

```bash pnpm
pnpm add @gotipe/core @gotipe/react @gotipe/wasm
```

```bash yarn
yarn add @gotipe/core @gotipe/react @gotipe/wasm
```

</CodeGroup>

## 2. Create Editor

```tsx
import { createEditor, DefaultPreset } from '@gotipe/core';
import { useEditor, EditorContent } from '@gotipe/react';

function MyEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: {
      version: 1,
      blocks: [
        {
          id: 'welcome',
          type: 'paragraph',
          attrs: {},
          content: [{ text: 'Hello, GoTipe!', marks: [] }],
          children: [],
        },
      ],
    },
  });

  return <EditorContent editor={editor} />;
}
```

## 3. Add Features

```tsx
import { Collaboration } from '@gotipe/collaboration';
import { AIInline } from '@gotipe/ai';

const editor = useEditor({
  extensions: [
    DefaultPreset,
    Collaboration.configure({
      serverUrl: 'wss://sync.gotipe.com',
      documentId: 'my-doc',
      token: jwtToken,
    }),
    AIInline.configure({
      apiUrl: 'https://api.gotipe.com/v1/ai',
      token: jwtToken,
    }),
  ],
});
```

## Next Steps

- [Extensions Guide](/guides/extensions) — Learn the extension system
- [React Adapter](/guides/react) — React-specific API
- [Collaboration](/guides/collaboration) — Real-time sync setup
- [Self-Hosted](/guides/self-hosted) — Deploy your own backend
```

> Остальные MDX-файлы (`guides/*.mdx`, `migration/*.mdx`) — создай по аналогии, используя контент из соответствующих docs/ файлов (docs/05-extensions.md → guides/extensions.mdx, docs/06-framework-adapters.md → guides/react.mdx и т.д.).

---

## 6.4 `apps/landing/` — Next.js Landing Page

### `apps/landing/package.json`

```json
{
  "name": "@gotipe/landing",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^4.0.0"
  }
}
```

### `apps/landing/app/page.tsx`

```tsx
export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          The Rust-Powered Editor Framework
        </h1>
        <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto">
          Block-first rich text editor with WASM performance, real-time collaboration,
          and AI-first design. Notion-like UX, fully extensible.
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <a href="https://docs.gotipe.com/quickstart" className="btn-primary">
            Get Started
          </a>
          <a href="https://playground.gotipe.com" className="btn-secondary">
            Try Playground
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto grid grid-cols-3 gap-8">
          <Feature title="Rust/WASM Performance" description="<1ms keystroke processing. EditorState lives in WASM for native speed." />
          <Feature title="Block-First Model" description="Documents are Block arrays. Each block is an extension. Fully composable." />
          <Feature title="Real-Time CRDT" description="Custom CRDT engine with binary sync protocol. No Yjs dependency." />
          <Feature title="AI-First" description="Ghost text, command palette, provider fallback (OpenAI/Anthropic/Gemini)." />
          <Feature title="Multi-Framework" description="React, Vue, Svelte, Solid. First-class adapters, not wrappers." />
          <Feature title="Full Export" description="PDF (typst), DOCX, HTML, Markdown. Server-side via Go Cloud." />
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Pricing</h2>
        <div className="max-w-5xl mx-auto grid grid-cols-4 gap-6">
          <PricingCard
            name="Core (MIT)"
            price="Free"
            features={['Headless editor', 'All extensions', 'CRDT collaboration', 'AI layer', 'Export API', 'React/Vue/Svelte/Solid']}
          />
          <PricingCard
            name="Block Editor"
            price="$149/yr"
            features={['Notion-like UI', 'SlashMenu', 'BubbleMenu', 'DragHandle', 'Themes', '1 production domain']}
          />
          <PricingCard
            name="Cloud Starter"
            price="$29/mo"
            highlight
            features={['Block Editor included', '1K documents', '10K AI requests/mo', '1K exports/mo', '1K MAU', 'Email support']}
          />
          <PricingCard
            name="Cloud Pro"
            price="$99/mo"
            features={['Block Editor included', '10K documents', '100K AI requests/mo', 'Unlimited exports', '10K MAU', '99.9% SLA']}
          />
        </div>
      </section>

      {/* Comparison */}
      <section className="py-16 bg-gray-50">
        <h2 className="text-3xl font-bold text-center mb-12">GoTipe vs Alternatives</h2>
        <ComparisonTable />
      </section>
    </main>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-gray-600">{description}</p>
    </div>
  );
}

function PricingCard({ name, price, features, highlight }: {
  name: string; price: string; features: string[]; highlight?: boolean;
}) {
  return (
    <div className={`p-6 rounded-xl border ${highlight ? 'border-blue-500 shadow-lg' : 'border-gray-200'}`}>
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="text-3xl font-bold mt-2">{price}</p>
      <ul className="mt-4 space-y-2">
        {features.map((f) => (
          <li key={f} className="text-sm text-gray-600">✓ {f}</li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonTable() {
  return (
    <table className="w-full max-w-4xl mx-auto text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left p-3">Feature</th>
          <th className="p-3">GoTipe</th>
          <th className="p-3">Tiptap</th>
          <th className="p-3">Lexical</th>
          <th className="p-3">Slate</th>
        </tr>
      </thead>
      <tbody>
        {[
          ['Engine', 'Rust/WASM', 'JS (ProseMirror)', 'JS', 'JS'],
          ['Model', 'Block-first', 'Node tree', 'Node tree', 'Nested nodes'],
          ['CRDT', 'Built-in (custom)', 'Yjs (addon)', 'None', 'None'],
          ['AI', 'Built-in', 'Addon ($)', 'None', 'None'],
          ['Export PDF/DOCX', 'Built-in', 'None', 'None', 'None'],
          ['Frameworks', 'React/Vue/Svelte/Solid', 'React/Vue', 'React', 'React'],
          ['License', 'MIT + Commercial UI', 'MIT + Commercial ext', 'MIT', 'MIT'],
          ['Cloud', '$29/mo', '$49/mo', 'None', 'None'],
        ].map(([feature, ...values]) => (
          <tr key={feature} className="border-b">
            <td className="p-3 font-medium">{feature}</td>
            {values.map((v, i) => (
              <td key={i} className="p-3 text-center">{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## 6.5 Root Files

### `SECURITY.md`

```markdown
# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in GoTipe, please report it responsibly.

**Email:** security@gotipe.com

**Do NOT open a public GitHub issue for security vulnerabilities.**

### Response Timeline

| Phase | Timeline |
|-------|----------|
| Acknowledgment | Within 24 hours |
| Assessment | Within 72 hours |
| Fix | Within 7 days (critical), 30 days (medium/low) |
| Disclosure | After fix is released |

### Scope

- GoTipe Rust crates (`crates/`)
- GoTipe TypeScript packages (`packages/`)
- GoTipe Cloud server (`apps/cloud/`)
- GoTipe infrastructure (`infra/`)

### Out of Scope

- Third-party dependencies (report upstream)
- GoTipe documentation site
- Social engineering attacks

### PGP Key

For encrypted communication, use our PGP key: [security-pgp.asc](https://gotipe.com/.well-known/security-pgp.asc)
```

### `CONTRIBUTING.md`

```markdown
# Contributing to GoTipe

Thank you for contributing to GoTipe! This guide covers our development workflow.

## Setup

```bash
# Clone
git clone https://github.com/gotipe/gotipe.git
cd gotipe

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Install Node.js (22+) and pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Install Go (1.23+)
# https://go.dev/doc/install

# Start dev infrastructure
docker compose -f infra/docker-compose.dev.yml up -d

# Build WASM
bash scripts/build-wasm.sh

# Install TS dependencies and build
pnpm install && pnpm build

# Start dev
bash scripts/dev.sh
```

## Development Workflow

1. Create a branch: `git checkout -b feat/my-feature`
2. Make changes
3. Run tests:
   - Rust: `cargo test --workspace && cargo clippy --workspace -- -D warnings`
   - TypeScript: `pnpm test && pnpm typecheck && pnpm lint`
   - Go: `cd apps/cloud && go test ./... -race`
4. Create a changeset: `pnpm changeset`
5. Submit PR

## Code Standards

- **Rust:** Follow `cargo clippy` and `cargo fmt` rules
- **TypeScript:** Follow Biome linter rules
- **Go:** Follow `go vet` and `gofmt` rules
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)

## Testing Requirements

- Rust: ≥80% coverage, property tests for CRDT
- TypeScript: ≥75% coverage
- Go: ≥70% coverage, race detector enabled

## Pull Request Process

1. All CI checks must pass
2. At least one review approval
3. Changeset required for user-facing changes
4. WASM size budget ≤500KB gzip
```

### `CODE_OF_CONDUCT.md`

```markdown
# Contributor Covenant Code of Conduct

## Our Pledge

We pledge to make participation in our community a harassment-free experience for everyone.

## Our Standards

**Positive behavior:**
- Being respectful and inclusive
- Accepting constructive feedback gracefully
- Focusing on what is best for the community

**Unacceptable behavior:**
- Harassment, trolling, or personal attacks
- Publishing others' private information
- Conduct which could reasonably be considered inappropriate

## Enforcement

Instances of unacceptable behavior may be reported to conduct@gotipe.com.

This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
```

### `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    ["@gotipe/core", "@gotipe/wasm"],
    ["@gotipe/block-editor", "@gotipe/block-editor-vue", "@gotipe/theme", "@gotipe/ai-ui"]
  ],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@gotipe/playground", "@gotipe/landing"]
}
```

---

## Верификация

```bash
# 1. Playground builds and runs
cd apps/playground && pnpm dev
# → Open http://localhost:5173, verify all 8 examples render

# 2. OpenAPI spec validates
npx @redocly/cli lint apps/cloud/api/openapi.yaml

# 3. Docs site builds (Mintlify)
cd docs-site && npx mintlify dev
# → Open http://localhost:3000, verify navigation and API reference

# 4. Landing page builds
cd apps/landing && pnpm build

# 5. Root files exist
ls SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md .changeset/config.json

# 6. E2E selectors present
grep -r "data-gotipe-" apps/playground/src/ --include="*.tsx"
# → All examples have data-gotipe-* attributes for Playwright
```

---

## Подсказки

1. **Playground examples:** Каждый пример изолирован. `data-gotipe-example="basic"` на корневом div для Playwright selectors
2. **OpenAPI:** Mintlify автогенерирует API reference из `openapi.yaml`. Путь в `mint.json` → `"openapi": "apps/cloud/api/openapi.yaml"`
3. **Changeset linking:** `@gotipe/core` и `@gotipe/wasm` linked — версия бампится вместе. Commercial packages тоже linked
4. **Landing page:** Next.js → Vercel. Отдельный deploy от основного монорепо
5. **Docs site:** Mintlify хостит сам. MDX-контент в репо, auto-deploy через GitHub integration
6. **CSS в playground:** Использует `@gotipe/theme/base.css` + `--gt-*` токены. Не hardcoded цвета
