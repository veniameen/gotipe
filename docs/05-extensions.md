# GoTipe — Extension System

> **Историческая спецификация, не руководство по текущему API.** Примеры, сроки,
> сравнения производительности, коммерческие условия и обещания ниже не подтверждают
> реализацию или доступность сервиса. Актуально: [контракты](development/editor-contracts.md),
> [карта кода](development/code-map.md), [проверки](development/testing.md),
> [план выпуска](22-release-readiness.md). Лицензии определяются `LICENSE` и manifest
> каждого пакета, а не этим документом.

## Обзор

Всё в GoTipe — extension. Даже базовые блоки (paragraph, heading, list) реализованы как extensions. Core engine оперирует абстрактными Block, TextSpan, Mark — конкретные типы определяются extensions.

```
┌──────────────────────────────────────────────────────────────┐
│                    Extension Categories                       │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │   Nodes    │  │   Marks    │  │     Behaviors          │ │
│  │            │  │            │  │                        │ │
│  │ Paragraph  │  │ Bold       │  │ SlashCommands          │ │
│  │ Heading    │  │ Italic     │  │ InputRules             │ │
│  │ BulletList │  │ Underline  │  │ PasteRules             │ │
│  │ CodeBlock  │  │ Link       │  │ KeyboardShortcuts      │ │
│  │ Image      │  │ Code       │  │ DragAndDrop            │ │
│  │ Table      │  │ Highlight  │  │ Placeholder            │ │
│  │ Callout    │  │ ...        │  │ History (undo/redo)    │ │
│  │ ...        │  │            │  │ Collaboration          │ │
│  └────────────┘  └────────────┘  │ AI                     │ │
│                                  └────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Extension API

### Rust Trait (core)

```rust
// crates/gotipe-core/src/extension.rs

/// Extension — единица расширяемости GoTipe
pub trait Extension: Send + Sync {
    /// Уникальное имя
    fn name(&self) -> &str;

    /// Зависимости (имена других extensions)
    fn dependencies(&self) -> Vec<&str> { vec![] }

    /// Schema nodes
    fn nodes(&self) -> Vec<NodeSpec> { vec![] }

    /// Schema marks
    fn marks(&self) -> Vec<MarkSpec> { vec![] }

    /// Keyboard shortcuts: (key combo, command)
    fn keybindings(&self) -> Vec<Keybinding> { vec![] }

    /// Input rules: auto-formatting при вводе
    fn input_rules(&self) -> Vec<InputRule> { vec![] }

    /// Paste rules: трансформации при вставке
    fn paste_rules(&self) -> Vec<PasteRule> { vec![] }

    /// Lifecycle: после инициализации editor
    fn on_create(&self, _state: &EditorState) {}

    /// Lifecycle: после каждого обновления state
    fn on_update(&self, _old: &EditorState, _new: &EditorState) {}

    /// Lifecycle: при уничтожении editor
    fn on_destroy(&self) {}

    /// Plugin state (для stateful extensions)
    fn plugin(&self) -> Option<Box<dyn Plugin>> { None }

    /// Slash commands
    fn slash_commands(&self) -> Vec<SlashCommandDef> { vec![] }

    /// Конфигурация (по умолчанию)
    fn default_config(&self) -> Option<serde_json::Value> { None }
}
```

### TypeScript Interface (JS bindings)

```typescript
// packages/core/src/types/extension.ts

export interface ExtensionConfig<Options = any> {
  /** Unique name */
  name: string;

  /** Dependencies */
  dependencies?: string[];

  /** Node specs to add to schema */
  nodes?: NodeSpec[];

  /** Mark specs to add to schema */
  marks?: MarkSpec[];

  /** Keyboard shortcuts */
  keybindings?: Keybinding[];

  /** Input rules (Markdown shortcuts, etc.) */
  inputRules?: InputRule[];

  /** Paste rules */
  pasteRules?: PasteRule[];

  /** Slash commands */
  slashCommands?: SlashCommandDef[];

  /** Lifecycle hooks */
  onCreate?: (editor: GoTipeEditor) => void;
  onUpdate?: (editor: GoTipeEditor) => void;
  onDestroy?: (editor: GoTipeEditor) => void;

  /** Plugin (stateful logic) */
  plugin?: PluginFactory;

  /** Extension options */
  options?: Options;
}

/** Create an extension from config */
export function defineExtension<Options = any>(
  config: ExtensionConfig<Options>,
): Extension<Options> {
  return {
    ...config,
    configure(options: Partial<Options>) {
      return defineExtension({
        ...config,
        options: { ...config.options, ...options } as Options,
      });
    },
  };
}

export interface Extension<Options = any> extends ExtensionConfig<Options> {
  configure(options: Partial<Options>): Extension<Options>;
}
```

### Lifecycle Hooks

```
Editor created
      │
      ▼
  Extension.onCreate()  ← each extension, in dependency order
      │
      ▼
  Editor ready (accepting input)
      │
      ├──── user input → Transaction → Extension.onUpdate()
      ├──── user input → Transaction → Extension.onUpdate()
      └──── ...
      │
      ▼
  Editor.destroy()
      │
      ▼
  Extension.onDestroy()  ← each extension, in reverse order
```

---

## Built-in Extensions (все MIT)

### Node Extensions

#### Paragraph

```typescript
// packages/core/src/extensions/paragraph.ts
import { defineExtension } from '../types/extension';

export const Paragraph = defineExtension({
  name: 'paragraph',
  nodes: [{
    name: 'paragraph',
    group: ['block'],
    content: 'richText',
    attrs: {},
    topLevel: true,
    marksAllowed: 'all',
    leaf: false,
    allowsChildren: false,
  }],
  inputRules: [],
  keybindings: [],
});
```

#### Heading

```typescript
// packages/core/src/extensions/heading.ts
export interface HeadingOptions {
  levels: number[];
}

export const Heading = defineExtension<HeadingOptions>({
  name: 'heading',
  options: { levels: [1, 2, 3, 4, 5, 6] },

  nodes: [{
    name: 'heading',
    group: ['block'],
    content: 'richText',
    attrs: {
      level: { type: 'enum', values: ['1','2','3','4','5','6'], default: 1, required: true },
    },
    topLevel: true,
    marksAllowed: 'all',
    leaf: false,
    allowsChildren: false,
  }],

  inputRules: [
    { pattern: /^#\s$/, handler: (editor) => editor.chain().setBlockType('heading', { level: 1 }).run() },
    { pattern: /^##\s$/, handler: (editor) => editor.chain().setBlockType('heading', { level: 2 }).run() },
    { pattern: /^###\s$/, handler: (editor) => editor.chain().setBlockType('heading', { level: 3 }).run() },
    { pattern: /^####\s$/, handler: (editor) => editor.chain().setBlockType('heading', { level: 4 }).run() },
    { pattern: /^#####\s$/, handler: (editor) => editor.chain().setBlockType('heading', { level: 5 }).run() },
    { pattern: /^######\s$/, handler: (editor) => editor.chain().setBlockType('heading', { level: 6 }).run() },
  ],

  slashCommands: [
    { name: 'Heading 1', aliases: ['h1', 'heading1'], icon: 'H1', group: 'basic',
      execute: (editor) => editor.chain().setBlockType('heading', { level: 1 }).run() },
    { name: 'Heading 2', aliases: ['h2', 'heading2'], icon: 'H2', group: 'basic',
      execute: (editor) => editor.chain().setBlockType('heading', { level: 2 }).run() },
    { name: 'Heading 3', aliases: ['h3', 'heading3'], icon: 'H3', group: 'basic',
      execute: (editor) => editor.chain().setBlockType('heading', { level: 3 }).run() },
  ],
});
```

#### BulletList / OrderedList / TodoList

```typescript
export const BulletList = defineExtension({
  name: 'bulletList',
  dependencies: ['listItem'],
  nodes: [{
    name: 'bulletList',
    group: ['block', 'list'],
    content: 'empty',
    attrs: {},
    topLevel: true,
    marksAllowed: 'none',
    leaf: false,
    allowsChildren: true,
    childTypes: ['listItem'],
  }],
  inputRules: [
    { pattern: /^[-*]\s$/, handler: (editor) => editor.chain().toggleBulletList().run() },
  ],
  keybindings: [
    { key: 'Mod-Shift-8', command: (editor) => editor.chain().toggleBulletList().run() },
  ],
  slashCommands: [
    { name: 'Bullet List', aliases: ['bullet', 'ul', 'unordered'], icon: '•', group: 'basic',
      execute: (editor) => editor.chain().toggleBulletList().run() },
  ],
});

export const OrderedList = defineExtension({
  name: 'orderedList',
  dependencies: ['listItem'],
  nodes: [{
    name: 'orderedList',
    group: ['block', 'list'],
    content: 'empty',
    attrs: { start: { type: 'number', default: 1 } },
    topLevel: true,
    marksAllowed: 'none',
    leaf: false,
    allowsChildren: true,
    childTypes: ['listItem'],
  }],
  inputRules: [
    { pattern: /^(\d+)\.\s$/, handler: (editor, match) => {
      editor.chain().toggleOrderedList({ start: parseInt(match[1]) }).run();
    }},
  ],
  keybindings: [
    { key: 'Mod-Shift-7', command: (editor) => editor.chain().toggleOrderedList().run() },
  ],
  slashCommands: [
    { name: 'Numbered List', aliases: ['number', 'ol', 'ordered'], icon: '1.', group: 'basic',
      execute: (editor) => editor.chain().toggleOrderedList().run() },
  ],
});

export const ListItem = defineExtension({
  name: 'listItem',
  nodes: [{
    name: 'listItem',
    group: ['listChild'],
    content: 'richText',
    attrs: { checked: { type: 'bool', default: null } },
    topLevel: false,
    marksAllowed: 'all',
    leaf: false,
    allowsChildren: true,
    childTypes: ['bulletList', 'orderedList'],
  }],
  keybindings: [
    { key: 'Tab', command: (editor) => editor.chain().indent().run() },
    { key: 'Shift-Tab', command: (editor) => editor.chain().outdent().run() },
    { key: 'Enter', command: (editor) => editor.chain().splitListItem().run() },
  ],
});
```

#### CodeBlock

```typescript
export interface CodeBlockOptions {
  languages: string[];
  defaultLanguage: string;
  syntaxHighlight: boolean;
}

export const CodeBlock = defineExtension<CodeBlockOptions>({
  name: 'codeBlock',
  options: {
    languages: ['javascript', 'typescript', 'python', 'rust', 'go', 'html', 'css', 'json', 'bash', 'sql', 'plain'],
    defaultLanguage: 'plain',
    syntaxHighlight: true,
  },
  nodes: [{
    name: 'codeBlock',
    group: ['block'],
    content: 'rawText',
    attrs: { language: { type: 'string', default: 'plain' } },
    topLevel: true,
    marksAllowed: 'none',
    leaf: false,
    allowsChildren: false,
  }],
  inputRules: [
    { pattern: /^```(\w*)\n$/, handler: (editor, match) => {
      const lang = match[1] || 'plain';
      editor.chain().setBlockType('codeBlock', { language: lang }).run();
    }},
  ],
  keybindings: [
    { key: 'Tab', command: (editor) => editor.chain().insertText('  ').run(), when: 'inCodeBlock' },
    { key: 'Mod-a', command: (editor) => editor.chain().selectBlock().run(), when: 'inCodeBlock' },
  ],
  slashCommands: [
    { name: 'Code Block', aliases: ['code', 'pre', 'snippet'], icon: '</>', group: 'basic',
      execute: (editor) => editor.chain().insertBlockAfter('codeBlock').run() },
  ],
});
```

#### Image

```typescript
export interface ImageOptions {
  /** Max file size in bytes */
  maxSize: number;
  /** Allowed MIME types */
  allowedTypes: string[];
  /** Upload handler */
  upload?: (file: File) => Promise<string>;
}

export const Image = defineExtension<ImageOptions>({
  name: 'image',
  options: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  },
  nodes: [{
    name: 'image',
    group: ['block'],
    content: 'empty',
    attrs: {
      src: { type: 'string', required: true },
      alt: { type: 'string', default: '' },
      width: { type: 'number' },
    },
    topLevel: true,
    marksAllowed: 'none',
    leaf: true,
    allowsChildren: false,
  }],
  pasteRules: [
    {
      match: /^image\/(jpeg|png|gif|webp)/,
      handler: async (editor, file, options) => {
        if (options.upload) {
          const url = await options.upload(file);
          editor.chain().insertBlockAfter('image', { src: url }).run();
        }
      },
    },
  ],
  slashCommands: [
    { name: 'Image', aliases: ['image', 'img', 'picture', 'photo'], icon: '🖼', group: 'media',
      execute: (editor) => {
        // Open file picker
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (editor.options.image?.upload) {
            const url = await editor.options.image.upload(file);
            editor.chain().insertBlockAfter('image', { src: url }).run();
          }
        };
        input.click();
      },
    },
  ],
});
```

#### Table

```typescript
export const Table = defineExtension({
  name: 'table',
  dependencies: ['tableRow', 'tableCell', 'tableHeader'],
  nodes: [
    {
      name: 'table',
      group: ['block'],
      content: 'empty',
      attrs: {},
      topLevel: true,
      marksAllowed: 'none',
      leaf: false,
      allowsChildren: true,
      childTypes: ['tableRow'],
    },
    {
      name: 'tableRow',
      group: ['tableChild'],
      content: 'empty',
      attrs: {},
      topLevel: false,
      marksAllowed: 'none',
      leaf: false,
      allowsChildren: true,
      childTypes: ['tableCell', 'tableHeader'],
    },
    {
      name: 'tableCell',
      group: ['tableChild'],
      content: 'richText',
      attrs: {
        colspan: { type: 'number', default: 1 },
        rowspan: { type: 'number', default: 1 },
      },
      topLevel: false,
      marksAllowed: 'all',
      leaf: false,
      allowsChildren: false,
    },
    {
      name: 'tableHeader',
      group: ['tableChild'],
      content: 'richText',
      attrs: {
        colspan: { type: 'number', default: 1 },
        rowspan: { type: 'number', default: 1 },
      },
      topLevel: false,
      marksAllowed: 'all',
      leaf: false,
      allowsChildren: false,
    },
  ],
  keybindings: [
    { key: 'Tab', command: (editor) => editor.chain().goToNextCell().run(), when: 'inTable' },
    { key: 'Shift-Tab', command: (editor) => editor.chain().goToPrevCell().run(), when: 'inTable' },
  ],
  slashCommands: [
    { name: 'Table', aliases: ['table', 'grid'], icon: '📊', group: 'advanced',
      execute: (editor) => editor.chain().insertTable({ rows: 3, cols: 3, withHeader: true }).run() },
  ],
});
```

### Mark Extensions

```typescript
// packages/core/src/extensions/marks.ts

export const Bold = defineExtension({
  name: 'bold',
  marks: [{
    name: 'bold',
    attrs: {},
    rank: 10,
  }],
  keybindings: [
    { key: 'Mod-b', command: (editor) => editor.chain().toggleBold().run() },
  ],
  inputRules: [
    { pattern: /\*\*(.+)\*\*$/, handler: (editor, match) => {
      editor.chain().addMark('bold', match.index, match.index + match[1].length).run();
    }},
  ],
});

export const Italic = defineExtension({
  name: 'italic',
  marks: [{
    name: 'italic',
    attrs: {},
    rank: 20,
  }],
  keybindings: [
    { key: 'Mod-i', command: (editor) => editor.chain().toggleItalic().run() },
  ],
  inputRules: [
    { pattern: /(?:^|\s)\*(.+)\*$/, handler: (editor, match) => {
      editor.chain().addMark('italic', match.index, match.index + match[1].length).run();
    }},
  ],
});

export const Underline = defineExtension({
  name: 'underline',
  marks: [{ name: 'underline', attrs: {}, rank: 30 }],
  keybindings: [
    { key: 'Mod-u', command: (editor) => editor.chain().toggleUnderline().run() },
  ],
});

export const Strikethrough = defineExtension({
  name: 'strikethrough',
  marks: [{ name: 'strikethrough', attrs: {}, rank: 40 }],
  keybindings: [
    { key: 'Mod-Shift-s', command: (editor) => editor.chain().toggleStrikethrough().run() },
  ],
  inputRules: [
    { pattern: /~~(.+)~~$/, handler: (editor, match) => {
      editor.chain().addMark('strikethrough', match.index, match.index + match[1].length).run();
    }},
  ],
});

export const InlineCode = defineExtension({
  name: 'code',
  marks: [{ name: 'code', exclusiveGroup: 'code', attrs: {}, rank: 50 }],
  keybindings: [
    { key: 'Mod-e', command: (editor) => editor.chain().toggleCode().run() },
  ],
  inputRules: [
    { pattern: /`(.+)`$/, handler: (editor, match) => {
      editor.chain().addMark('code', match.index, match.index + match[1].length).run();
    }},
  ],
});

export const Link = defineExtension({
  name: 'link',
  marks: [{
    name: 'link',
    attrs: {
      href: { type: 'string', required: true },
      target: { type: 'string', default: '_blank' },
    },
    rank: 60,
  }],
  keybindings: [
    { key: 'Mod-k', command: (editor) => editor.emit('openLinkDialog') },
  ],
  pasteRules: [
    {
      match: /https?:\/\/[^\s]+/g,
      handler: (editor, url) => {
        editor.chain().addMark('link', { href: url }).run();
      },
    },
  ],
});

export const Highlight = defineExtension({
  name: 'highlight',
  marks: [{
    name: 'highlight',
    attrs: { color: { type: 'string', default: 'yellow' } },
    rank: 5,
  }],
  keybindings: [
    { key: 'Mod-Shift-h', command: (editor) => editor.chain().toggleHighlight().run() },
  ],
});

export const Superscript = defineExtension({
  name: 'superscript',
  marks: [{ name: 'superscript', exclusiveGroup: 'script', attrs: {}, rank: 70 }],
  keybindings: [
    { key: 'Mod-.', command: (editor) => editor.chain().toggleSuperscript().run() },
  ],
});

export const Subscript = defineExtension({
  name: 'subscript',
  marks: [{ name: 'subscript', exclusiveGroup: 'script', attrs: {}, rank: 80 }],
  keybindings: [
    { key: 'Mod-,', command: (editor) => editor.chain().toggleSubscript().run() },
  ],
});
```

### Behavior Extensions

```typescript
// packages/core/src/extensions/behaviors.ts

export const History = defineExtension({
  name: 'history',
  keybindings: [
    { key: 'Mod-z', command: (editor) => editor.chain().undo().run() },
    { key: 'Mod-Shift-z', command: (editor) => editor.chain().redo().run() },
    { key: 'Mod-y', command: (editor) => editor.chain().redo().run() },
  ],
});

export const Placeholder = defineExtension<{ text: string }>({
  name: 'placeholder',
  options: { text: 'Type "/" for commands...' },
  plugin: (options) => ({
    decorations: (state) => {
      if (state.doc.blocks.length === 1 && state.doc.blocks[0].isEmpty()) {
        return [{ type: 'placeholder', text: options.text, blockId: state.doc.blocks[0].id }];
      }
      return [];
    },
  }),
});

export const DragAndDrop = defineExtension({
  name: 'dragAndDrop',
  plugin: () => ({
    // Handles block reordering via DOM drag events
    // Generates MoveBlock steps
  }),
});

export const SlashCommands = defineExtension({
  name: 'slashCommands',
  inputRules: [
    {
      pattern: /^\/$/, // triggers on "/" at start of empty block
      handler: (editor) => editor.emit('openSlashMenu'),
    },
  ],
});
```

---

## Custom Extensions

### Пример: Callout Extension

```typescript
// my-app/extensions/callout.ts
import { defineExtension } from '@gotipe/core';

export const Callout = defineExtension({
  name: 'callout',

  nodes: [{
    name: 'callout',
    group: ['block'],
    content: 'richText',
    attrs: {
      emoji: { type: 'string', default: '💡' },
    },
    topLevel: true,
    marksAllowed: 'all',
    leaf: false,
    allowsChildren: true,
    childTypes: ['paragraph'],
  }],

  inputRules: [
    {
      // ">" + space at start → callout (like blockquote but with emoji)
      pattern: /^>\s$/,
      handler: (editor) => {
        editor.chain().setBlockType('callout', { emoji: '💡' }).run();
      },
    },
  ],

  slashCommands: [
    {
      name: 'Callout',
      aliases: ['callout', 'info', 'tip', 'warning'],
      description: 'Highlighted callout block',
      icon: '💡',
      group: 'advanced',
      execute: (editor) => {
        editor.chain().insertBlockAfter('callout', { emoji: '💡' }).run();
      },
    },
  ],

  keybindings: [],
});
```

### Пример: Custom Mark (spoiler)

```typescript
// my-app/extensions/spoiler.ts
import { defineExtension } from '@gotipe/core';

export const Spoiler = defineExtension({
  name: 'spoiler',

  marks: [{
    name: 'spoiler',
    attrs: {},
    rank: 90,
    // No exclusive group — can combine with bold, italic, etc.
  }],

  keybindings: [
    {
      key: 'Mod-Shift-p',
      command: (editor) => editor.chain().toggleMark('spoiler').run(),
    },
  ],

  inputRules: [
    {
      pattern: /\|\|(.+)\|\|$/,
      handler: (editor, match) => {
        editor.chain().addMark('spoiler', match.index, match.index + match[1].length).run();
      },
    },
  ],
});

// CSS для spoiler mark:
// .gotipe-mark-spoiler {
//   background-color: currentColor;
//   border-radius: 2px;
//   cursor: pointer;
// }
// .gotipe-mark-spoiler.revealed,
// .gotipe-mark-spoiler:hover {
//   background-color: transparent;
// }
```

### Пример: Custom Node (video embed)

```typescript
// my-app/extensions/video.ts
import { defineExtension } from '@gotipe/core';

export const Video = defineExtension({
  name: 'video',

  nodes: [{
    name: 'video',
    group: ['block'],
    content: 'empty',
    attrs: {
      src: { type: 'string', required: true },
      poster: { type: 'string' },
      autoplay: { type: 'bool', default: false },
    },
    topLevel: true,
    marksAllowed: 'none',
    leaf: true,
    allowsChildren: false,
  }],

  slashCommands: [
    {
      name: 'Video',
      aliases: ['video', 'mp4'],
      description: 'Embed a video',
      icon: '🎬',
      group: 'media',
      execute: (editor) => {
        // Prompt for URL
        const url = window.prompt('Video URL:');
        if (url) {
          editor.chain().insertBlockAfter('video', { src: url }).run();
        }
      },
    },
  ],
});
```

---

## Extension Registry

### npm Package Convention

Extensions публикуются как npm-пакеты с конвенцией `@gotipe/ext-*` или `gotipe-ext-*`.

```
@gotipe/ext-math          — math equations (KaTeX)
@gotipe/ext-mermaid       — mermaid diagrams
@gotipe/ext-excalidraw    — drawing integration
@gotipe/ext-mention       — @mentions
@gotipe/ext-emoji         — emoji picker
gotipe-ext-figma          — Figma embed (community)
gotipe-ext-loom           — Loom embed (community)
```

### Package Structure

```
gotipe-ext-example/
├── src/
│   ├── index.ts          # Extension definition (defineExtension)
│   ├── component.tsx     # React component (optional, for custom rendering)
│   └── styles.css        # Styles (optional)
├── package.json
├── tsconfig.json
└── README.md
```

```json
// package.json
{
  "name": "gotipe-ext-example",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@gotipe/core": "^0.1.0"
  },
  "keywords": ["gotipe", "gotipe-extension"]
}
```

---

## Preset Bundles

Для удобства — presets, объединяющие часто используемые extensions.

```typescript
// packages/core/src/presets.ts

/** Минимальный набор: только текст */
export const MinimalPreset = [
  Paragraph,
  Bold,
  Italic,
  History,
];

/** Стандартный набор: Notion-like editor */
export const DefaultPreset = [
  // Nodes
  Paragraph,
  Heading.configure({ levels: [1, 2, 3] }),
  BulletList,
  OrderedList,
  ListItem,
  CodeBlock,
  Image,
  Blockquote,
  Callout,
  Divider,
  Table,
  Toggle,
  // Marks
  Bold,
  Italic,
  Underline,
  Strikethrough,
  InlineCode,
  Link,
  Highlight,
  // Behaviors
  History,
  Placeholder.configure({ text: 'Type "/" for commands...' }),
  DragAndDrop,
  SlashCommands,
];

/** Полный набор: всё из коробки */
export const FullPreset = [
  ...DefaultPreset,
  Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  Columns,
  Embed,
  Math,
  File,
  Superscript,
  Subscript,
];
```

### Использование

```typescript
import { createEditor } from '@gotipe/core';
import { DefaultPreset } from '@gotipe/core/presets';
import { Collaboration } from '@gotipe/collaboration';
import { AIInline } from '@gotipe/ai';

const editor = createEditor({
  extensions: [
    ...DefaultPreset,
    Collaboration.configure({ serverUrl: 'wss://...' }),
    AIInline.configure({ provider: 'openai' }),
  ],
});
```

---

## Сравнение с Tiptap Extensions

| Аспект | GoTipe | Tiptap |
|--------|--------|--------|
| **Extension API** | `defineExtension()` — единый формат | Class-based (Node.create(), Mark.create()) |
| **Dependencies** | Explicit declaration | Implicit (manual ordering) |
| **Configuration** | `.configure()` typed | `.configure()` typed |
| **Schema** | Declarative (JSON-like) | ProseMirror schema objects |
| **Input rules** | Pattern → handler | Pattern → nodeType |
| **Keybindings** | Array of {key, command} | Object inside addKeyboardShortcuts() |
| **Slash commands** | Built into extension API | Separate Suggestion extension |
| **Plugin** | Optional, stateful logic | ProseMirror Plugin API leak |
| **Paid extensions** | All MIT | Some were Pro (now MIT since June 2025) |
| **Custom rendering** | Framework-specific component | NodeViewRenderer (ProseMirror) |

---

## Связанные документы

- [03-editor-core.md](03-editor-core.md) — Extension trait, NodeSpec, MarkSpec definitions
- [04-block-editor.md](04-block-editor.md) — block types, slash commands
- [06-framework-adapters.md](06-framework-adapters.md) — rendering custom extension UI
- [09-sdk-and-api.md](09-sdk-and-api.md) — npm packages, bundle sizes
