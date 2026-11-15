---
title: Lists
description: Bullet, numbered and task lists with nesting, indent and outdent, their commands, shortcuts and Markdown form.
packages: ["@gotipe/core"]
license: MIT
---

GoTipe has three kinds of list: bullet, numbered and task (to-do). A list is a container block whose children are items; an item holds rich text and can hold a nested list.

```demo
lists
```

## Extensions

| Extension | Nodes | Presets |
| --- | --- | --- |
| `BulletList` | `bulletList` | Default, Full |
| `OrderedList` | `orderedList` | Default, Full |
| `ListItem` | `listItem`, the item of bullet and numbered lists | Default, Full |
| `TodoList` | `todoList` and its item `todoItem` | Default, Full |

`MinimalPreset` has no lists. Add `ListItem` whenever you add `BulletList` or `OrderedList`:

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { BulletList, ListItem, OrderedList, Paragraph, TodoList } from "@gotipe/core/extensions";

const editor = await createEditor({
  extensions: [Paragraph, BulletList, OrderedList, ListItem, TodoList],
});
```

The list extensions have no options.

| Node | Content | Attribute | Type | Default |
| --- | --- | --- | --- | --- |
| `bulletList` | `listItem` children | — | — | — |
| `orderedList` | `listItem` children | `start` | `number` | `1` |
| `listItem` | Rich text and child blocks | — | — | — |
| `todoList` | `todoItem` children | — | — | — |
| `todoItem` | Rich text and child blocks | `checked` | `boolean` | `false` |

## Commands

```ts
editor.chain().toggleOrderedList({ start: 3 }).run();
editor.chain().indent().run();
```

| Command | Description |
| --- | --- |
| `toggleBulletList()` | Wraps the current paragraph, heading, quote, callout or code block in a bullet list. In a list of another kind, converts that whole list; in a bullet list, turns all its items back into paragraphs. |
| `toggleOrderedList(attrs?)` | The same for a numbered list. `attrs.start` sets the first number. |
| `toggleTodoList()` | The same for a task list. The items start unchecked. |
| `setBulletList()`, `setOrderedList(attrs?)`, `setTodoList()` | Like the toggles, but never unwrap a list of the same kind. The "/" menu uses them. |
| `indent()` | Moves the current item into a nested list (of the same kind) at the end of the previous item. Does nothing for the first item of a list. |
| `outdent()` | Moves a nested item out, right after the item that holds it. Items after it stay nested; an emptied nested list is removed. Does nothing at the top level. |
| `setBlockType("paragraph")` | Lifts the current item out of its list as a paragraph and splits the list around it. |
| `setBlockAttrs(blockId, { checked: true })` | Checks or unchecks a task. |
| `splitListItem()` | Splits the current item at the caret. |

## Keyboard and input rules

`Mod` is Cmd on macOS and Ctrl elsewhere.

| Key | Action |
| --- | --- |
| `Mod+Shift+8` | Toggle a bullet list |
| `Mod+Shift+7` | Toggle a numbered list |
| `Mod+Shift+9` | Toggle a task list |
| Tab | Indent the item |
| Shift+Tab | Outdent the item |
| Enter | New item. In an empty item, leave the list, or go up one level in a nested list. |
| Shift+Enter | Line break inside the item |
| Backspace at the start of an item with text | Turn the item into a paragraph |

Tab and Shift+Tab are bound by `BulletList` and work in all three kinds of list.

Input rules apply when you type the trigger at the start of an empty block:

| Type | Result |
| --- | --- |
| `- ` or `* ` | Bullet list |
| `1. ` (any number) | Numbered list that starts at that number |
| `[] ` | Task list |
| `[x] ` | Task list with the task checked; in an empty task, checks it |

In an empty item of a list, a trigger works like `setBulletList()`, `setOrderedList()` and `setTodoList()`: one of another kind turns the whole list into its kind, and one of the list's own kind is only removed, leaving the item, the other items and the numbering as they were.

The "/" menu lists **Bullet List**, **Numbered List** and **To-do List**. In the editor UI, the block handle drags one item; hold Alt while dragging to move the whole list.

## Nesting

Nesting is a list inside an item: `indent()` creates it, `outdent()` and Enter in an empty nested item take items out again. A nested list has the kind of its parent list when Tab creates it, but you can build any combination from code or Markdown, for example a bullet list under a task.

```json title="document.json"
{
  "version": 1,
  "blocks": [
    {
      "id": "tasks",
      "type": "todoList",
      "attrs": {},
      "content": null,
      "children": [
        {
          "id": "release",
          "type": "todoItem",
          "attrs": { "checked": false },
          "content": [{ "text": "Release", "marks": [] }],
          "children": [
            {
              "id": "steps",
              "type": "todoList",
              "attrs": {},
              "content": null,
              "children": [
                {
                  "id": "notes",
                  "type": "todoItem",
                  "attrs": { "checked": true },
                  "content": [{ "text": "Write notes", "marks": [] }],
                  "children": []
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Task lists

Each `todoItem` shows a checkbox that sets `checked`. The checkbox is disabled in read-only mode. Child blocks of a task, such as sub-tasks, are drawn under it, and clicking a child never moves the caret into its parent.

## Markdown

| Node | Markdown |
| --- | --- |
| `bulletList` | `-`, `*` or `+` items. The marker is kept in the `marker` attribute. |
| `orderedList` | `1.` or `1)` items. `start` and the delimiter (`delimiter` attribute) are kept. |
| `todoList` | `- [ ]` and `- [x]` items; a bare `- [ ]` is an empty task. Nested sub-tasks and nested plain lists are kept. |

Loose lists (items separated by blank lines) keep their `spread` attribute. When two lists of the same marker would merge into one, the writer switches the second one to another marker.

A Markdown item holds one paragraph followed by nested lists. Lists that do not fit that shape are kept byte for byte as a read-only raw block: lists mixing task and plain items, numbered task lists, and items with several paragraphs, code or quotes.

> [!NOTE]
> Child blocks of an item other than lists do not survive Markdown: a child paragraph is read back as a line of the item's text. `outdent()` and Shift+Tab do nothing for a top-level item; use Backspace at its start, Enter in an empty item or `setBlockType("paragraph")` to take it out of the list.

## Related

- [Text blocks](/docs/extensions/text-blocks): paragraphs, headings and line breaks.
- [Commands](/docs/concepts/commands): chaining and running commands.
- [Markdown](/docs/conversion/markdown): raw blocks and the full mapping.
- [Block editor](/docs/ui/block-editor): block handles and the "/" menu.
