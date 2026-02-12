import { DragAndDrop, History, Placeholder, SlashCommands } from "./extensions/behaviors";
import { Blockquote } from "./extensions/blockquote";
import { BulletList, ListItem, TodoList } from "./extensions/bullet-list";
import { Callout } from "./extensions/callout";
import { CodeBlock } from "./extensions/code-block";
import { Columns } from "./extensions/columns";
import { Divider } from "./extensions/divider";
import { Embed } from "./extensions/embed";
import { File } from "./extensions/file";
import { Heading } from "./extensions/heading";
import { Image } from "./extensions/image";
import {
  Bold,
  Highlight,
  InlineCode,
  Italic,
  Link,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from "./extensions/marks";
import { Math } from "./extensions/math";
import { OrderedList } from "./extensions/ordered-list";
import { Paragraph } from "./extensions/paragraph";
import { Table } from "./extensions/table";
import { Toggle } from "./extensions/toggle";

export const MinimalPreset = [Paragraph, Bold, Italic, History];

export const DefaultPreset = [
  Paragraph,
  Heading.configure({ levels: [1, 2, 3] }),
  BulletList,
  OrderedList,
  ListItem,
  TodoList,
  CodeBlock,
  Image,
  Blockquote,
  Callout,
  Divider,
  Table,
  Toggle,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  InlineCode,
  Link,
  Highlight,
  History,
  Placeholder.configure({ text: 'Type "/" for commands...' }),
  DragAndDrop,
  SlashCommands,
];

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
